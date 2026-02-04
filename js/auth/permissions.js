/**
 * @fileoverview Role-Based Access Control (RBAC) Configuration
 *
 * @description
 * Defines permissions for each user role in the RRTS system.
 * Controls page access, feature availability, and UI element visibility.
 *
 * Role Hierarchy (highest to lowest privilege):
 * 1. admin - Full system access, user management, system config
 * 2. supervisor - Operations management, no user/system config
 * 3. booking_agent - Client and appointment management only
 * 4. driver - View own appointments only
 * 5. client - View own appointments only
 *
 * @example
 * // Check if user can access a page
 * if (hasPageAccess(user.role, 'admin')) {
 *     // Show admin page
 * }
 *
 * @example
 * // Check feature permission
 * if (hasFeaturePermission(user.role, 'canDeleteClients')) {
 *     showDeleteButton();
 * }
 *
 * @version 2.0.0
 * @since 2024-01-01
 */

'use strict';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * @typedef {Object} RolePermissions
 * @property {string[]} pages - List of page names the role can access (without .html extension)
 * @property {string[]} features - List of feature identifiers the role can use
 * @property {boolean} canDeleteClients - Can permanently delete client records
 * @property {boolean} canDeleteAppointments - Can soft-delete appointments
 * @property {boolean} canHardDeleteAppointments - Can permanently delete appointments (admin only)
 * @property {boolean} canManageDrivers - Can create, edit, deactivate drivers
 * @property {boolean} canManageUsers - Can create, edit, delete user accounts
 * @property {boolean} canManageSystemConfig - Can modify system-wide settings
 * @property {boolean} canAssignDrivers - Can assign drivers to appointments
 * @property {boolean} canViewDrivers - Can see driver list and details
 * @property {boolean} canViewReports - Can access reporting dashboard
 * @property {boolean} canViewCosts - Can see financial/cost information
 */

/**
 * @typedef {'admin'|'supervisor'|'booking_agent'|'driver'|'client'} UserRole
 */

// =============================================================================
// ROLE PERMISSIONS CONFIGURATION
// =============================================================================

/**
 * Permission configuration for each user role
 *
 * @constant {Object.<UserRole, RolePermissions>}
 */
const ROLE_PERMISSIONS = {
    /**
     * Admin - Full system access
     * Can manage users, system config, and all operations
     */
    'admin': {
        pages: [
            'dashboard',
            'client-management',
            'clients-sl',
            'appointment-management',
            'appointments-new',
            'appointments-sl',
            'appointments-bulk-add',
            'add-appointments',
            'operations',
            'driver-management',
            'admin',
            'finance'
        ],
        features: ['all'], // Special flag - grants all features
        canDeleteClients: true,
        canDeleteAppointments: true,
        canHardDeleteAppointments: true,  // Permanent deletion
        canManageDrivers: true,
        canManageUsers: true,             // Admin exclusive
        canManageSystemConfig: true,      // Admin exclusive
        canAssignDrivers: true,
        canViewDrivers: true,
        canViewReports: true,
        canViewCosts: true
    },

    /**
     * Supervisor - Operations management
     * Can manage clients, appointments, drivers but not users/config
     */
    'supervisor': {
        pages: [
            'dashboard',
            'client-management',
            'clients-sl',
            'appointment-management',
            'appointments-new',
            'appointments-sl',
            'appointments-bulk-add',
            'add-appointments',
            'operations',
            'driver-management',
            'finance'
        ],
        features: [
            'view_clients',
            'edit_clients',
            'delete_clients',
            'view_appointments',
            'edit_appointments',
            'assign_drivers',
            'view_drivers',
            'view_reports'
        ],
        canDeleteClients: true,
        canDeleteAppointments: true,
        canHardDeleteAppointments: false, // Cannot permanently delete
        canManageDrivers: true,
        canManageUsers: false,
        canManageSystemConfig: false,
        canAssignDrivers: true,
        canViewDrivers: true,
        canViewReports: true,
        canViewCosts: true
    },

    /**
     * Booking Agent - Client and appointment management
     * Cannot manage drivers or access operations dashboard
     */
    'booking_agent': {
        pages: [
            'dashboard',
            'client-management',
            'clients-sl',
            'appointment-management',
            'appointments-new',
            'appointments-sl',
            'appointments-bulk-add',
            'add-appointments'
        ],
        features: [
            'view_clients',
            'edit_clients',
            'view_appointments',
            'edit_appointments',
            'create_appointments',
            'view_drivers'           // Can view but not manage
        ],
        canDeleteClients: false,     // Cannot delete clients
        canDeleteAppointments: true, // Can cancel appointments
        canHardDeleteAppointments: false,
        canManageDrivers: false,
        canManageUsers: false,
        canManageSystemConfig: false,
        canAssignDrivers: false,     // Cannot assign drivers
        canViewDrivers: true,
        canViewReports: false,
        canViewCosts: false
    },

    /**
     * Driver - View own assignments only
     * Limited access to protect client privacy
     */
    'driver': {
        pages: [
            'dashboard',
            'appointment-management'
        ],
        features: [
            'view_own_appointments'  // Only their own
        ],
        canDeleteClients: false,
        canDeleteAppointments: false,
        canHardDeleteAppointments: false,
        canManageDrivers: false,
        canManageUsers: false,
        canManageSystemConfig: false,
        canAssignDrivers: false,
        canViewDrivers: true,        // Can see other drivers for coordination
        canViewReports: false,
        canViewCosts: false
    },

    /**
     * Client - External users, minimal access
     * Can only view their own appointments
     */
    'client': {
        pages: [
            'dashboard'
        ],
        features: [
            'view_own_appointments'
        ],
        canDeleteClients: false,
        canDeleteAppointments: false,
        canHardDeleteAppointments: false,
        canManageDrivers: false,
        canManageUsers: false,
        canManageSystemConfig: false,
        canAssignDrivers: false,
        canViewDrivers: false,       // Cannot see driver details
        canViewReports: false,
        canViewCosts: false
    }
};

