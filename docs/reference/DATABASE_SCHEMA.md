# Database Schema Reference

## Overview

Complete reference for all database tables in the RRTS Transport Admin Portal. The system uses Supabase PostgreSQL for data storage with timezone-aware timestamps, RBAC enforcement, and comprehensive audit logging.

**For database conventions and standards, see:** `database/docs/DATABASE_SCHEMA_STANDARDS.md`

## users

System users with JWT authentication.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PRIMARY KEY, DEFAULT uuid_generate_v4() | User identifier |
| `username` | varchar(255) | UNIQUE, NOT NULL | Email address (login) |
| `password_hash` | text | NOT NULL | PBKDF2 hash (format: `salt:hash`) |
| `role` | varchar(50) | NOT NULL | admin, supervisor, booking_agent, driver, client |
| `full_name` | varchar(255) | NOT NULL | Full display name |
| `active` | boolean | DEFAULT true | Account active status |
| `last_login` | timestamp with time zone | | Last successful login |
| `last_activity` | timestamp with time zone | | Last activity timestamp |
| `failed_login_attempts` | integer | DEFAULT 0 | Failed login counter |
| `account_locked_until` | timestamp with time zone | | Lockout expiration |
| `refresh_token` | text | | Current refresh token (JWT) |
| `refresh_token_expires` | timestamp with time zone | | Refresh token expiration |
| `token_jti` | uuid | | JWT ID for token revocation |
| `created_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |

**Key Patterns**:
- Password format: `salt:hash` (PBKDF2, 100,000 iterations)
- Account locks after 5 failed login attempts for 15 minutes
- Refresh tokens rotated on each refresh
- **NOTE**: Table name is `users` (NOT `admin_users`)

## clients

Client records with K numbers.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | integer | PRIMARY KEY, AUTO INCREMENT | Internal ID |
| `knumber` | varchar(10) | UNIQUE, NOT NULL | Client identifier (e.g., "K1234") |
| `firstname` | varchar(100) | NOT NULL | First name |
| `lastname` | varchar(100) | NOT NULL | Last name |
| `phone` | varchar(20) | | Primary phone number |
| `email` | varchar(255) | | Email address |
| **Primary Address** | | | |
| `civicaddress` | varchar(255) | | Street address |
| `city` | varchar(100) | | City |
| `prov` | varchar(2) | | Province (NS, NB, PE, NL) |
| `postalcode` | varchar(7) | | Postal code (A1B 2C3) |
| `mapaddress` | text | | Full formatted address for mapping |
| **Secondary Address** | | | |
| `secondary_civic_address` | varchar(255) | | Alternate street address |
| `secondary_city` | varchar(100) | | Alternate city |
| `secondary_province` | varchar(2) | | Alternate province |
| `secondary_postal_code` | varchar(7) | | Alternate postal code |
| `secondary_address_notes` | text | | Notes about secondary address usage |
| **Emergency Contact** | | | |
| `emergency_contact_name` | varchar(255) | | Emergency contact name |
| `emergency_contact_number` | varchar(20) | | Emergency contact phone |
| **Settings** | | | |
| `appointment_length` | integer | DEFAULT 120 | Default appointment duration (minutes) |
| `clinic_travel_times` | jsonb | | Pre-calculated travel times to clinics |
| `active` | boolean | DEFAULT true | Client active status |
| `notes` | text | | General notes about client |
| `created_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |

### clinic_travel_times Structure (JSONB)

```json
{
  "Clinic Name": {
    "primary": {
      "duration_minutes": 30,
      "distance_km": 5.2,
      "address": "123 Main St, City, NS, A1B 2C3"
    },
    "secondary": {
      "duration_minutes": 35,
      "distance_km": 8.1,
      "address": "456 Alt St, City, NS, A1B 2C3"
    }
  }
}
```

## appointments

