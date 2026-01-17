# Operations Page - File Tracking

This file tracks all files created for the Operations page feature.
All files are in the `developing/` folder (gitignored) and need to be moved to the main project when ready.

**Created:** 2025-01-17
**Feature:** 2-Week Driver Assignment Calendar

---

## Files to Move to Production

### Frontend Files
| File | Destination | Description |
|------|-------------|-------------|
| `TEST-operations.html` | `operations.html` (root) | Main Operations page HTML |
| `js/pages/TEST-operations.js` | `js/pages/operations.js` | Operations page controller |

### Database Migrations
| File | Destination | Description |
|------|-------------|-------------|
| `database/sql/15_create_driver_clinic_assignments.sql` | `database/sql/` | Driver-clinic junction table |
| `database/sql/16_create_operations_draft_assignments.sql` | `database/sql/` | Draft assignments table |

### n8n Workflow JSONs
| File | Description |
|------|-------------|
| `TEST Workflow Copies/TEST - OPS - Get Operations Data.json` | Amalgamated data endpoint |
| `TEST Workflow Copies/TEST - OPS - Save Draft Assignment.json` | Auto-save drafts |
| `TEST Workflow Copies/TEST - OPS - Submit Weekly Schedule.json` | Finalize assignments |
| `TEST Workflow Copies/TEST - OPS - Get Driver Clinic Assignments.json` | Read driver-clinic junction |
| `TEST Workflow Copies/TEST - OPS - Update Driver Clinic Assignments.json` | Update driver-clinic junction |

### n8n Instruction Documents
| File | Destination | Description |
|------|-------------|-------------|
| `docs/instructions/N8N-OPS-GET-OPERATIONS-DATA-INSTRUCTIONS.md` | `docs/instructions/` | Step-by-step n8n build guide |
| `docs/instructions/N8N-OPS-SAVE-DRAFT-ASSIGNMENT-INSTRUCTIONS.md` | `docs/instructions/` | Step-by-step n8n build guide |
| `docs/instructions/N8N-OPS-SUBMIT-WEEKLY-SCHEDULE-INSTRUCTIONS.md` | `docs/instructions/` | Step-by-step n8n build guide |
| `docs/instructions/N8N-OPS-DRIVER-CLINIC-ASSIGNMENTS-INSTRUCTIONS.md` | `docs/instructions/` | Step-by-step n8n build guide |

---

## Total File Count: 13 files

### Summary by Type
- Frontend: 2 files
- Database: 2 files
- n8n Workflows: 5 files
- n8n Instructions: 4 files

---

## Migration Notes

### When Moving to Production:
1. Remove `TEST-` prefix from HTML and JS files
2. Update webhook paths in JS from `TEST-` to production paths
3. Update API base URL if different for production
4. Import workflows to production n8n (update credentials)
5. Run migrations on production database (change `destinations` to `clinic_locations` if schema differs)

### Database Schema Notes:
- Test DB uses `destinations` table (production may use `clinic_locations`)
- Test DB uses `appointments.id` as UUID
- Test DB uses `users.id` as INTEGER