// =============================================================================
// PERMISSION CHECK FUNCTIONS
// =============================================================================

/**
 * Check if a user role has access to a specific page
 *
 * @param {string} role - The user's role (case-insensitive)
 * @param {string} pageName - The page to check (without .html extension)
 * @returns {boolean} True if role can access the page
 *
 * @example
 * if (hasPageAccess('supervisor', 'admin')) {
 *     // false - supervisors cannot access admin page
 * }
 *
 * @example
 * if (hasPageAccess('admin', 'finance')) {
 *     // true - admins can access finance page
 * }
 */
function hasPageAccess(role, pageName) {
    const normalizedRole = role.toLowerCase();
    const permissions = ROLE_PERMISSIONS[normalizedRole];

    if (!permissions) {
        console.warn(`[Permissions] Unknown role: ${normalizedRole}`);
        return false;
    }

    return permissions.pages.includes(pageName);
}

/**
 * Check if a user role has a specific feature permission
 *
 * @param {string} role - The user's role (case-insensitive)
 * @param {string} feature - The feature identifier to check
 * @returns {boolean} True if role has the feature permission
 *
 * @example
 * if (hasFeaturePermission('booking_agent', 'canDeleteClients')) {
 *     // false - booking agents cannot delete clients
 * }
 */
function hasFeaturePermission(role, feature) {
    const normalizedRole = role.toLowerCase();
    const permissions = ROLE_PERMISSIONS[normalizedRole];

    if (!permissions) {
        return false;
    }

    // Admin has 'all' features - grant any feature check
    if (permissions.features.includes('all')) {
        return true;
    }

    return permissions.features.includes(feature);
}

/**
 * Get the current user's role from session storage
 *
 * @returns {string|null} The user's role, or null if not logged in
 *
 * @example
 * const role = getUserRole();
 * if (role === 'admin') {
 *     showAdminControls();
 * }
 */
function getUserRole() {
    try {
        const savedUser = sessionStorage.getItem('rrts_user');
        if (!savedUser) return null;

        const user = JSON.parse(savedUser);
        return user.role || null;
    } catch (error) {
        console.error('[Permissions] Error getting user role:', error);
        return null;
    }
}

/**
 * Get all permissions for a specific role
 *
 * @param {string} role - The user's role (case-insensitive)
 * @returns {RolePermissions|null} The role's permission object, or null if not found
 *
 * @example
 * const perms = getRolePermissions('supervisor');
 * if (perms.canViewCosts) {
 *     loadFinancialData();
 * }
 */
