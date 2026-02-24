# Database Schema Reference

## Overview

Complete reference for all database tables in the RRTS Transport Admin Portal. The system uses Supabase PostgreSQL for data storage with timezone-aware timestamps, RBAC enforcement, and comprehensive audit logging.

**For database conventions and standards, see:** `database/docs/DATABASE_SCHEMA_STANDARDS.md`

## users

System users with JWT authentication.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | integer | PRIMARY KEY, AUTO INCREMENT | User identifier |
| `username` | text | UNIQUE, NOT NULL | Email address (login) |
| `password_hash` | text | NOT NULL | Hash (format: `salt:hash`) |
| `role` | text | DEFAULT 'user' | admin, supervisor, booking_agent, driver, client |
| `full_name` | text | NOT NULL | Full display name |
| `active` | boolean | DEFAULT true | Account active status |
| `last_login` | timestamp with time zone | | Last successful login |
| `last_activity` | timestamp with time zone | | Last activity timestamp |
| `failed_login_attempts` | integer | DEFAULT 0 | Failed login counter |
| `account_locked_until` | timestamp with time zone | | Lockout expiration |
| `refresh_token` | text | | Current refresh token (JWT) |
| `refresh_token_expires` | timestamp with time zone | | Refresh token expiration |
| `token_jti` | uuid | | JWT ID for token revocation |
| `driver_id` | integer | FK → drivers.id | Links driver-role users to driver record |
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
| `clinic_id` | integer | | FK → destinations.id (if applicable) |
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
| **Appointment Type** | | | |
| `appointment_type` | text | DEFAULT 'round_trip', CHECK IN ('round_trip','one_way','support') | Type of appointment |
| `trip_direction` | text | CHECK: only when type='one_way' | Direction for one-way trips: to_clinic or to_home |
| `event_name` | text | CHECK: only when type='support' | Name/description of support event |
| `created_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |

### Appointment Type Values

- `round_trip` - Standard round-trip appointment (default for all existing rows)
- `one_way` - One-way trip; requires `trip_direction` (to_clinic or to_home)
- `support` - Support event; uses sentinel client K0000 "Support Event (No Client)"; optional `event_name`

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
| `name` | text | NOT NULL | Legal/full name |
| `first_name` | text | | First name |
| `last_name` | text | | Last name |
| `email` | text | NOT NULL | Email address |
| `phone` | text | | Personal phone number |
| `work_phone` | text | | Work phone number |
| `gender` | text | | Driver gender |
| `is_male` | boolean | DEFAULT false | Legacy gender flag |
| **Scheduling** | | | |
| `weekly_hours` | jsonb | | Default weekly work schedule (day-of-week hours) |
| `schedule_pattern` | jsonb | | Rotating schedule pattern (see structure below). Null = use weekly_hours |
| `workload_preference` | text | DEFAULT 'normal' | Workload preference level |
| `workload_percentage` | integer | DEFAULT 100 | Workload percentage capacity |
| **Vehicle & Pay** | | | |
| `vehicle_description` | text | | Vehicle description |
| `pay_tier` | integer | DEFAULT 2 | Pay tier: 1=50%, 2=33% (default), 3=25% |
| `mileage_ytd` | jsonb | DEFAULT '{}' | Year-to-date mileage tracking |
| **Home Address** | | | |
| `home_address` | text | | Driver home street address |
| `home_city` | text | | Driver home city |
| `home_province` | text | DEFAULT 'NS' | Driver home province |
| `home_postal_code` | text | | Driver home postal code |
| `home_coordinates` | point | | Home location (lat, lng) for distance calc |
| **Clinic Preferences** | | | |
| `clinic_preferences` | jsonb | DEFAULT '{}' | Clinic preferences with distances keyed by clinic_id (see structure below). Empty/null = all clinics |
| **Google Calendar** | | | |
| `google_calendar_id` | text | | Google Calendar ID (auto-created) |
| `preferred_calendar_type` | text | DEFAULT 'google' | Calendar type preference |
| `google_calendar_connected` | boolean | DEFAULT false | Whether Google Calendar is connected |
| `google_calendar_connected_at` | timestamp without time zone | | When calendar was connected |
| `google_calendar_access_token` | text | | OAuth access token |
| `google_calendar_refresh_token` | text | | OAuth refresh token |
| `google_calendar_calendar_id` | text | DEFAULT 'primary' | Selected calendar within Google account |
| `calendar_ical_url` | text | | iCal feed URL for external calendar sync |
| **Status** | | | |
| `active` | boolean | DEFAULT true | Driver active status |
| `created_at` | timestamp without time zone | DEFAULT now() | |
| `updated_at` | timestamp without time zone | DEFAULT now() | |

### Google Calendar

- Calendar auto-created on driver creation
- Calendar ID stored in `google_calendar_id`
- Events synced when appointments assigned/updated
- OAuth tokens stored for API access; `google_calendar_calendar_id` selects which calendar to use

### schedule_pattern Structure (JSONB)

```json
{
  "type": "rotating",
  "anchor_date": "2026-01-05",
  "cycle_days": 14,
  "work_days": [1, 2, 3, 4, 5, 8, 9, 10],
  "default_start": "08:00",
  "default_end": "17:00"
}
```

Null means fall back to `weekly_hours` for default schedule.

### clinic_preferences Structure (JSONB)

```json
{
  "2": {
    "preferred": true,
    "distance_km": 45.2,
    "drive_time_min": 38
  },
  "5": {
    "preferred": true,
    "distance_km": 12.8,
    "drive_time_min": 15
  },
  "8": {
    "preferred": false,
    "distance_km": 95.0,
    "drive_time_min": 72
  }
}
```

- Keyed by `clinic_id` (as string)
- `preferred`: whether the driver is willing to service this clinic
- `distance_km`: pre-computed Google Maps driving distance from `home_coordinates` to clinic `map_coordinates`
- `drive_time_min`: pre-computed Google Maps driving time in minutes
- All active clinics get entries (with distances); `preferred` flag controls willingness
- Empty object `{}` or null means driver is willing to service **all** clinics (no restriction)
- Deactivated clinics: stored preferences silently ignored by UI/filtering
- Minimum 1 clinic must be preferred when saving preferences

## destinations

Clinic/destination locations with coordinates. The actual Supabase table name is `destinations`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | integer | PRIMARY KEY, AUTO INCREMENT | Destination ID |
| `name` | varchar(255) | NOT NULL | Clinic/destination name |
| `address` | varchar(255) | | Street address |
| `city` | varchar(100) | | City |
| `province` | varchar(2) | | Province |
| `postal_code` | varchar(7) | | Postal code |
| `phone` | text | | Phone number |
| `notes` | text | | Notes |
| `map_coordinates` | point | | Lat/long coordinates |
| `active` | boolean | DEFAULT true | Destination active status |
| `created_at` | timestamp with time zone | DEFAULT CURRENT_TIMESTAMP | |

**NOTE:** Some API endpoints (e.g., `/get-clinic-locations`) transform these columns in their n8n workflow response, renaming `name` to `clinic_name` and composing `address`, `city`, `province`, `postal_code` into a single `full_address` field. When configuring Supabase nodes in n8n workflows, always use the actual column names above.

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

Driver availability tracking. Supports both unavailability blocks (`time_off`) and override availability windows (`override_available`).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | integer | PRIMARY KEY, AUTO INCREMENT | Time off ID |
| `driver_id` | integer | FK → drivers.id | Driver |
| `start_date` | date | NOT NULL | Start date |
| `end_date` | date | NOT NULL | End date |
| `start_time` | time without time zone | | Start time (for partial-day entries) |
| `end_time` | time without time zone | | End time (for partial-day entries) |
| `all_day` | boolean | DEFAULT true | Whether entry covers the full day |
| `entry_type` | text | NOT NULL, DEFAULT 'time_off' | `time_off` = unavailable block, `override_available` = available outside default hours |
| `reason` | text | | Reason for the entry (optional for override_available) |
| `notes` | text | | Additional notes |
| `created_by` | integer | | User ID who created the entry |
| `created_at` | timestamp without time zone | DEFAULT now() | |

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
- `google_maps_api_key` - Google Maps Distance Matrix API key for calculating driving distances between drivers and clinics

## Schema Migrations

SQL migration files in `database/sql/` directory (run manually in Supabase):

1. `01_fix_foreign_key_and_delete_test_users.sql` - FK constraints cleanup
2. `02_add_jwt_session_columns.sql` - JWT auth fields to users table
3. `03_add_clinic_travel_times.sql` - JSONB travel times to clients
4. `06_create_audit_logs_table.sql` - Audit logging table
5. `07_add_appointment_deletion_cancellation_fields.sql` - Soft delete support
6. `08_add_secondary_address_fields.sql` - Secondary address to clients
7. `09_add_pickup_address_field.sql` - Pickup address to appointments
8. `09_add_driver_instructions_field.sql` - Driver instructions to appointments
9. `10_add_managed_by_field.sql` - Audit fields to appointments
10. `11_add_invoices_table.sql` - Invoices table for finance module
11. `11b_add_driver_pay_mileage_columns.sql` - Pay tier, home address, YTD mileage to drivers
12. `12_add_calendar_ical_url.sql` - Calendar iCal URL to drivers
13. `12b_add_driver_mileage_to_appointments.sql` - Driver mileage fields to appointments
14. `13_seed_app_config_finance.sql` - Seed finance config values
15. `14_add_driver_travel_times_to_clients.sql` - Driver travel times to clients
16. `15_driver_scheduling.sql` - Driver scheduling: entry_type & created_by on driver_time_off, schedule_pattern on drivers, driver_id FK on users
17. `16_driver_clinic_preferences.sql` - Clinic preferences JSONB on drivers (enabled flags + pre-computed distances)
18. `17_background_tasks_schema.sql` - Background tasks system (tasks, archive, functions, views)
19. `18_seed_app_config_google_maps.sql` - Seed Google Maps API key into app_config for centralized management
20. `19_appointment_types.sql` - Appointment types (round_trip, one_way, support), sentinel client K0000, CHECK constraints
21. `20_driver_time_off_reason_nullable.sql` - Make driver_time_off.reason nullable for override_available entries

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
- **K0000** is a sentinel record ("Support Event (No Client)") reserved for support-type appointments; do not use for regular clients

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
