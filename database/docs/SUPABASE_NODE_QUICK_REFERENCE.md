# Supabase Node Quick Reference

## ⚠️ CRITICAL: Never Use "executeQuery"
The Supabase node in n8n does NOT support `executeQuery` operation. Always use the **Row** resource with appropriate operations.

## ⚠️ CRITICAL: Supabase Node Import Issues (2024-2026)

### Known Import Problems
Based on community research and testing, Supabase nodes have significant import/export issues:

1. **Operation Format Mismatch**: Different n8n versions expect different operation formats
2. **Node Version Compatibility**: `typeVersion` differences cause import failures
3. **Browser Compatibility**: Some users report Safari vs Chrome issues (though Chrome is recommended)
4. **Missing Required Fields**: JSON configurations must match exact n8n expectations

### ⚠️ n8n v2.3+ Import Regression (January 2026)
After updating to n8n v2.3.x, Supabase node imports have become **significantly worse**:
- **Filter conditions** (`filters.conditions`) often don't import - nodes show "At least one select condition must be defined"
- **Field mappings** (`fieldsUi.fieldValues`) frequently get lost - Create/Update nodes have no fields configured
- **Workaround**: After importing any workflow, manually verify and reconfigure ALL Supabase nodes:
  1. Check each Supabase node's filter conditions
  2. Verify all field mappings are present
  3. Re-add any missing configurations manually
- This regression was not as severe in earlier n8n versions

### Working Format (Verified 2024)
Use this exact format for Supabase nodes that import correctly:

```json
{
  "parameters": {
    "operation": "getAll",
    "tableId": "table_name",
    "returnAll": true
  },
  "type": "n8n-nodes-base.supabase",
  "typeVersion": 1,
  "alwaysOutputData": true,
  "credentials": {
    "supabaseApi": {
      "id": "credential-id",
      "name": "Credential Name"
    }
  }
}
```

### Formats That DON'T Work
❌ **New Format (Causes Import Errors):**
```json
{
  "resource": "row",
  "operation": "Get Many",
  "table": {"__rl": true, "value": "table_name", "mode": "list"},
  "options": {"alwaysOutputData": true}
}
```

❌ **CamelCase Operations:**
```json
{
  "operation": "getMany"  // Fails on import
}
```

### Troubleshooting Import Issues
1. **Always use `typeVersion: 1`** for Supabase nodes
2. **Use `operation: "getAll"`** instead of "getMany" or "Get Many"
3. **Use `tableId: "table_name"`** instead of `table: {...}` object
4. **Place `alwaysOutputData: true`** at root level, not in options
5. **Test imports in Chrome browser** (Safari has known issues)

### Community Solutions
- Manual node recreation often required when imports fail
- Verify all mandatory fields are present
- Update n8n and Supabase nodes to latest versions
- Check Supabase authentication URL configuration
- Consult n8n community forums for version-specific issues

---

## Testing vs Production Credentials

### Environment Setup

The n8n instance has **two separate Supabase credentials** for safe development:

**Production Credential:**
- **Name**: `Supabase Production`
- **Points To**: Supabase Cloud (production database)
- **Use For**: Live workflows serving the production application

**Testing Credential:**
- **Name**: `Supabase Testing`
- **Points To**: Local Supabase (127.0.0.1:54321)
- **Use For**: Development, testing, and workflow debugging

### Workflow Development Best Practices

