/**
 * RRTS Role-Based Access Control (RBAC) Configuration
 * 
 * This file defines what each user role can access and what features they can use.
 */

const ROLE_PERMISSIONS = {
    'admin': {
        pages: ['dashboard', 'client-management', 'clients-sl', 'appointment-management', 'appointments-new', 'appointments-sl', 'appointments-bulk-add', 'add-appointments', 'operations', 'driver-management', 'admin'],
        features: ['all'],
        canDeleteClients: true,
        canDeleteAppointments: true,
        canHardDeleteAppointments: true,
        canManageDrivers: true,
        canManageUsers: true,
        canManageSystemConfig: true,
        canAssignDrivers: true,
        canViewDrivers: true,
        canViewReports: true,
        canViewCosts: true
    },
    'supervisor': {
        pages: ['dashboard', 'client-management', 'clients-sl', 'appointment-management', 'appointments-new', 'appointments-sl', 'appointments-bulk-add', 'add-appointments', 'operations', 'driver-management'],
        features: ['view_clients', 'edit_clients', 'delete_clients', 'view_appointments', 'edit_appointments', 'assign_drivers', 'view_drivers', 'view_reports'],
        canDeleteClients: true,
        canDeleteAppointments: true,
        canHardDeleteAppointments: false,
        canManageDrivers: true,
        canManageUsers: false,
        canManageSystemConfig: false,
        canAssignDrivers: true,
        canViewDrivers: true,
        canViewReports: true,
        canViewCosts: true
    },
    'booking_agent': {
        pages: ['dashboard', 'client-management', 'clients-sl', 'appointment-management', 'appointments-new', 'appointments-sl', 'appointments-bulk-add', 'add-appointments'],
        features: ['view_clients', 'edit_clients', 'view_appointments', 'edit_appointments', 'create_appointments', 'view_drivers'],
        canDeleteClients: false,
        canDeleteAppointments: false,
        canManageDrivers: false,
        canManageUsers: false,
        canManageSystemConfig: false,
        canAssignDrivers: false,
        canViewDrivers: true,
        canViewReports: false,
        canViewCosts: false
    },
    'driver': {
        pages: ['dashboard', 'appointment-management'],
        features: ['view_own_appointments'],
        canDeleteClients: false,
        canDeleteAppointments: false,
        canManageDrivers: false,
        canManageUsers: false,
        canManageSystemConfig: false,
        canAssignDrivers: false,
        canViewDrivers: true,
        canViewReports: false,
        canViewCosts: false
    },
    'client': {
        pages: ['dashboard'],
        features: ['view_own_appointments'],
        canDeleteClients: false,
        canDeleteAppointments: false,
        canManageDrivers: false,
        canManageUsers: false,
        canManageSystemConfig: false,
        canAssignDrivers: false,
        canViewDrivers: false,
        canViewReports: false,
        canViewCosts: false
    }
};

/**
 * Check if a user role has access to a specific page
 * @param {string} role - The user's role
 * @param {string} pageName - The page to check (without .html extension)
 * @returns {boolean}
 */
function hasPageAccess(role, pageName) {
    const normalizedRole = role.toLowerCase();
    const permissions = ROLE_PERMISSIONS[normalizedRole];
    
    if (!permissions) {
        console.warn(`Unknown role: ${normalizedRole}`);
        return false;
    }
    
    return permissions.pages.includes(pageName);
}

/**
 * Check if a user role has a specific feature permission
 * @param {string} role - The user's role
 * @param {string} feature - The feature to check
 * @returns {boolean}
 */
function hasFeaturePermission(role, feature) {
    const normalizedRole = role.toLowerCase();
    const permissions = ROLE_PERMISSIONS[normalizedRole];
    
    if (!permissions) {
        return false;
    }
    
    // Admin has access to everything
    if (permissions.features.includes('all')) {
        return true;
    }
    
    return permissions.features.includes(feature);
}

/**
 * Get the user's role from session storage
 * @returns {string|null}
 */
function getUserRole() {
    try {
        const savedUser = sessionStorage.getItem('rrts_user');
        if (!savedUser) return null;
        
        const user = JSON.parse(savedUser);
        return user.role || null;
    } catch (error) {
        console.error('Error getting user role:', error);
        return null;
    }
}

/**
 * Get all permissions for a specific role
 * @param {string} role - The user's role
 * @returns {object|null}
 */
function getRolePermissions(role) {
    const normalizedRole = role.toLowerCase();
    return ROLE_PERMISSIONS[normalizedRole] || null;
}

/**
 * Filter navigation links based on user role
 * Should be called after DOM content is loaded
 */
function filterNavigationByRole(role) {
    if (!role) return;
    
    const permissions = ROLE_PERMISSIONS[role.toLowerCase()];
    if (!permissions) {
        console.warn(`Unknown role: ${role}`);
        return;
    }
    
    const allowedPages = permissions.pages;
    
    // Find all navigation links
    const navLinks = document.querySelectorAll('.nav-links a');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        
        // Skip logout and external links
        if (!href || href === '#' || href.startsWith('javascript:')) {
            return;
        }
        
        // Extract page name from href
        const pageName = href.replace('.html', '').replace('index.html', 'dashboard');
        
        // Hide if page is not in allowed pages
        if (!allowedPages.includes(pageName)) {
            link.style.display = 'none';
        }
    });
    
    console.log(`Navigation filtered for role: ${role}`);
}

/**
 * Enforce page access - redirect if user doesn't have access
 * Should be called at the start of each page's DOMContentLoaded event
 */
function enforcePageAccess() {
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '').replace('index.html', 'dashboard');
    const userRole = getUserRole();
    
    if (!userRole) {
        window.location.href = 'dashboard.html';
        return;
    }
    
    if (!hasPageAccess(userRole, currentPage)) {
        alert('You do not have access to this page.');
        window.location.href = 'dashboard.html';
        return;
    }
    
    return true;
}
