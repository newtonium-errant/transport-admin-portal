# Agent Instructions for N8N Workflow Creation

## ⚠️ CRITICAL: NEW WORKFLOWS vs EDITING EXISTING WORKFLOWS

### New Workflows → Build Importable JSON
For **brand new** workflows, create importable JSON files in the `workflows/` directory. Use existing workflow JSON files as reference for the correct node structure and format.

- ✅ **DO** create new workflow JSON files that can be imported into n8n
- ✅ **DO** follow existing JSON patterns (node types, connections, settings)
- ✅ **DO** include all Code node content, Switch configs, Supabase settings inline

### Existing Workflow Edits → Instruction Docs Only
For **editing workflows that already exist in n8n**, create instruction documents. Workflow JSON changes with every UI edit, so direct JSON edits to existing files will break on re-import.

- ❌ **DO NOT** edit existing workflow JSON files with Edit/Write tools
- ❌ **DO NOT** tell user to "re-import" an edited existing file
- ✅ **DO** read existing JSON files to understand current structure
- ✅ **DO** create instruction documents (like `N8N-*-INSTRUCTIONS.md`) for manual changes in n8n UI

**Why the distinction:** New workflow JSON can be cleanly imported. But once a workflow is active in n8n, its JSON diverges from the repo copy — the n8n UI adds internal IDs, positions, and metadata on every save. Editing the repo copy and re-importing would overwrite those changes.

**Correct Approach for Edits:**
1. Read the workflow JSON file to understand structure
2. Create a detailed instruction document showing what to change in n8n UI
3. User makes changes in n8n UI manually
4. User exports updated workflow and saves new version if needed

---

## Testing vs Production Environments

### ⚠️ IMPORTANT: Always Test Workflows Safely

The project uses **separate Supabase credentials** for testing and production:

**Production Credential:** `Supabase Production`
- Points to Supabase Cloud (production database)
- Use for live workflows only
- Contains real user data

**Testing Credential:** `Supabase Testing`
- Points to local Supabase (127.0.0.1:54321)
- Use for development and testing
- Requires local Supabase running: `supabase start`

### Safe Workflow Development Process

**For New Workflows or Major Changes:**
1. **Start local Supabase**: `supabase start`
2. **Duplicate** the production workflow
3. **Rename** with "-TEST" suffix (e.g., "APPT - Update-TEST")
4. **Switch credentials**: Change all Supabase nodes to "Supabase Testing"
5. **Test thoroughly** with local database
6. **Verify** in local Studio: http://127.0.0.1:54323
7. **Update production** workflow with tested changes
8. **Switch back** to "Supabase Production" credential
9. **Deactivate** testing workflow

**For Minor Changes:**
- Can test on production with caution during low-traffic hours
- Always backup workflow before changes (export JSON)
- Test with non-destructive operations first

**⚠️ NEVER:**
- Test destructive operations on production database
- Mix testing and production credentials in same workflow
- Leave testing workflows active after development
- Use production credentials for schema/migration testing

### When to Use Testing Environment

| Operation | Requires Testing Env |
|-----------|---------------------|
| New workflow development | ✅ Yes |
| Database schema changes | ✅ Yes |
| Testing DELETE operations | ✅ Yes |
| Batch UPDATE testing | ✅ Yes |
| Migration testing | ✅ Yes |
| Minor bug fixes | ⚠️ Optional |
| Response format changes | ❌ Production OK |
| Adding validations | ❌ Production OK |

---

## Primary Reference Documents
1. **N8N_WORKFLOW_PATTERNS_REFERENCE.md** - Complete patterns and practices
2. **N8N_WORKFLOW_TEMPLATE.json** - Starting template for new workflows
3. **N8N_WORKFLOW_CHECKLIST.md** - Step-by-step creation checklist
4. **N8N_TIMEZONE_CONFIGURATION.md** - Timezone settings and cron considerations

## Mandatory Requirements

