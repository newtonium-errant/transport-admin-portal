-- ============================================================================
-- BACKGROUND TASKS SYSTEM
-- ============================================================================
-- Purpose: Track async tasks triggered by user actions
-- Design: Single attempt (no auto-retry), 7-day retention, then archive
-- ============================================================================

-- ============================================================================
-- MAIN TABLES
-- ============================================================================

-- Active tasks table (tasks from the last 7 days)
CREATE TABLE IF NOT EXISTS background_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What triggered this task
    entity_type TEXT NOT NULL,              -- 'client', 'appointment', 'driver', etc.
    entity_id UUID NOT NULL,                -- The ID of the entity
    entity_label TEXT,                      -- Human-readable label, e.g. "John Smith"

    -- Task details
    task_type TEXT NOT NULL,                -- 'calculate_drive_times', 'sync_quo', etc.
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'

    -- Results
    result JSONB,                           -- Success data (optional)
    error_message TEXT,                     -- Failure details (null if successful)

    -- Tracking
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,                 -- When processing began
    completed_at TIMESTAMPTZ,               -- When it finished (success or fail)
    created_by UUID REFERENCES auth.users(id),

    -- Dismissal (for hiding from notification panel while keeping history)
    dismissed_at TIMESTAMPTZ,               -- When user acknowledged/dismissed
    dismissed_by UUID REFERENCES auth.users(id),

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Archive table (tasks older than 7 days, same structure)
CREATE TABLE IF NOT EXISTS background_tasks_archive (
    id UUID PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    entity_label TEXT,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL,
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID,
    dismissed_at TIMESTAMPTZ,
    dismissed_by UUID,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- For n8n workers picking up pending tasks
CREATE INDEX IF NOT EXISTS idx_tasks_pending
    ON background_tasks(status, created_at)
    WHERE status = 'pending';

-- For frontend: get user's active (non-dismissed) failed tasks
CREATE INDEX IF NOT EXISTS idx_tasks_user_active
    ON background_tasks(created_by, status)
    WHERE status = 'failed' AND dismissed_at IS NULL;

-- For looking up tasks by entity (e.g., all tasks for a specific client)
CREATE INDEX IF NOT EXISTS idx_tasks_entity
    ON background_tasks(entity_type, entity_id);

-- For the archive cleanup job
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
    ON background_tasks(completed_at)
    WHERE status IN ('completed', 'failed');

-- Archive indexes (for historical lookups)
CREATE INDEX IF NOT EXISTS idx_archive_entity
    ON background_tasks_archive(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_archive_created_by
    ON background_tasks_archive(created_by, created_at);

-- ============================================================================
-- TASK TYPE REFERENCE (for documentation, not enforced)
-- ============================================================================
COMMENT ON TABLE background_tasks IS '
Task Types:
  - calculate_drive_times: Calculate drive times from all drivers to client address
  - sync_quo: Sync client to Quo (OpenPhone) via API
  - sync_appointment_quo: Sync appointment details to Quo
  - generate_invoice: Generate invoice PDF for appointment
  - send_notification: Send SMS/email notification

Status Flow:
  pending → processing → completed
  pending → processing → failed
';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to create a background task (called from n8n)
CREATE OR REPLACE FUNCTION create_background_task(
    p_entity_type TEXT,
    p_entity_id UUID,
    p_entity_label TEXT,
    p_task_type TEXT,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_task_id UUID;
BEGIN
    INSERT INTO background_tasks (
        entity_type,
        entity_id,
        entity_label,
        task_type,
        created_by
    ) VALUES (
        p_entity_type,
        p_entity_id,
        p_entity_label,
        p_task_type,
        p_created_by
    )
    RETURNING id INTO v_task_id;

    RETURN v_task_id;
END;
$$;

-- Function to mark task as processing (called when n8n picks up task)
CREATE OR REPLACE FUNCTION start_background_task(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE background_tasks
    SET
        status = 'processing',
        started_at = NOW()
    WHERE id = p_task_id
    AND status = 'pending';  -- Only if still pending (prevents double-processing)
END;
$$;

-- Function to mark task as completed
CREATE OR REPLACE FUNCTION complete_background_task(
    p_task_id UUID,
    p_result JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE background_tasks
    SET
        status = 'completed',
        result = p_result,
        completed_at = NOW()
    WHERE id = p_task_id;
END;
$$;

-- Function to mark task as failed
CREATE OR REPLACE FUNCTION fail_background_task(
    p_task_id UUID,
    p_error_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE background_tasks
    SET
        status = 'failed',
        error_message = p_error_message,
        completed_at = NOW()
    WHERE id = p_task_id;
END;
$$;

-- Function to dismiss a failed task (hide from notification panel)
CREATE OR REPLACE FUNCTION dismiss_background_task(
    p_task_id UUID,
    p_dismissed_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE background_tasks
    SET
        dismissed_at = NOW(),
        dismissed_by = COALESCE(p_dismissed_by, auth.uid())
    WHERE id = p_task_id
    AND status = 'failed'
    AND dismissed_at IS NULL;
END;
$$;

-- Function to dismiss all failed tasks for a user
CREATE OR REPLACE FUNCTION dismiss_all_failed_tasks(
    p_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_dismissed_count INTEGER;
BEGIN
    UPDATE background_tasks
    SET
        dismissed_at = NOW(),
        dismissed_by = COALESCE(p_user_id, auth.uid())
    WHERE status = 'failed'
    AND dismissed_at IS NULL
    AND (
        created_by = COALESCE(p_user_id, auth.uid())
        OR p_user_id IS NULL  -- Admin dismissing all
    );

    GET DIAGNOSTICS v_dismissed_count = ROW_COUNT;
    RETURN v_dismissed_count;
END;
$$;

-- ============================================================================
-- ARCHIVE FUNCTION (run daily via pg_cron or n8n scheduled workflow)
-- ============================================================================

CREATE OR REPLACE FUNCTION archive_old_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_archived_count INTEGER;
BEGIN
    -- Move completed/failed tasks older than 7 days to archive
    WITH moved AS (
        DELETE FROM background_tasks
        WHERE completed_at < NOW() - INTERVAL '7 days'
        AND status IN ('completed', 'failed')
        RETURNING *
    )
    INSERT INTO background_tasks_archive (
        id, entity_type, entity_id, entity_label, task_type,
        status, result, error_message, created_at, started_at,
        completed_at, created_by, dismissed_at, dismissed_by
    )
    SELECT
        id, entity_type, entity_id, entity_label, task_type,
        status, result, error_message, created_at, started_at,
        completed_at, created_by, dismissed_at, dismissed_by
    FROM moved;

    GET DIAGNOSTICS v_archived_count = ROW_COUNT;

    RETURN v_archived_count;
END;
$$;

-- ============================================================================
-- VIEWS FOR FRONTEND
-- ============================================================================

-- View: User's non-dismissed failed tasks (for notification badge/panel)
CREATE OR REPLACE VIEW user_failed_tasks AS
SELECT
    id,
    entity_type,
    entity_id,
    entity_label,
    task_type,
    status,
    error_message,
    created_at,
    completed_at,
    created_by
FROM background_tasks
WHERE status = 'failed'
AND dismissed_at IS NULL
ORDER BY completed_at DESC;

-- View: All failed tasks for admin/supervisor (includes user info)
-- Note: RLS will filter based on user role
CREATE OR REPLACE VIEW all_failed_tasks AS
SELECT
    bt.id,
    bt.entity_type,
    bt.entity_id,
    bt.entity_label,
    bt.task_type,
    bt.status,
    bt.error_message,
    bt.created_at,
    bt.completed_at,
    bt.created_by,
    u.raw_user_meta_data->>'full_name' AS created_by_name
FROM background_tasks bt
LEFT JOIN auth.users u ON bt.created_by = u.id
WHERE bt.status = 'failed'
AND bt.dismissed_at IS NULL
ORDER BY bt.completed_at DESC;

-- View: Summary counts by status (for dashboard widget)
CREATE OR REPLACE VIEW task_status_summary AS
SELECT
    created_by,
    COUNT(*) FILTER (WHERE status = 'failed' AND dismissed_at IS NULL) AS failed_count,
    COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '24 hours') AS completed_24h
FROM background_tasks
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY created_by;

-- View: Failed tasks count for all users (admin dashboard widget)
CREATE OR REPLACE VIEW failed_tasks_summary AS
SELECT
    COUNT(*) AS total_failed,
    COUNT(DISTINCT created_by) AS users_with_failures,
    MIN(completed_at) AS oldest_failure,
    MAX(completed_at) AS newest_failure
FROM background_tasks
WHERE status = 'failed'
AND dismissed_at IS NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE background_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_tasks_archive ENABLE ROW LEVEL SECURITY;

-- Users can view their own tasks
CREATE POLICY "Users can view own tasks"
    ON background_tasks
    FOR SELECT
    USING (created_by = auth.uid());

-- Users can update (dismiss) their own failed tasks
CREATE POLICY "Users can dismiss own tasks"
    ON background_tasks
    FOR UPDATE
    USING (created_by = auth.uid() AND status = 'failed')
    WITH CHECK (created_by = auth.uid());

-- Supervisors/Admins can view all tasks (check role in app_metadata)
-- Note: Adjust the role check based on your auth setup
CREATE POLICY "Admins can view all tasks"
    ON background_tasks
    FOR SELECT
    USING (
        auth.jwt()->>'role' IN ('admin', 'supervisor')
        OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'supervisor')
    );

-- Admins can dismiss any task
CREATE POLICY "Admins can dismiss any task"
    ON background_tasks
    FOR UPDATE
    USING (
        status = 'failed'
        AND (
            auth.jwt()->>'role' IN ('admin', 'supervisor')
            OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'supervisor')
        )
    );

-- Service role (n8n) can do everything
CREATE POLICY "Service role full access"
    ON background_tasks
    FOR ALL
    USING (auth.role() = 'service_role');

-- Archive: users can view their own archived tasks
CREATE POLICY "Users can view own archived tasks"
    ON background_tasks_archive
    FOR SELECT
    USING (created_by = auth.uid());

-- Service role can manage archive
CREATE POLICY "Service role archive access"
    ON background_tasks_archive
    FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================================
-- ENABLE REALTIME (for frontend notifications)
-- ============================================================================

-- Enable realtime for the background_tasks table
ALTER PUBLICATION supabase_realtime ADD TABLE background_tasks;

-- ============================================================================
-- SAMPLE DATA (for testing - remove in production)
-- ============================================================================

-- Uncomment to insert test data:
/*
INSERT INTO background_tasks (entity_type, entity_id, entity_label, task_type, status, created_by)
VALUES
    ('client', gen_random_uuid(), 'John Smith', 'calculate_drive_times', 'pending', NULL),
    ('client', gen_random_uuid(), 'Jane Doe', 'sync_quo', 'processing', NULL),
    ('client', gen_random_uuid(), 'Bob Wilson', 'sync_quo', 'failed', NULL);

UPDATE background_tasks
SET error_message = 'Quo API returned 429: Rate limit exceeded'
WHERE status = 'failed';
*/
