-- ============================================================================
-- Migration 26: Background Tasks System
-- ============================================================================
-- Purpose: Track async operations triggered by user actions
-- Created: 2026-02-28
--
-- Pattern: "respond early, continue processing"
--   1. Workflow saves core data to DB
--   2. Creates background_tasks rows for slow operations
--   3. Responds to frontend immediately
--   4. Continues processing (Google Maps, OpenPhone, Calendar)
--   5. Updates background_tasks as each operation completes/fails
--   6. Frontend polls or subscribes for failure notifications
--
-- n8n Usage: Basic Supabase CRUD operations only (create, update, getAll).
--   No PL/pgSQL functions or views — n8n cannot call them.
--
-- Frontend Usage: task-monitor.js polls via n8n webhook or Supabase Realtime.
--   task-notifications.js renders failure toasts and slide-out panel.
--
-- Task Types:
--   Client:      calculate_distances, add_openphone_contact
--   Appointment: sync_calendar, delete_calendar, calculate_appointment_distance,
--                send_sms_notification
--   Driver:      create_driver_calendar, calculate_driver_distances,
--                recalculate_clinic_preferences
--
-- Status Flow:
--   pending → processing → completed
--   pending → processing → failed
--   failed  → pending (auto-retry, up to max_retries)
--   failed  → dismissed (admin dismisses, prevents auto-retry)
--
-- Data Retention:
--   Active table: tasks stay for 7 days after completion/failure
--   Archive table: receives moved tasks, kept permanently
--   Archival: scheduled n8n workflow moves old tasks via basic CRUD
-- ============================================================================

-- ============================================================================
-- MAIN TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS background_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What entity triggered this task
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_label TEXT,

    -- What operation to perform
    task_type TEXT NOT NULL,

    -- Status lifecycle
    status TEXT NOT NULL DEFAULT 'pending',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Who triggered it
    created_by INTEGER,

    -- Result / error tracking
    result JSONB,
    error_message TEXT,

    -- Retry support
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,

    -- Admin review / dismissal
    dismissed_at TIMESTAMPTZ,
    dismissed_by INTEGER,

    -- Constraints
    CONSTRAINT chk_bg_task_status
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT chk_bg_task_entity_type
        CHECK (entity_type IN ('client', 'appointment', 'driver')),
    CONSTRAINT chk_bg_task_retry
        CHECK (retry_count >= 0)
);

COMMENT ON TABLE background_tasks IS
    'Tracks async operations spawned by user actions. Frontend monitors for failures via polling or Supabase Realtime.';
COMMENT ON COLUMN background_tasks.entity_type IS
    'Type of entity that triggered this task: client, appointment, or driver.';
COMMENT ON COLUMN background_tasks.entity_id IS
    'Identifier of the triggering entity: knumber for clients, UUID for appointments, integer ID (as text) for drivers.';
COMMENT ON COLUMN background_tasks.entity_label IS
    'Human-readable label for display, e.g. "John Smith (K0001234)".';
COMMENT ON COLUMN background_tasks.task_type IS
    'Operation to perform: calculate_distances, add_openphone_contact, sync_calendar, delete_calendar, calculate_appointment_distance, send_sms_notification, create_driver_calendar, calculate_driver_distances, recalculate_clinic_preferences.';
COMMENT ON COLUMN background_tasks.status IS
    'Task lifecycle: pending → processing → completed/failed. Failed tasks may be retried or dismissed.';
COMMENT ON COLUMN background_tasks.created_by IS
    'users.id of the user whose action spawned this task.';
COMMENT ON COLUMN background_tasks.result IS
    'Success payload as JSONB, e.g. {"distances_calculated": 5, "api_calls": 3}.';
COMMENT ON COLUMN background_tasks.error_message IS
    'Human-readable error description on failure.';
COMMENT ON COLUMN background_tasks.retry_count IS
    'Number of times this task has been retried. Incremented on each retry attempt.';
COMMENT ON COLUMN background_tasks.max_retries IS
    'Maximum retry attempts for this task. Default 3. Auto-retry query checks retry_count < max_retries.';
COMMENT ON COLUMN background_tasks.dismissed_at IS
    'When an admin dismissed this failure. Prevents auto-retry from picking it up.';
COMMENT ON COLUMN background_tasks.dismissed_by IS
    'users.id of the admin who dismissed the failure.';

-- ============================================================================
-- ARCHIVE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS background_tasks_archive (
    id UUID PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_label TEXT,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by INTEGER,
    result JSONB,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    dismissed_at TIMESTAMPTZ,
    dismissed_by INTEGER,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE background_tasks_archive IS
    'Completed/failed tasks moved here after 7 days. Kept permanently for historical reference.';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- n8n auto-retry or processing query: find pending tasks to pick up
CREATE INDEX IF NOT EXISTS idx_bg_tasks_pending
    ON background_tasks(status, created_at)
    WHERE status = 'pending';

-- Frontend polling: find undismissed failed tasks for a specific user
CREATE INDEX IF NOT EXISTS idx_bg_tasks_user_failed
    ON background_tasks(created_by, status)
    WHERE status = 'failed' AND dismissed_at IS NULL;

-- Lookup: all tasks for a given entity (e.g. show tasks for client K0001234)
CREATE INDEX IF NOT EXISTS idx_bg_tasks_entity
    ON background_tasks(entity_type, entity_id);

-- Archival query: find tasks eligible for moving to archive
CREATE INDEX IF NOT EXISTS idx_bg_tasks_completed_at
    ON background_tasks(completed_at)
    WHERE status IN ('completed', 'failed');

-- Auto-retry query: find retryable failed tasks
-- Query pattern: WHERE status = 'failed' AND retry_count < max_retries AND dismissed_at IS NULL
CREATE INDEX IF NOT EXISTS idx_bg_tasks_retryable
    ON background_tasks(status, retry_count, completed_at)
    WHERE status = 'failed' AND dismissed_at IS NULL;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify background_tasks table and columns
SELECT 'background_tasks columns' AS check_item;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'background_tasks'
ORDER BY ordinal_position;

-- Verify background_tasks_archive table and columns
SELECT 'background_tasks_archive columns' AS check_item;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'background_tasks_archive'
ORDER BY ordinal_position;

-- Verify both tables exist
SELECT 'tables exist' AS check_item;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('background_tasks', 'background_tasks_archive');

-- Verify indexes
SELECT 'indexes' AS check_item;
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'background_tasks'
ORDER BY indexname;

-- Verify CHECK constraints
SELECT 'constraints' AS check_item;
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'background_tasks'
  AND constraint_type = 'CHECK';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

SELECT 'Migration 26 completed: background_tasks + background_tasks_archive created' AS status;