### Before Creating Any Workflow:
1. **ALWAYS** read the relevant sections of `N8N_WORKFLOW_PATTERNS_REFERENCE.md`
2. **ALWAYS** use `N8N_WORKFLOW_TEMPLATE.json` as your starting point
3. **ALWAYS** follow the `N8N_WORKFLOW_CHECKLIST.md` during creation
4. **ALWAYS** read `N8N_LOGGING_BEST_PRACTICES.md` - Railway rate limits require minimal logging
5. **ALWAYS** review `N8N_TIMEZONE_CONFIGURATION.md` for cron triggers and scheduling

### Critical Rules (Non-Negotiable):
- ❌ **NEVER** use IF nodes - use Switch nodes instead
- ❌ **NEVER** hardcode `JWT_SECRET` - always fetch dynamically from the `app_config` table (`key = 'jwt_secret'`) via a Supabase Get node before JWT validation. Reference the secret in the JWT Code node with `$('Get JWT Secret - Supabase').first().json.value` and the webhook data with `$('<WebhookNodeName>').first().json`
- ❌ **NEVER** log data for debugging - use n8n Executions area instead
- ❌ **NEVER** log in loops or per-item processing
- ❌ **NEVER** write long comments that wrap to multiple lines in Code nodes (causes syntax errors)
- ✅ **ALWAYS** convert booleans to strings for Switch conditions
- ✅ **ALWAYS** use `typeValidation: "strict"` in Switch nodes
- ✅ **ALWAYS** set `alwaysOutputData: true` on Supabase nodes
- ✅ **ALWAYS** include comprehensive error handling
- ✅ **ALWAYS** use standardized response structures
- ✅ **ALWAYS** document code changes with version numbers
- ✅ **ONLY** log errors and critical warnings (not normal operations)
- ✅ **ALWAYS** show one node at a time during validation - wait for user confirmation before showing next node
- ✅ **ALWAYS** use UI display format for Supabase operations: `Get Many` (not `getMany`)
- ✅ **ALWAYS** use "RRTS" (not "RRTS Transport") in email subjects and content
- ✅ **ALWAYS** keep comments SHORT (under 80 characters) to prevent line wrapping

### Audit Logging:
Workflows that create, update, or delete data **MUST** log the action to the `audit_logs` table. Add a Supabase Create node (named `Log Audit - Supabase`) after the data mutation with these required fields:

| Column | Type | Value |
|--------|------|-------|
| `username` | text | Username from JWT payload (required) |
| `role` | text | User role from JWT payload (required) |
| `action` | text | `{resource}_{verb}` format, e.g. `driver_update`, `client_create` (required) |
| `user_id` | integer | User ID from JWT payload (nullable) |
| `resource_type` | text | Entity type: `appointment`, `client`, `driver`, `user`, `destination` |
| `resource_id` | text | ID of the affected record (as string) |
| `details` | jsonb | Old/new values, reasons, metadata — use `JSON.stringify()` |
| `success` | boolean | `true` for success, `false` for error paths |
| `error_message` | text | Error details (only on error paths) |

Set `alwaysOutputData: true` on the audit node. Audit log failures should **not** block the main workflow response — place the audit node as a non-blocking parallel path after the mutation.

**Full SOP with examples, patterns, and checklist:** `docs/instructions/N8N_AUDIT_LOGGING_SOP.md`

### Critical Limitations:
1. **`fetch()` NOT AVAILABLE in Code nodes** — use `this.helpers.httpRequest()` instead. Returns parsed JSON directly (no `.json()` needed). Use `qs` parameter for query strings. Body is auto-serialized for POST requests (no `JSON.stringify` needed). Note: `this` context is lost in nested functions — capture with `const self = this;` at the top of the Code node and use `self.helpers.httpRequest()` inside functions.
2. **PBKDF2 NOT AVAILABLE** — use custom `simpleHash()` function for passwords. ALL auth workflows MUST use the identical implementation. Format: `salt:hash`.
3. **SQL JOINs NOT SUPPORTED** in Supabase nodes — fetch related data in separate nodes and merge in Code nodes.
4. **`executeQuery` NOT SUPPORTED** — use basic Supabase operations only (`get`, `getAll`, `create`, `update`, `delete`).
5. **HTTP Request JSON bodies with expressions BREAK** — n8n's expression interpolation inside JSON body strings causes `"JSON parameter needs to be valid JSON"` errors (template literals, newlines, and special characters all break JSON parsing). **Always use the Code-node-first pattern:** build the complete request body as a JavaScript object in an upstream Code node, then reference it in the HTTP Request node with `={{ JSON.stringify($json.bodyFieldName) }}`. Example:
   ```javascript
   // Upstream Code node ("Prepare Request Body - Code")
   return {
     json: {
       smsBody: {
         to: [phoneNumber],
         from: phoneId,
         content: `Hi ${name}, your message here`
       }
     }
   };
   // HTTP Request node JSON field: ={{ JSON.stringify($json.smsBody) }}
   ```