function getRolePermissions(role) {
    const normalizedRole = role.toLowerCase();
    return ROLE_PERMISSIONS[normalizedRole] || null;
}

// =============================================================================
// UI FILTERING FUNCTIONS
// =============================================================================

/**
 * Hide navigation links that the user's role cannot access
 *
 * Finds all navigation links and hides those pointing to pages
 * the user doesn't have permission to view.
 *
 * @param {string} role - The user's role
 * @returns {void}
 *
 * @example
 * // Call after DOM is loaded
 * document.addEventListener('DOMContentLoaded', () => {
 *     filterNavigationByRole(getUserRole());
 * });
 */
function filterNavigationByRole(role) {
    if (!role) return;

    const permissions = ROLE_PERMISSIONS[role.toLowerCase()];
    if (!permissions) {
        console.warn(`[Permissions] Unknown role: ${role}`);
        return;
    }

    const allowedPages = permissions.pages;

    // Find all navigation links
    const navLinks = document.querySelectorAll('.nav-links a');

    navLinks.forEach(link => {
        const href = link.getAttribute('href');

        // Skip logout, anchors, and javascript links
        if (!href || href === '#' || href.startsWith('javascript:')) {
            return;
        }

        // Extract page name from href (remove .html and handle index)
        const pageName = href
            .replace('.html', '')
            .replace('index.html', 'dashboard');

        // Hide links to pages not in allowed list
        if (!allowedPages.includes(pageName)) {
            link.style.display = 'none';
        }
    });

    console.log(`[Permissions] Navigation filtered for role: ${role}`);
}

/**
 * Enforce page access - redirect unauthorized users
 *
 * Call at the start of each protected page's initialization.
 * Redirects to dashboard if user lacks permission.
 *
 * @returns {boolean} True if access is granted, false if redirecting
 *
 * @example
 * document.addEventListener('DOMContentLoaded', () => {
 *     if (!enforcePageAccess()) return; // Will redirect
 *     // Continue page initialization
 * });
 */
function enforcePageAccess() {
    // Extract page name from current URL
    let currentPage = window.location.pathname
        .split('/')
        .pop()
        .replace('.html', '')
        .replace('index.html', 'dashboard');

    // Handle TEST- prefix for development/staging environment
    if (currentPage.startsWith('TEST-')) {
        currentPage = currentPage.substring(5); // Remove 'TEST-' prefix
    }

    const userRole = getUserRole();

    // No user - redirect to login
    if (!userRole) {
        const redirectPage = window.location.pathname.includes('TEST-')
            ? 'TEST-dashboard.html'
            : 'dashboard.html';
        window.location.href = redirectPage;
        return false;
    }

    // User lacks permission - redirect to dashboard
    if (!hasPageAccess(userRole, currentPage)) {
        alert('You do not have access to this page.');
        const redirectPage = window.location.pathname.includes('TEST-')
            ? 'TEST-dashboard.html'
            : 'dashboard.html';
        window.location.href = redirectPage;
        return false;
    }

    return true;
}

// =============================================================================
// CONVENIENCE PERMISSION CHECKERS
// =============================================================================

/**
 * Check if current user can delete clients
 * @returns {boolean}
 */
function canDeleteClients() {
    const role = getUserRole();
    return role ? (ROLE_PERMISSIONS[role]?.canDeleteClients ?? false) : false;
}

/**
 * Check if current user can manage users
 * @returns {boolean}
 */
function canManageUsers() {
    const role = getUserRole();
    return role ? (ROLE_PERMISSIONS[role]?.canManageUsers ?? false) : false;
}

/**
 * Check if current user can assign drivers
 * @returns {boolean}
 */
function canAssignDrivers() {
    const role = getUserRole();
    return role ? (ROLE_PERMISSIONS[role]?.canAssignDrivers ?? false) : false;
}

/**
 * Check if current user can view financial/cost data
 * @returns {boolean}
 */
function canViewCosts() {
    const role = getUserRole();
    return role ? (ROLE_PERMISSIONS[role]?.canViewCosts ?? false) : false;
}
