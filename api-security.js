/**
 * API Security Module
 * Implements security considerations for backend API calls
 * 
 * Key Features:
 * 1. Role-based API request validation
 * 2. Data scrubbing for unauthorized users
 * 3. Audit logging for security events
 * 4. Least privilege enforcement
 */

/**
 * Secure API Request Wrapper
 * Filters sensitive data based on user role before sending to backend
 * 
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @param {object} data - Request data to send
 * @returns {Promise} Fetch promise with filtered data
 */
async function secureApiRequest(endpoint, options = {}, data = null) {
    const userRole = getUserRole();
    const permissions = getRolePermissions(userRole);
    
    // Filter sensitive data based on permissions
    if (data) {
        data = filterSensitiveData(data, permissions);
        
        // Add audit log
        logSecurityEvent('api_request', {
            endpoint,
            userRole,
            timestamp: new Date().toISOString()
        });
    }
    
    // Update options with filtered data
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
        // Log error
        logSecurityEvent('api_error', {
            endpoint,
            userRole,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}

/**
 * Filter sensitive data based on user permissions
 * Implements principle of least privilege
 * 
 * @param {object} data - Data to filter
 * @param {object} permissions - User permissions
 * @returns {object} Filtered data
 */
function filterSensitiveData(data, permissions) {
    const filtered = { ...data };
    
    // Remove cost information for users who can't view costs
    if (!permissions?.canViewCosts) {
        // Remove cost-related fields
        delete filtered.cost;
        delete filtered.totalCost;
        delete filtered.appointmentCost;
        delete filtered.estimatedCost;
        delete filtered.billingAmount;
        
        // If data is nested (e.g., appointment object), filter nested fields
        if (filtered.appointments && Array.isArray(filtered.appointments)) {
            filtered.appointments = filtered.appointments.map(apt => {
                const { cost, appointmentCost, ...filteredApt } = apt;
                return filteredApt;
            });
        }
    }
    
    // Remove driver assignment data for users who can't assign drivers
    if (!permissions?.canAssignDrivers && filtered.appointments) {
        // Don't remove, but ensure we're not sending changes
        // Backend should reject driver changes from unauthorized users
    }
    
    return filtered;
}

/**
 * Create a secure appointment update request
 * Prevents unauthorized field modifications
 * 
 * @param {object} appointmentData - Appointment data to update
 * @returns {object} Safe appointment data
 */
function createSecureAppointmentUpdate(appointmentData) {
    const userRole = getUserRole();
    const permissions = getRolePermissions(userRole);
    const safeData = {};
    
    // Fields that booking agents can update
    const allowedFields = [
        'kNumber',
        'appointmentDateTime',
        'pickupTime',
        'locationName',
        'locationAddress',
        'appointmentLength',
        'notes'
    ];
    
    // Supervisors/admins can also update status and driver
    if (permissions?.canAssignDrivers) {
        allowedFields.push('status');
        allowedFields.push('driverAssigned');
    } else if (permissions?.canEditAppointments) {
        allowedFields.push('status');
    }
    
    // Only include allowed fields
    allowedFields.forEach(field => {
        if (appointmentData[field] !== undefined) {
            safeData[field] = appointmentData[field];
        }
    });
    
    return safeData;
}

/**
 * Validate and log security events to audit_logs table
 *
 * @param {string} eventType - Type of security event
 * @param {object} details - Event details
 */
async function logSecurityEvent(eventType, details) {
    // Get current user context
    const user = getCurrentUser();
    if (!user) {
        console.warn('[SECURITY] Cannot log event: no user context');
        return;
    }

    // Prepare audit log entry
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
        ip_address: null, // Could be captured if needed
        user_agent: navigator.userAgent,
        success: details.success !== undefined ? details.success : true,
        error_message: details.error || null
    };

    // Log to console in development
    console.log('[AUDIT]', eventType, details);

    // Send to backend audit log workflow
    try {
        const response = await authenticatedFetch(
            'https://webhook-processor-production-3bb8.up.railway.app/webhook/store-audit-log',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(auditLogData)
            }
        );

        if (!response.ok) {
            console.error('[AUDIT] Failed to store audit log:', response.status);
        }
    } catch (error) {
        // Fail silently - don't block user actions if logging fails
        console.error('[AUDIT] Error storing audit log:', error);
    }
}

/**
 * Secure API helper functions for common operations
 */

/**
 * Save appointment securely
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
 * Update appointment securely
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
 * Get appointments with filtered data based on permissions
 */
async function secureGetAppointments(endpoint) {
    const response = await secureApiRequest(endpoint, { method: 'GET' });
    
    if (response.ok) {
        const data = await response.json();
        const userRole = getUserRole();
        const permissions = getRolePermissions(userRole);
        
        // Filter sensitive fields from response
        if (data.appointments && Array.isArray(data.appointments)) {
            data.appointments = data.appointments.map(apt => {
                return filterAppointmentData(apt, permissions);
            });
        }
        
        return data;
    }
    
    return response;
}

/**
 * Filter appointment data based on permissions
 */
function filterAppointmentData(appointment, permissions) {
    const filtered = { ...appointment };
    
    // Remove cost information
    if (!permissions?.canViewCosts) {
        delete filtered.cost;
        delete filtered.appointmentCost;
        delete filtered.totalCost;
        delete filtered.billingAmount;
        delete filtered.estimatedCost;
    }
    
    return filtered;
}

/**
 * Validate user has permission for action before making request
 */
function validatePermission(action) {
    const userRole = getUserRole();
    const permissions = getRolePermissions(userRole);
    
    const permissionMap = {
        'delete_client': permissions?.canDeleteClients,
        'delete_appointment': permissions?.canDeleteAppointments,
        'assign_driver': permissions?.canAssignDrivers,
        'view_costs': permissions?.canViewCosts,
        'manage_users': permissions?.canManageUsers
    };
    
    const hasPermission = permissionMap[action];
    
    if (!hasPermission) {
        logSecurityEvent('permission_denied', {
            action,
            userRole,
            timestamp: new Date().toISOString()
        });
        
        throw new Error(`Permission denied: You do not have permission to ${action}`);
    }
    
    return true;
}
