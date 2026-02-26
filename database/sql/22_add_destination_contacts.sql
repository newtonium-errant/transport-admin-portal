-- Migration 22: Add contacts JSONB and email to destinations
--
-- Adds support for multiple contacts per destination.
-- JSONB structure: [{name: string, phone: string, email: string, type: string}]
-- Supported types: 'main', 'billing', 'scheduling', 'other'
--
-- Also adds email (text) for primary email and updated_at for modification tracking.
-- Existing phone values are migrated into the contacts JSONB array.

-- 1. Add contacts JSONB column (default empty array)
ALTER TABLE destinations
ADD COLUMN IF NOT EXISTS contacts jsonb DEFAULT '[]'::jsonb;

-- 2. Add email text column
ALTER TABLE destinations
ADD COLUMN IF NOT EXISTS email text;

-- 3. Add updated_at timestamp column
ALTER TABLE destinations
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP;

-- 4. Migrate existing phone values into contacts JSONB
UPDATE destinations
SET contacts = jsonb_build_array(
  jsonb_build_object(
    'name', 'Main',
    'phone', phone,
    'email', '',
    'type', 'main'
  )
)
WHERE phone IS NOT NULL
  AND TRIM(phone) != ''
  AND (contacts IS NULL OR contacts = '[]'::jsonb);

-- 5. Add comment documenting the JSONB structure
COMMENT ON COLUMN destinations.contacts IS 'Array of contact objects: [{name: string, phone: string, email: string, type: "main"|"billing"|"scheduling"|"other"}]';