Appointments with Google Calendar integration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | integer | PRIMARY KEY, AUTO INCREMENT | Appointment ID |
| `knumber` | varchar(10) | FK → clients.knumber | Client identifier |
| `driver_id` | integer | FK → drivers.id | Assigned driver |
| `driver_name` | varchar(255) | | Driver name (denormalized for performance) |
| **Timing** | | | |
| `appt_date` | date | NOT NULL | Appointment date |
| `appt_time` | time | NOT NULL | Appointment time |
| `pickup_time` | timestamp with time zone | | Calculated pickup time |
| `dropoff_time` | timestamp with time zone | | Calculated drop-off time |
| `appt_length` | integer | NOT NULL | Duration in minutes |
| `transit_time` | integer | | Transit time to clinic (minutes) |
| **Location** | | | |
| `destination` | varchar(255) | | Clinic address |
| `destination_name` | varchar(255) | | Clinic name |
| `pickup_address` | text | | Pickup address (client's primary or secondary) |
| `clinic_id` | integer | | FK → clinic_locations.id (if applicable) |
| **Status** | | | |
| `status` | varchar(50) | DEFAULT 'scheduled' | scheduled, completed, cancelled, no_show |
| `deleted` | boolean | DEFAULT false | Soft delete flag |
| `deleted_at` | timestamp with time zone | | Soft delete timestamp |
| `deleted_by` | uuid | | User who deleted |
| `deletion_reason` | text | | Reason for deletion/cancellation |
| **Notes** | | | |
| `notes` | text | | General appointment notes |
| `driver_instructions` | text | | Special instructions for driver |
| `scheduling_notes` | text | | Internal scheduling notes |
| **Calendar** | | | |
| `google_calendar_event_id` | varchar(255) | | Google Calendar event ID |
| **Audit** | | | |
| `managed_by` | integer | FK → users.id | User who created/manages |
| `managed_by_name` | varchar(255) | | Manager name (denormalized) |
| `created_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |

### Status Values

- `scheduled` - Active appointment
- `completed` - Successfully completed
- `cancelled` - Cancelled by user
- `no_show` - Client did not show up

### Soft Delete Behavior

- `deleted=true` hides from active lists
- Data preserved for audit/reporting
- Use `/unarchive-appointment` to restore

## drivers

Drivers with Google Calendar integration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | integer | PRIMARY KEY, AUTO INCREMENT | Driver ID |
| `driver_name` | varchar(255) | NOT NULL | Full name |
| `phone` | varchar(20) | | Phone number |
| `email` | varchar(255) | | Email address |
| `google_calendar_id` | varchar(255) | | Google Calendar ID (auto-created) |
| `active` | boolean | DEFAULT true | Driver active status |
| `created_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |

### Google Calendar

- Calendar auto-created on driver creation
- Calendar ID stored in `google_calendar_id`
- Events synced when appointments assigned/updated

## clinic_locations

Clinic destinations with coordinates.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | integer | PRIMARY KEY, AUTO INCREMENT | Clinic ID |
| `clinic_name` | varchar(255) | NOT NULL | Clinic name |
| `full_address` | text | NOT NULL | Complete address |
| `map_coordinates` | point | | Lat/long coordinates |
| `active` | boolean | DEFAULT true | Clinic active status |
| `created_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |

## audit_logs

System audit trail for security events.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PRIMARY KEY, DEFAULT uuid_generate_v4() | Log entry ID |
| `event_type` | varchar(100) | NOT NULL | Event category |
| `event_description` | text | NOT NULL | Event details |
| `user_id` | uuid | FK → users.id | User who triggered event |
| `user_role` | varchar(50) | | User role at time of event |
| `affected_resource` | varchar(255) | | Resource affected (table.id) |
| `old_value` | jsonb | | Previous value (for updates) |
| `new_value` | jsonb | | New value (for updates) |
| `ip_address` | varchar(45) | | User IP address |
| `timestamp` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |

### Event Types

- `user_login`, `user_logout`, `failed_login`
- `password_reset`, `password_change`
- `appointment_create`, `appointment_update`, `appointment_delete`
- `client_create`, `client_update`
- `driver_create`, `driver_update`
- `user_create`, `user_update`, `user_delete`

## driver_time_off

Driver availability tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | integer | PRIMARY KEY, AUTO INCREMENT | Time off ID |
| `driver_id` | integer | FK → drivers.id, NOT NULL | Driver |
| `start_date` | date | NOT NULL | Start of time off |
| `end_date` | date | NOT NULL | End of time off |
| `reason` | text | | Reason for time off |
| `created_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |

## app_config

System configuration settings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | varchar(255) | PRIMARY KEY | Config key |
| `value` | text | | Config value (JSON or plain text) |
| `description` | text | | Config description |
| `updated_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |

### Common Keys

- `system_timezone` - "America/Halifax"
- `appointment_reminder_hours` - Hours before appointment to send reminder
- `max_login_attempts` - Maximum failed login attempts (5)
- `account_lockout_minutes` - Lockout duration (15)

## Schema Migrations

SQL migration files in `sql/` directory (run manually in Supabase):

1. `01_fix_foreign_key_and_delete_test_users.sql` - FK constraints cleanup
2. `02_add_jwt_session_columns.sql` - JWT auth fields to users table
3. `03_add_clinic_travel_times.sql` - JSONB travel times to clients
4. `06_create_audit_logs_table.sql` - Audit logging table
5. `07_add_appointment_deletion_cancellation_fields.sql` - Soft delete support
6. `08_add_secondary_address_fields.sql` - Secondary address to clients
7. `09_add_pickup_address_field.sql` - Pickup address to appointments
8. `09_add_driver_instructions_field.sql` - Driver instructions to appointments
9. `10_add_managed_by_field.sql` - Audit fields to appointments

### Migration Process

1. Open Supabase SQL Editor
2. Load migration file content
3. Review changes carefully
4. Execute migration
5. Verify changes in Table Editor
6. Test affected workflows

## Database Conventions

### Timestamps

- Always `timestamp with time zone` type
- Stored as UTC in database
- Displayed in AST/ADT (Halifax time) by frontend
- n8n workflows run in Halifax timezone

### Primary Keys

- New tables: Use `uuid` with `uuid_generate_v4()`
- Legacy tables: `integer` with AUTO INCREMENT
- Never use composite primary keys

### Foreign Keys

- Always define FK constraints for referential integrity
- Use `ON DELETE CASCADE` sparingly (prefer soft deletes)
- Denormalize frequently-joined data for performance (e.g., `driver_name`)

### K Numbers

- Format: "K" + 4-digit number (e.g., "K0001", "K1234")
- Unique identifier for clients
- Never reuse K numbers

### Password Hashing

- Algorithm: Custom `simpleHash()` function (PBKDF2 not available in n8n)
- Iterations: Single pass
- Format: `salt:hash`
- Salt: ~30+ characters, generated via `Math.random().toString(36)`
- Hash: Bitwise operation-based custom hash, converted to base36
- **Note**: All auth workflows (Login, Create User, Password Reset, Change Password) use identical hash implementation for compatibility

### Boolean Defaults

- `active` columns default to `true`
- `deleted` columns default to `false`
- Always use boolean type, never integers (0/1)

### JSON/JSONB Usage

- Use `jsonb` (not `json`) for better performance
- Index frequently-queried JSON fields
- Document structure in comments or CLAUDE.md

### Soft Deletes

- Use `deleted` boolean + `deleted_at` timestamp
- Never hard delete appointments (data loss)
- OK to hard delete test data
- Include `deletion_reason` for audit

## Related Documentation

- **DATABASE_SCHEMA_STANDARDS.md** - Database conventions and standards
- **SUPABASE_NODE_QUICK_REFERENCE.md** - Supabase query patterns for n8n
- **CLAUDE.md** - Project overview and architecture