**Testing New Workflows:**
1. Start local Supabase: `supabase start`
2. Duplicate the production workflow in n8n
3. Rename with "-TEST" suffix (e.g., "APPT - Update Appointment-TEST")
4. Switch all Supabase nodes to use "Supabase Testing" credential
5. Activate and test with local database
6. Verify changes in local Studio (http://127.0.0.1:54323)
7. Once tested, update production workflow with changes
8. Switch back to "Supabase Production" credential
9. Deactivate testing workflow

**⚠️ NEVER:**
- Use production credentials for testing destructive operations
- Test with production database for schema changes
- Mix testing and production credentials in same workflow
- Leave testing workflows active after development

**Testing Checklist:**
- [ ] Local Supabase is running (`supabase status`)
- [ ] Workflow uses "Supabase Testing" credential
- [ ] Testing workflow has "-TEST" suffix
- [ ] Production workflow is deactivated during testing
- [ ] Database changes verified in local Studio
- [ ] Workflow switched back to production credentials before activation

### Credential Configuration

**Production (Supabase Cloud):**
```
Service Role Key: [from Supabase project settings]
Host: https://[project-ref].supabase.co
```

**Testing (Local Supabase):**
```
Service Role Key: [from local supabase start output]
Host: http://127.0.0.1:54321
```

### When to Use Each Credential

| Scenario | Use Production | Use Testing |
|----------|---------------|-------------|
| Live workflow serving users | ✅ | ❌ |
| Testing database migrations | ❌ | ✅ |
| Developing new workflows | ❌ | ✅ |
| Debugging workflow logic | ❌ | ✅ |
| Testing schema changes | ❌ | ✅ |
| Production data queries | ✅ | ❌ |
| Experimenting with queries | ❌ | ✅ |
| Final pre-deployment testing | ✅ | ❌ |

---

## Basic Node Structure

### Step-by-Step Setup in n8n UI:

1. **Add Supabase node**
2. **Select Resource:** `Row` (required!)
3. **Select Operation:** Choose from: `Get`, `Get Many`, `Create`, `Update`, `Delete`
   - ⚠️ **IMPORTANT**: Use `Get Many` (not `getMany`) for multiple records
4. **Select Table:** Choose your table from dropdown
5. **Configure Filters/Data:** Based on operation
6. **Options → Always Output Data:** ✅ **ALWAYS ENABLE THIS**

---

## Operations Overview

| Operation | Use Case | Returns |
|-----------|----------|---------|
| `Get` | Get single row by filter | Single object or empty array |
| `Get Many` | Get multiple rows by filter | Array of objects |
| `Create` | Insert new row | Created row object |
| `Update` | Update existing row(s) | Updated row(s) |
| `Delete` | Delete row(s) by filter | Deleted row(s) |

**⚠️ CRITICAL**: In n8n UI, operations display as `Get Many` (with space and capitals), not `getMany` (camelCase). Always use the UI display format.

---

## 1. GET SINGLE ROW

### In n8n UI:
- **Resource:** `Row`
- **Operation:** `Get`
- **Table:** `admin_users`
- **Filters:**
  - Click "Add Filter"
  - Column: `username`
  - Operator: `Equal to`
  - Value: `={{ $json.username }}`
- **Options:**
  - Always Output Data: ✅ **ENABLED**

### JSON Structure:
```json
{
  "resource": "row",
  "operation": "get",
  "table": "admin_users",
  "filters": {
    "conditions": [
      {
        "column": "username",
        "operator": "eq",
        "value": "={{ $json.username }}"
      }
    ]
  },
  "options": {
    "alwaysOutputData": true
  }
}
```

---

## 2. GET MANY ROWS

### In n8n UI:
- **Resource:** `Row`
- **Operation:** `Get Many` ⚠️ (Note: UI shows "Get Many", not "getMany")
- **Table:** `appointments`
- **Return All:** ✅ Enabled (or set Limit)
- **Filters:**
  - Click "Add Filter" for each condition
  - Filter 1: Column `status`, Operator `Equal to`, Value `active`
  - Filter 2: Column `date`, Operator `Greater than or equal`, Value `={{ $now.toISO() }}`
- **Options:**
  - Always Output Data: ✅ **ENABLED**

### JSON Structure:
```json
{
  "resource": "row",
  "operation": "getMany",
  "table": "appointments",
  "returnAll": true,
  "filters": {
    "conditions": [
      {
        "column": "status",
        "operator": "eq",
        "value": "active"
      },
      {
        "column": "appointmenttime",
        "operator": "gte",
        "value": "={{ $now.toISO() }}"
      }
    ]
  },
  "options": {
    "alwaysOutputData": true
  }
}
```

---

## 3. CREATE (INSERT) ROW

### In n8n UI:
- **Resource:** `Row`
- **Operation:** `Create`
- **Table:** `admin_users`
- **Data to Insert:**
  - Click "Add Field" for each field
  - Field 1: `username` = `={{ $json.username }}`
  - Field 2: `email` = `={{ $json.email }}`
  - Field 3: `password_hash` = `={{ $json.hashedPassword }}`
  - Field 4: `created_at` = `={{ $now.toISO() }}`
- **Options:**
  - Always Output Data: ✅ **ENABLED**

### JSON Structure:
```json
{
  "resource": "row",
  "operation": "create",
  "table": "admin_users",
  "dataToInsert": {
    "username": "={{ $json.username }}",
    "email": "={{ $json.email }}",
    "password_hash": "={{ $json.hashedPassword }}",
    "created_at": "={{ $now.toISO() }}"
  },
  "options": {
    "alwaysOutputData": true
  }
}
```

---

## 4. UPDATE ROW(S)

### In n8n UI:
- **Resource:** `Row`
- **Operation:** `Update`
- **Table:** `admin_users`
- **Filters:**
  - Click "Add Filter"
  - Column: `username`
  - Operator: `Equal to`
  - Value: `={{ $json.username }}`
- **Update Fields:**
  - Click "Add Field" for each field to update
  - Field 1: `password_hash` = `={{ $json.hashedPassword }}`
  - Field 2: `last_password_change` = `={{ $now.toISO() }}`
  - Field 3: `failed_login_attempts` = `0`
- **Options:**
  - Always Output Data: ✅ **ENABLED**

### JSON Structure:
```json
{
  "resource": "row",
  "operation": "update",
  "table": "admin_users",
  "filters": {
    "conditions": [
      {
        "column": "username",
        "operator": "eq",
        "value": "={{ $json.username }}"
      }
    ]
  },
  "updateFields": {
    "password_hash": "={{ $json.hashedPassword }}",
    "last_password_change": "={{ $now.toISO() }}",
    "failed_login_attempts": 0
  },
  "options": {
    "alwaysOutputData": true
  }
}
```

---

## 5. DELETE ROW(S)

### In n8n UI:
- **Resource:** `Row`
- **Operation:** `Delete`
- **Table:** `admin_users`
- **Filters:**
  - Click "Add Filter"
  - Column: `id`
  - Operator: `Equal to`
  - Value: `={{ $json.userId }}`
- **Options:**
  - Always Output Data: ✅ **ENABLED**

### JSON Structure:
```json
{
  "resource": "row",
  "operation": "delete",
  "table": "admin_users",
  "filters": {
    "conditions": [
      {
        "column": "id",
        "operator": "eq",
        "value": "={{ $json.userId }}"
      }
    ]
  },
  "options": {
    "alwaysOutputData": true
  }
}
```

---

## Filter Operators Reference

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal to | `status = 'active'` |
| `neq` | Not equal to | `status != 'deleted'` |
| `gt` | Greater than | `age > 18` |
| `gte` | Greater than or equal | `date >= today` |
| `lt` | Less than | `price < 100` |
| `lte` | Less than or equal | `quantity <= 10` |
| `like` | Pattern match (case-sensitive) | `name LIKE '%John%'` |
| `ilike` | Pattern match (case-insensitive) | `email ILIKE '%@gmail.com'` |
| `is` | Is (for null checks) | `deleted_at IS NULL` |
| `in` | In array | `id IN (1,2,3)` |
| `contains` | Contains (for arrays/JSONB) | `tags CONTAINS 'urgent'` |

---

## Multiple Filters (AND Logic)

### In n8n UI:
All filters added are combined with AND logic automatically.

### Example - Get appointments for specific client on specific date:
```json
{
  "filters": {
    "conditions": [
      {
        "column": "knumber",
        "operator": "eq",
        "value": "K1234567"
      },
      {
        "column": "appointmenttime",
        "operator": "gte",
        "value": "2025-01-15T00:00:00Z"
      },
      {
        "column": "appointmenttime",
        "operator": "lte",
        "value": "2025-01-15T23:59:59Z"
      }
    ]
  }
}
```

---

## Common Patterns

### Pattern: Find User by Username
```
Resource: Row
Operation: Get Many ⚠️ (UI format, not "getMany")
Table: admin_users
Filters:
  - Column: username
  - Operator: eq
  - Value: ={{ $json.username }}
Options:
  - Always Output Data: ✅
```

### Pattern: Update Password
```
Resource: Row
Operation: Update
Table: users
Filters:
  - Column: username
  - Operator: eq
  - Value: ={{ $json.username }}
Update Fields:
  - password_hash: ={{ $json.hashedPassword }}
  - last_password_change: ={{ $now.toISO() }}
  - failed_login_attempts: 0
  - locked_until: (leave blank for NULL)
Options:
  - Always Output Data: ✅
```

### Pattern: Get Active Appointments
```
Resource: Row
Operation: Get Many ⚠️ (UI format, not "getMany")
Table: appointments
Return All: ✅
Filters:
  - Column: status
  - Operator: eq
  - Value: active
  - Column: appointmenttime
  - Operator: gte
  - Value: ={{ $now.toISO() }}
Options:
  - Always Output Data: ✅
```

---

## ⚠️ Common Mistakes to Avoid

### ❌ WRONG - Using Wrong Operation Format
```json
{
  "operation": "getMany"
}
```
**This fails on import!** n8n UI expects `Get Many` (with space and capitals).

### ✅ CORRECT - Using UI Display Format
```json
{
  "operation": "Get Many"
}
```
**This imports correctly!** Always use the exact format shown in n8n UI.

### ❌ WRONG - Using executeQuery
```json
{
  "operation": "executeQuery",
  "query": "SELECT * FROM users WHERE username = $1"
}
```
**This does NOT work in n8n Supabase node!**

### ✅ CORRECT - Using Row resource
```json
{
  "resource": "row",
  "operation": "getMany",
  "table": "users",
  "filters": {
    "conditions": [
      {
        "column": "username",
        "operator": "eq",
        "value": "={{ $json.username }}"
      }
    ]
  }
}
```

### ❌ WRONG - Using Empty Strings to Clear Non-Text Columns
```json
{
  "fieldId": "google_calendar_last_synced",
  "fieldValue": ""
}
```
**This causes a Postgres error:** `invalid input syntax for type timestamp with time zone: ""`

Empty strings (`""`) are only valid for `text`/`varchar` columns. For all other column types, you must use `={{ null }}` to clear the value:

| Column Type | Empty String `""` | `={{ null }}` |
|---|---|---|
| `text` / `varchar` | Valid (sets to empty string) | Valid (sets to NULL) |
| `timestamp with time zone` | **ERROR** | Valid |
| `integer` / `bigint` | **ERROR** | Valid |
| `boolean` | **ERROR** | Valid |
| `uuid` | **ERROR** | Valid |
| `jsonb` / `json` | **ERROR** | Valid |
| `numeric` / `decimal` | **ERROR** | Valid |

### ✅ CORRECT - Using Null Expression to Clear Non-Text Columns
```json
{
  "fieldId": "google_calendar_last_synced",
  "fieldValue": "={{ null }}"
}
```

**In the n8n UI:** Toggle the field to expression mode, then enter `{{ null }}`.

**Rule of thumb:** When clearing any column value, prefer `={{ null }}` over `""`. It works for ALL column types including text. Only use `""` if you specifically need an empty string (not NULL) in a text column.

### ❌ WRONG - Forgetting alwaysOutputData
This will cause workflow to fail when no results are found.

### ✅ CORRECT - Always enable it
```json
{
  "options": {
    "alwaysOutputData": true
  }
}
```

### ❌ WRONG - Using old field names
```json
{
  "tableId": "users",
  "keyName": "id",
  "keyValue": "123"
}
```

### ✅ CORRECT - Using current field names
```json
{
  "table": "users",
  "filters": {
    "conditions": [
      {
        "column": "id",
        "operator": "eq",
        "value": "123"
      }
    ]
  }
}
```

### ❌ WRONG - Using notNull operator (causes parsing errors)
```json
{
  "column": "email",
  "operator": "is",
  "value": "notNull"
}
```

### ✅ CORRECT - Use IS NOT NULL instead
```json
{
  "column": "email",
  "operator": "is",
  "value": "NOT NULL"
}
```

### ⚠️ ALTERNATIVE - Filter in Code node if notNull fails
If `IS NOT NULL` still causes issues, filter empty values in a Code node after the database query:
```javascript
// Filter out clients without email
const clientsWithEmail = $input.all().filter(client => 
  client.json.email && client.json.email.trim() !== ''
);
```

---

## Checklist for Every Supabase Node

- [ ] Resource set to `Row`
- [ ] Operation selected (Get, Get Many, Create, Update, Delete)
- [ ] Table name specified
- [ ] Filters configured (for Get/Update/Delete operations)
- [ ] Data fields configured (for Create/Update operations)
- [ ] **Always Output Data** enabled in Options
- [ ] Values use expressions like `={{ $json.fieldName }}` when needed

---

## ⚠️ CRITICAL: Data Source Reference

### Understanding Data Flow in n8n

When setting up Supabase filters, you must understand where your data comes from:

#### ❌ WRONG - Direct Webhook Reference
```javascript
// This tries to get data directly from webhook
"value": "={{ $input.first().json.username }}"
```
**This will fail** if the Supabase node is not directly connected to the webhook.

#### ✅ CORRECT - Previous Node Reference
```javascript
// This gets data from the previous node in the workflow
"value": "={{ $json.username }}"
```
**This is correct** for all nodes after the first processing node.

### Data Flow Examples

#### Example 1: Simple Flow
```
Webhook → Validate Data → Supabase
```
- **Supabase filter value:** `={{ $json.username }}` (from Validate Data node)

#### Example 2: Complex Flow
```
Webhook → Validate Data → Switch → Supabase
```
- **Supabase filter value:** `={{ $json.username }}` (from Switch node, which got it from Validate Data)

#### Example 3: Multiple Processing Steps
```
Webhook → Validate Data → Process Data → Hash Password → Supabase
```
- **Supabase filter value:** `={{ $json.username }}` (from Hash Password node)

### How to Verify Data Source

1. **Check the workflow connections** - Follow the data flow from webhook
2. **Look at the previous node** - What does it output?
3. **Use the correct reference:**
   - First node after webhook: `={{ $input.first().json.fieldName }}`
   - All other nodes: `={{ $json.fieldName }}`

### Common Data References

```javascript
// Webhook data (first node only)
$input.first().json.username

// Previous node data (all other nodes)
$json.username

// Supabase filters (always use previous node data)
"value": "={{ $json.username }}"
```

---

## Quick Reference Summary

1. **Always use `Row` resource** - Never use executeQuery
2. **Always enable `alwaysOutputData: true`** - Critical for error handling
3. **Use expressions** - `={{ $json.fieldName }}` for dynamic values (from previous node)
4. **Verify data source** - Check workflow connections to understand data flow
5. **Filter operators** - Use correct operator for your data type
6. **Multiple filters** - Add multiple conditions for AND logic
7. **Return All** - Enable for Get Many when you want all results
8. **Timestamp fields** - Use `={{ $now.toISO() }}` for current timestamp
9. **NULL values** - Use `={{ null }}` expression to set to NULL (do NOT use empty string `""` for non-text columns — causes Postgres errors)

---

This reference should be used every time you create or modify a Supabase node in n8n workflows.