## Workflow Creation Process

### Step 1: Planning
```
1. Identify workflow type (CRUD, Calendar, Batch, etc.)
2. Review corresponding patterns in reference document
3. Plan data flow and error handling strategy
4. Determine required validations
```

### Step 2: Template Setup
```
1. Copy N8N_WORKFLOW_TEMPLATE.json
2. Rename to match naming convention: "MODULE - Action Description.json"
3. Update webhook path to kebab-case
4. Update node names to be descriptive
```

### Step 3: Implementation
```
1. Follow the checklist step-by-step
2. Implement validation logic first
3. Add database operations
4. Implement error handling
5. Add response formatting
6. Test all scenarios
```

### Step 4: Documentation
```
1. Add version numbers to all Code nodes
2. Document changes in comments
3. Update workflow name and description
4. Verify all patterns are followed
```

## Common Mistakes to Avoid

### Switch Node Mistakes:
```javascript
// ❌ WRONG - Boolean comparison
"leftValue": "={{ $json.condition }}",
"rightValue": true,

// ✅ CORRECT - String comparison
"leftValue": "={{ $json.condition }}",
"rightValue": "true",
```

### Error Handling Mistakes:
```javascript
// ❌ WRONG - No error handling
return [{
    json: result
}];

// ✅ CORRECT - Proper error handling
if (result.error) {
    return [{
        json: {
            success: false,
            message: 'Database error: ' + result.error,
            timestamp: new Date().toISOString()
        }
    }];
}
```

### Database Node Mistakes:
```javascript
// ❌ WRONG - Missing alwaysOutputData
{
  "operation": "get",
  "tableId": "table_name"
}

// ✅ CORRECT - With alwaysOutputData
{
  "operation": "get",
  "tableId": "table_name",
  "alwaysOutputData": true
}
```

### HTTP Request Body Mistakes:
```javascript
// ❌ WRONG - Expressions inside JSON body string
// Causes "JSON parameter needs to be valid JSON"
={
  "to": ["{{ $json.phone }}"],
  "content": "Hi {{ $json.name }}, welcome!"
}

// ✅ CORRECT - Build body in upstream Code node
// Code node:
return { json: { smsBody: { to: [$json.phone], content: `Hi ${name}` } } };
// HTTP Request JSON field: ={{ JSON.stringify($json.smsBody) }}
```

### Code Node Comment Mistakes:
**CRITICAL**: n8n's Code node editor auto-wraps long lines, which can break JavaScript comments and cause syntax errors.

```javascript
// ❌ WRONG - Long comment that n8n will wrap (causes "Unexpected identifier" errors)
// Calculate transit time (Google Maps time + 5 minutes buffer, rounded to next 5)
const transitTime = Math.ceil(rawTransitTime / 5) * 5;

// ✅ CORRECT - Short comment (under 80 characters)
// Calculate transit time with buffer and round to 5 min
const transitTime = Math.ceil(rawTransitTime / 5) * 5;

// ✅ ALSO CORRECT - Multiple short comments
// Calculate transit time with buffer
// Round to nearest 5 minutes
const transitTime = Math.ceil(rawTransitTime / 5) * 5;

// ✅ BEST - No comment if code is self-explanatory
const transitTime = Math.ceil(rawTransitTime / 5) * 5;
```

