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
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- For n8n workers picking up pending tasks
CREATE INDEX IF NOT EXISTS idx_tasks_pending
    ON background_tasks(status, created_at)
    WHERE status = 'pending';

-- For frontend: get user's active tasks
CREATE INDEX IF NOT EXISTS idx_tasks_user_active
    ON background_tasks(created_by, status)
    WHERE status IN ('pending', 'processing', 'failed');

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
        completed_at, created_by
    )
    SELECT
        id, entity_type, entity_id, entity_label, task_type,
        status, result, error_message, created_at, started_at,
        completed_at, created_by
    FROM moved;

    GET DIAGNOSTICS v_archived_count = ROW_COUNT;

    RETURN v_archived_count;
END;
$$;

-- ============================================================================
-- VIEWS FOR FRONTEND
-- ============================================================================

-- View: User's pending and failed tasks (for notification badge)
CREATE OR REPLACE VIEW user_active_tasks AS
SELECT
    id,
    entity_type,
    entity_id,
    entity_label,
    task_type,
    status,
    error_message,
    created_at,
    created_by
FROM background_tasks
WHERE status IN ('pending', 'processing', 'failed')
ORDER BY
    CASE status
        WHEN 'failed' THEN 1
        WHEN 'processing' THEN 2
        WHEN 'pending' THEN 3
    END,
    created_at DESC;

-- View: Summary counts by status (for dashboard)
CREATE OR REPLACE VIEW task_status_summary AS
SELECT
    created_by,
    COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
    COUNT(*) FILTER (WHERE status = 'processing') AS processing_count,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
    COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 hour') AS completed_last_hour
FROM background_tasks
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY created_by;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE background_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_tasks_archive ENABLE ROW LEVEL SECURITY;

-- Users can only see their own tasks
CREATE POLICY "Users can view own tasks"
    ON background_tasks
    FOR SELECT
    USING (created_by = auth.uid());

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
