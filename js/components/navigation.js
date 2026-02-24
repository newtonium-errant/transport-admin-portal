/**
 * RRTS Navigation Component
 * Provides consistent RBAC-based navigation across all pages
 * Version: 1.0.0
 */

// Standard navigation items with RBAC roles
const NAV_ITEMS = [
    { page: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2', roles: ['admin', 'supervisor', 'booking_agent', 'driver'] },
    { page: 'appointments', label: 'Appointments', icon: 'bi-calendar-check', roles: ['admin', 'supervisor', 'booking_agent'] },
    { page: 'appointments-bulk-add', label: 'Bulk Add', icon: 'bi-calendar-plus', roles: ['admin', 'supervisor', 'booking_agent'] },
    { page: 'clients', label: 'Clients', icon: 'bi-people', roles: ['admin', 'supervisor', 'booking_agent'] },
    { page: 'driver-management', label: 'Drivers', icon: 'bi-truck', roles: ['admin', 'supervisor'] },
    { page: 'operations', label: 'Operations', icon: 'bi-clipboard-data', roles: ['admin', 'supervisor'] },
    { page: 'finance', label: 'Finance', icon: 'bi-currency-dollar', roles: ['admin', 'supervisor'] },
    { page: 'admin', label: 'Admin', icon: 'bi-gear', roles: ['admin'] }
];

/**
 * Initialize the navigation menu based on user role
 * @param {Object} options - Configuration options
 * @param {string} options.containerId - ID of the nav container element (default: 'mainNav')
 * @param {string} options.userAvatarId - ID of the user avatar element (default: 'userAvatar')
 * @param {string} options.userNameId - ID of the user name element (default: 'userName')
 * @param {string} options.userRoleId - ID of the user role badge element (default: 'userRoleBadge' or 'userRole')
 */
function initializeNavigation(options = {}) {
    const containerId = options.containerId || 'mainNav';
    const userAvatarId = options.userAvatarId || 'userAvatar';
    const userNameId = options.userNameId || 'userName';
    const userRoleId = options.userRoleId || 'userRoleBadge';

    // Get user from session storage
    const user = JSON.parse(sessionStorage.getItem('rrts_user') || '{}');
    const role = (user.role || 'guest').toLowerCase();

    // Update user display elements if they exist
    const userAvatar = document.getElementById(userAvatarId);
    const userName = document.getElementById(userNameId);
    const userRole = document.getElementById(userRoleId) || document.getElementById('userRole');

    if (userAvatar) {
        const name = user.fullName || user.full_name || user.username || 'U';
        userAvatar.textContent = name.charAt(0).toUpperCase();
    }

    if (userName) {
        userName.textContent = user.fullName || user.full_name || user.username || 'User';
        userName.style.cursor = 'pointer';
        userName.onclick = () => window.location.href = 'profile.html';
        userName.title = 'View Profile';
    }

    if (userRole) {
        userRole.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    }

    // Get navigation container
    const navContainer = document.getElementById(containerId);
    if (!navContainer) {
        console.warn(`Navigation container #${containerId} not found`);
        return;
    }

    // Clear existing navigation
    navContainer.innerHTML = '';

    // Get current page name (without .html extension)
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'dashboard';

    // Build navigation links based on role
    NAV_ITEMS.forEach(item => {
        if (item.roles.includes(role)) {
            const link = document.createElement('a');
            link.href = `${item.page}.html`;
            link.className = 'nav-link';

            // Mark current page as active
            if (item.page === currentPage) {
                link.classList.add('active');
            }

            link.innerHTML = `<i class="bi ${item.icon}"></i> ${item.label}`;
            navContainer.appendChild(link);
        }
    });
}

/**
 * Setup mobile menu toggle functionality
 * @param {Object} options - Configuration options
 * @param {string} options.toggleId - ID of the toggle button (default: 'mobileMenuToggle')
 * @param {string} options.navId - ID of the nav element (default: 'mainNav')
 */
function setupMobileMenu(options = {}) {
    const toggleId = options.toggleId || 'mobileMenuToggle';
    const navId = options.navId || 'mainNav';

    const toggleBtn = document.getElementById(toggleId);
    const nav = document.getElementById(navId);

    if (!toggleBtn || !nav) return;

    toggleBtn.addEventListener('click', () => {
        nav.classList.toggle('mobile-open');

        // Toggle icon between list and X
        const icon = toggleBtn.querySelector('i');
        if (icon) {
            if (nav.classList.contains('mobile-open')) {
                icon.className = 'bi bi-x-lg';
            } else {
                icon.className = 'bi bi-list';
            }
        }
    });

    // Close mobile menu when clicking a nav link
    nav.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            nav.classList.remove('mobile-open');
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                icon.className = 'bi bi-list';
            }
        });
    });
}

/**
 * Standard logout function - clears all tokens and redirects to dashboard
 */
function logout() {
    sessionStorage.removeItem('rrts_user');
    sessionStorage.removeItem('rrts_access_token');
    sessionStorage.removeItem('rrts_refresh_token');
    window.location.href = 'dashboard.html';
}

// Auto-initialize on DOMContentLoaded if nav container exists
document.addEventListener('DOMContentLoaded', function() {
    // Only auto-initialize if mainNav exists and hasn't been initialized
    const navContainer = document.getElementById('mainNav');
    if (navContainer && navContainer.children.length === 0) {
        initializeNavigation();
        setupMobileMenu();
    }
});
