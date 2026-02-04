/**
 * @fileoverview API Security Module - Role-Based Request Filtering
 *
 * @description
 * Implements client-side security measures for API requests:
 * - Role-based data filtering (removes sensitive fields before sending)
 * - Permission validation before operations
 * - Audit logging for security events
 * - Principle of least privilege enforcement
 *
 * Note: This is defense-in-depth - backend MUST also validate permissions.
 * Client-side filtering prevents accidental exposure, not malicious attacks.
 *
 * @requires jwt-auth.js - For getCurrentUser()
 * @requires permissions.js - For getUserRole(), getRolePermissions()
 *
 * @example
 * // Make a secure API request
 * const response = await secureApiRequest('/api/endpoint', { method: 'POST' }, data);
 *
 * @example
 * // Validate permission before action
 * try {
 *     validatePermission('delete_client');
 *     await deleteClient(clientId);
 * } catch (error) {
 *     showError('Permission denied');
 * }
 *
 * @version 2.0.0
 * @since 2024-01-01
 */

'use strict';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Fields considered sensitive for cost/financial data
 * Removed from responses for users without canViewCosts permission
 * @constant {string[]}
 */
const COST_SENSITIVE_FIELDS = [
    'cost',
    'totalCost',
    'appointmentCost',
    'estimatedCost',
    'billingAmount'
];

/**
 * Fields that booking agents are allowed to update on appointments
 * Supervisors/admins can update additional fields
 * @constant {string[]}
 */
const BOOKING_AGENT_ALLOWED_FIELDS = [
    'kNumber',
    'appointmentDateTime',
    'pickupTime',
    'locationName',
    'locationAddress',
    'appointmentLength',
    'notes'
];

/**
 * API endpoint for storing audit logs
 * @constant {string}
 */
const AUDIT_LOG_ENDPOINT = 'https://webhook-processor-production-3bb8.up.railway.app/webhook/store-audit-log';

// =============================================================================
// SECURE API REQUEST
// =============================================================================

/**
 * Make an API request with security filtering
 *
 * Automatically filters sensitive data based on user permissions
 * before sending and logs the request for audit purposes.
 *
 * @param {string} endpoint - API endpoint URL
 * @param {Object} [options={}] - Fetch options (method, headers, etc.)
 * @param {Object} [data=null] - Request body data to filter and send
 * @returns {Promise<Response>} Fetch Response object
 * @throws {Error} If request fails
 *
 * @example
 * const response = await secureApiRequest(
 *     'https://api.example.com/appointments',
 *     { method: 'POST' },
 *     { clientId: '123', cost: 100 } // cost removed if user can't view costs
 * );
 */
