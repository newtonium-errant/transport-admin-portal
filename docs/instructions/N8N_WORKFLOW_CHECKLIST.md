# N8N Workflow Creation Checklist

Use this checklist when creating any new n8n workflow to ensure consistency with established patterns.

## ✅ Pre-Creation Checklist
- [ ] Review `N8N_WORKFLOW_PATTERNS_REFERENCE.md` for relevant patterns
- [ ] Review `N8N_LOGGING_BEST_PRACTICES.md` for logging guidelines
- [ ] Identify the workflow type (CRUD, Calendar Integration, Batch Processing, etc.)
- [ ] Plan the data flow and error handling strategy
- [ ] Plan to use MINIMAL logging (n8n Executions shows all data)

## ✅ Node Selection
- [ ] Use Switch nodes instead of IF nodes for conditional logic
- [ ] Use Code nodes for data processing and validation
- [ ] Use Supabase nodes for database operations
- [ ] Use HTTP Request nodes for external API calls
- [ ] Avoid Set nodes (use Code nodes instead)

## ✅ Switch Node Configuration
- [ ] Convert booleans to strings ("true"/"false") for conditions
- [ ] Set `typeValidation: "strict"`
- [ ] Set `caseSensitive: true`
- [ ] Use descriptive output keys ("True"/"False")
- [ ] Use string comparisons with `operation: "equals"`

## ✅ Error Handling
- [ ] Implement validation with error collection
- [ ] Use `skipSupabase: true` flag for validation errors
- [ ] Include standardized error response structure
- [ ] Handle database errors with proper error messages
- [ ] Add timestamp to all responses

## ✅ Database Operations
- [ ] Set `alwaysOutputData: true` on Supabase nodes
- [ ] Use proper filter conditions
- [ ] Handle empty results gracefully
- [ ] Implement proper error checking
- [ ] Does the workflow log data changes to `audit_logs`? (required for create/update/delete — see `docs/instructions/N8N_AUDIT_LOGGING_SOP.md`)
- [ ] Audit node named `Log Audit - Supabase` with `alwaysOutputData: true`
- [ ] Audit node is non-blocking (doesn't prevent response on failure)
- [ ] Error paths also log with `success: false` and `error_message`

## ✅ Data Processing
- [ ] Include input validation and sanitization
- [ ] Use helper functions for common operations
- [ ] Trim strings and handle null values
- [ ] Validate required fields
- [ ] Process arrays properly with error handling

## ✅ Response Formatting
- [ ] Use consistent response structure
- [ ] Include success/failure status
- [ ] Add descriptive messages
- [ ] Include operation counts where applicable
- [ ] Add timestamps

## ✅ Code Documentation
- [ ] Add version numbers to Code nodes
- [ ] Include change log comments
- [ ] Document complex logic
- [ ] Use descriptive variable names
- [ ] Remove all debug console.log statements (use n8n Executions instead)
- [ ] Keep only error logging (console.error) and critical warnings

## ✅ Security & Validation
- [ ] Validate all inputs
- [ ] Sanitize user data
- [ ] Check for required fields
- [ ] Validate data formats and ranges
- [ ] Handle authentication properly

## ✅ Testing Considerations
- [ ] Test with valid inputs
- [ ] Test with invalid inputs
- [ ] Test error conditions
- [ ] Verify response formats
- [ ] Check database operations

## ✅ Final Review
- [ ] All nodes follow naming conventions: `(Description of Function) - (Node Type)`
- [ ] Webhook paths use kebab-case
- [ ] Code follows established patterns
- [ ] Error handling is comprehensive
- [ ] Documentation is complete

## Common Patterns by Use Case

### Simple CRUD
- Webhook → Validate → Database → Format Response → Respond

### Calendar Integration
- Webhook → Validate → Get Current → Compare → Switch → Calendar Ops → Update DB → Format → Respond

### Batch Processing
- Webhook → Validate Array → Split → Process Each → Collect → Format → Respond

### Data Retrieval
- Webhook → Get Data → Merge Related → Process → Format → Respond

## Quick Reference Commands

```javascript
// Switch condition (convert boolean to string)
const needsAction = (condition) ? 'true' : 'false';

// Validation error response
return [{
    json: {
        success: false,
        errors: errors,
        message: 'Validation failed: ' + errors.join(', '),
        skipSupabase: true
    }
}];

// Standard success response
return [{
    json: {
        success: true,
        message: 'Operation completed successfully',
        data: result,
        timestamp: new Date().toISOString()
    }
}];
```

## ✅ QA Review (Before Deploying)

Run through these checks before activating any workflow in production:

### Multi-Item / Batch Testing
- [ ] Test with 2+ items (not just a single item) to catch merge/iteration bugs
- [ ] Verify Merge node uses "Append" mode (not "Combine") — "Combine" collapses all items into one object
- [ ] After Merge node, validate output structure in a Code node before downstream processing

### Data Integrity
- [ ] Check all JSONB fields use `JSON.stringify()` in Code nodes (n8n expressions don't auto-serialize)
- [ ] Test with null/empty optional fields, especially integer columns (`driver_assigned`, `clinic_id`) — null coerces to string `"null"` which breaks PostgreSQL integer filters
- [ ] Verify `alwaysOutputData: true` on all Supabase nodes
- [ ] Check Restore Context Code node exists after every Supabase/HTTP node that precedes pipeline logic

### Error Paths
- [ ] Test error paths: invalid input, missing required fields, database errors
- [ ] Verify 401/403 response paths return correct HTTP status codes (not always 200)
- [ ] Test what happens when an upstream node returns empty/no items

### Response & Logging
- [ ] Verify standardized response format: `{ success: true/false, message: string, data: {...}, timestamp: ISO8601 }`
- [ ] Verify no `console.log` statements remain — only `console.error` for actual errors
- [ ] Confirm audit logging for create/update/delete operations (see `N8N_AUDIT_LOGGING_SOP.md`)