**Why this happens:**
- n8n's editor wraps long lines visually
- JavaScript sees the wrapped portion as code, not a comment
- Results in errors like: `SyntaxError: Unexpected identifier 'to'`

**Solution:**
1. Keep ALL comments under 80 characters
2. Use multiple short comments instead of one long one
3. Remove unnecessary comments - code should be self-documenting
4. Test workflow after adding/editing comments

## Validation Patterns

### Always Include These Validations:
```javascript
// Required field validation
const errors = [];
if (!data.requiredField || data.requiredField.trim() === '') {
    errors.push('Required field is missing');
}

// Format validation
if (data.email && !data.email.includes('@')) {
    errors.push('Valid email address is required');
}

// Range validation
if (data.number && (data.number < 0 || data.number > 100)) {
    errors.push('Number must be between 0 and 100');
}

// Return validation errors
if (errors.length > 0) {
    return [{
        json: {
            success: false,
            errors: errors,
            message: 'Validation failed: ' + errors.join(', '),
            skipSupabase: true
        }
    }];
}
```

## Response Structure Standards

### Success Response:
```javascript
{
    success: true,
    message: 'Operation completed successfully',
    data: processedData,
    timestamp: new Date().toISOString(),
    // Optional: operation counts, metadata, etc.
}
```

### Error Response:
```javascript
{
    success: false,
    message: 'User-friendly error message',
    error: 'Technical error details',
    errors: ['array', 'of', 'validation', 'errors'], // if applicable
    timestamp: new Date().toISOString()
}
```

## Code Documentation Standards

### Every Code Node Must Include:
```javascript
// Version: v1.0.0 - Brief description of changes
// - v1.0.0: Initial implementation
// - v1.1.0: Added error handling
// - v1.2.0: Enhanced validation
```

### Logging Standards (MINIMAL):
```javascript
// ❌ WRONG - Do NOT log data for debugging (visible in n8n Executions)
console.log('=== WORKFLOW_NAME v1.0.0 ===');
console.log('Processing data:', JSON.stringify(data, null, 2));
console.log('Validation result:', validationResult);

// ✅ CORRECT - Only log errors and critical warnings
if (!requiredField) {
    console.log('❌ Required field missing');
}
console.error('❌ Database error:', error.message);

// For batch operations, one summary line maximum:
console.log(`📅 Prepared ${count} operations`);
```

**⚠️ CRITICAL: n8n Executions area shows ALL data - logging is RARELY needed!**

## Quality Assurance

### Before Submitting Any Workflow:
1. ✅ All patterns from reference document followed
2. ✅ Checklist completed
3. ✅ Error handling implemented
4. ✅ Validation comprehensive
5. ✅ Response structures standardized
6. ✅ Code documented with versions
7. ✅ Node names follow convention: `(Description of Function) - (Node Type)`
8. ✅ Webhook paths kebab-case

### Testing Requirements:
1. Test with valid inputs
2. Test with invalid inputs
3. Test error conditions
4. Verify response formats
5. Check database operations

## Timezone Configuration

### n8n Server Timezone: Halifax (AST/ADT)
The n8n server is configured to run in Halifax timezone (`America/Halifax`) for easy-to-read execution logs.

**Implications for Cron Triggers:**
- Cron expressions run in Halifax time, NOT UTC
- Business hours: 7 AM - 8 PM Halifax time = `*/5 7-20 * * 1-5`
- Current timezone: ADT (UTC-3) during daylight saving, AST (UTC-4) during standard time

**Database Operations:**
- All timestamps stored in UTC in Supabase
- Frontend converts UTC to local browser timezone
- n8n workflow timestamps show in Halifax time for readability

**Workflow Development:**
- Design cron triggers for Halifax business hours
- Use `={{ $now.toISO() }}` for UTC database timestamps
- Execution logs will show Halifax time for easy monitoring

## Emergency Contacts
If you encounter patterns not covered in the reference document:
1. Check existing similar workflows for patterns
2. Follow the general principles outlined
3. Document any new patterns for future reference

Remember: Consistency is key. Every workflow should feel like it was created by the same developer following the same standards.