async function secureApiRequest(endpoint, options = {}, data = null) {
    const userRole = getUserRole();
    const permissions = getRolePermissions(userRole);

    // Filter sensitive data based on user permissions
    if (data) {
        data = filterSensitiveData(data, permissions);

        // Log API request for audit trail
        logSecurityEvent('api_request', {
            endpoint,
            userRole,
            timestamp: new Date().toISOString()
        });
    }

    // Add filtered data to request body (for non-GET requests)
    if (data && options.method && options.method !== 'GET') {
        options.body = JSON.stringify(data);
        options.headers = {
            ...options.headers,
            'Content-Type': 'application/json'
        };
    }

    try {
        const response = await fetch(endpoint, options);

        // Log successful response
        logSecurityEvent('api_response', {
            endpoint,
            userRole,
            status: response.status,
            timestamp: new Date().toISOString()
        });

        return response;
    } catch (error) {
        // Log error for security monitoring
        logSecurityEvent('api_error', {
            endpoint,
            userRole,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}

// =============================================================================
// DATA FILTERING
// =============================================================================

/**
 * Remove sensitive fields from data based on user permissions
 *
 * Implements principle of least privilege - users only see/send
 * data they're authorized to access.
 *
 * @param {Object} data - Data object to filter
 * @param {Object} permissions - User's permission object from getRolePermissions()
 * @returns {Object} Filtered copy of data (original unchanged)
 *
 * @example
 * const filtered = filterSensitiveData(
 *     { name: 'John', cost: 100 },
 *     { canViewCosts: false }
 * );
 * // Result: { name: 'John' } - cost removed
 */
function filterSensitiveData(data, permissions) {
    const filtered = { ...data };

    // Remove cost information for users without cost viewing permission
    if (!permissions?.canViewCosts) {
        COST_SENSITIVE_FIELDS.forEach(field => {
            delete filtered[field];
        });

        // Also filter nested appointment arrays
        if (filtered.appointments && Array.isArray(filtered.appointments)) {
            filtered.appointments = filtered.appointments.map(apt => {
                const filteredApt = { ...apt };
                COST_SENSITIVE_FIELDS.forEach(field => {
                    delete filteredApt[field];
                });
                return filteredApt;
            });
        }
    }

    // Note: Driver assignment filtering is handled by createSecureAppointmentUpdate
    // Backend should reject driver changes from unauthorized users

    return filtered;
}

/**
 * Filter appointment data for display based on permissions
 *
 * @param {Object} appointment - Appointment object to filter
 * @param {Object} permissions - User's permission object
 * @returns {Object} Filtered appointment copy
 * @private
 */
function filterAppointmentData(appointment, permissions) {
    const filtered = { ...appointment };

    // Remove cost information if user can't view costs
    if (!permissions?.canViewCosts) {
        COST_SENSITIVE_FIELDS.forEach(field => {
            delete filtered[field];
        });
    }

    return filtered;
}

// =============================================================================
// SECURE UPDATE BUILDERS
// =============================================================================

/**
 * Create a safe appointment update object with only allowed fields
 *
 * Prevents unauthorized field modifications by stripping fields
 * the user's role isn't allowed to update.
 *
 * @param {Object} appointmentData - Raw appointment data from form
 * @returns {Object} Safe appointment data with only allowed fields
 *
 * @example
 * // Booking agent tries to update driver assignment
 * const safeData = createSecureAppointmentUpdate({
 *     id: '123',
 *     notes: 'Updated notes',
 *     driverAssigned: 'driver-456' // Will be stripped if user can't assign
 * });
 * // Result: { id: '123', notes: 'Updated notes' }
 */
function createSecureAppointmentUpdate(appointmentData) {
    const userRole = getUserRole();
    const permissions = getRolePermissions(userRole);
    const safeData = {};

    // Start with fields all authenticated users can update
    const allowedFields = [...BOOKING_AGENT_ALLOWED_FIELDS];

    // Supervisors/admins can also update driver assignment
    if (permissions?.canAssignDrivers) {
        allowedFields.push('status');
        allowedFields.push('driverAssigned');
    } else if (permissions?.canEditAppointments) {
        // Booking agents can update status but not driver
        allowedFields.push('status');
    }

    // Only copy allowed fields to safe data object
    allowedFields.forEach(field => {
        if (appointmentData[field] !== undefined) {
            safeData[field] = appointmentData[field];
        }
    });

    return safeData;
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Log security event to audit trail
 *
 * Records security-relevant events for monitoring and compliance.
 * Logs to console in development, sends to backend audit endpoint.
 *
 * @param {string} eventType - Type of event ('api_request', 'permission_denied', etc.)
 * @param {Object} details - Event details
 * @param {string} [details.endpoint] - API endpoint involved
 * @param {string} [details.userRole] - User's role
 * @param {string} [details.action] - Action attempted
 * @param {string} [details.error] - Error message if failed
 * @returns {Promise<void>}
 *
 * @example
 * await logSecurityEvent('permission_denied', {
 *     action: 'delete_client',
 *     userRole: 'booking_agent',
 *     clientId: '123'
 * });
 */
async function logSecurityEvent(eventType, details) {
    // Get current user context
    const user = getCurrentUser();
    if (!user) {
        console.warn('[Security] Cannot log event: no user context');
        return;
    }

    // Build audit log entry
    const auditLogData = {
        user_id: user.id || null,
        username: user.username,
        role: user.role,
        action: eventType,
        resource_type: details.resource_type || null,
        resource_id: details.resource_id || null,
        details: {
            ...details,
            timestamp: new Date().toISOString()
        },
        ip_address: null, // Captured by backend from request headers
        user_agent: navigator.userAgent,
        success: details.success !== undefined ? details.success : true,
        error_message: details.error || null
    };

    // Always log to console for debugging
    console.log('[Audit]', eventType, details);

    // Send to backend audit log (fire-and-forget)
    try {
        const response = await authenticatedFetch(AUDIT_LOG_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(auditLogData)
        });

        if (!response.ok) {
            console.error('[Audit] Failed to store audit log:', response.status);
        }
    } catch (error) {
        // Fail silently - don't block user actions if logging fails
        // This is a trade-off: we prioritize UX over guaranteed logging
        console.error('[Audit] Error storing audit log:', error);
    }
}

// =============================================================================
// PERMISSION VALIDATION
// =============================================================================

/**
 * Validate user has permission for an action
 *
 * Call before performing sensitive operations. Throws if denied,
 * allowing try/catch handling of permission failures.
 *
 * @param {string} action - Action to validate ('delete_client', 'assign_driver', etc.)
 * @returns {boolean} True if permitted
 * @throws {Error} If permission denied, with descriptive message
 *
 * @example
 * try {
 *     validatePermission('delete_client');
 *     await deleteClient(clientId);
 * } catch (error) {
 *     if (error.message.includes('Permission denied')) {
 *         showError('You do not have permission to delete clients');
 *     }
 * }
 */
function validatePermission(action) {
    const userRole = getUserRole();
    const permissions = getRolePermissions(userRole);

    // Map action names to permission flags
    const permissionMap = {
        'delete_client': permissions?.canDeleteClients,
        'delete_appointment': permissions?.canDeleteAppointments,
        'assign_driver': permissions?.canAssignDrivers,
        'view_costs': permissions?.canViewCosts,
        'manage_users': permissions?.canManageUsers,
        'manage_drivers': permissions?.canManageDrivers,
        'manage_system_config': permissions?.canManageSystemConfig
    };

    const hasPermission = permissionMap[action];

    if (!hasPermission) {
        // Log denied attempt for security monitoring
        logSecurityEvent('permission_denied', {
            action,
            userRole,
            success: false,
            timestamp: new Date().toISOString()
        });

        throw new Error(`Permission denied: You do not have permission to ${action.replace('_', ' ')}`);
    }

    return true;
}

// =============================================================================
// SECURE API HELPERS
// =============================================================================

/**
 * Save new appointment with security filtering
 *
 * @param {Object} appointmentData - Appointment data from form
 * @returns {Promise<Response>} API response
 */
async function secureSaveAppointment(appointmentData) {
    const safeData = createSecureAppointmentUpdate(appointmentData);

    return await secureApiRequest(
        'https://webhook-processor-production-3bb8.up.railway.app/webhook/save-appointment',
        { method: 'POST' },
        safeData
    );
}

/**
 * Update existing appointment with security filtering
 *
 * @param {Object} appointmentData - Appointment data with updates
 * @returns {Promise<Response>} API response
 */
async function secureUpdateAppointment(appointmentData) {
    const safeData = createSecureAppointmentUpdate(appointmentData);

    return await secureApiRequest(
        'https://webhook-processor-production-3bb8.up.railway.app/webhook/update-appointment-complete',
        { method: 'POST' },
        safeData
    );
}

/**
 * Get appointments with sensitive data filtered from response
 *
 * @param {string} endpoint - Appointments endpoint URL
 * @returns {Promise<Object>} Filtered appointments data
 */
async function secureGetAppointments(endpoint) {
    const response = await secureApiRequest(endpoint, { method: 'GET' });

    if (response.ok) {
        const data = await response.json();
        const userRole = getUserRole();
        const permissions = getRolePermissions(userRole);

        // Filter sensitive fields from each appointment
        if (data.appointments && Array.isArray(data.appointments)) {
            data.appointments = data.appointments.map(apt => {
                return filterAppointmentData(apt, permissions);
            });
        }

        return data;
    }

    return response;
}
