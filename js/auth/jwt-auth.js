// JWT Authentication Helper
// Shared across all RRTS frontend pages
// Version: 1.0.0

// API Configuration
const JWT_API_ENDPOINTS = {
    LOGIN: 'https://webhook-processor-production-3bb8.up.railway.app/webhook/user-login',
    CHANGE_PASSWORD: 'https://webhook-processor-production-3bb8.up.railway.app/webhook/change-password',
    REFRESH_TOKEN: 'https://webhook-processor-production-3bb8.up.railway.app/webhook/refresh-token'
};

// Role-based session timeout durations (must match session-manager.js)
const SESSION_TIMEOUTS = {
    admin: 30 * 60 * 1000,           // 30 minutes
    supervisor: 60 * 60 * 1000,       // 60 minutes (1 hour)
    booking_agent: 120 * 60 * 1000,   // 120 minutes (2 hours)
    driver: 120 * 60 * 1000,          // 120 minutes (2 hours)
    client: 120 * 60 * 1000           // 120 minutes (2 hours)
};
const DEFAULT_SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const LAST_ACTIVITY_KEY = 'rrts_last_activity';

// Check if user has been inactive too long (prevents token refresh after extended absence)
function checkInactivityTimeout() {
    const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY);
    const userJson = sessionStorage.getItem('rrts_user');

    // If no last activity recorded, this is first login - allow
    if (!lastActivity) {
        return false; // Not inactive too long
    }

    // Get user role to determine timeout
    let userRole = 'admin'; // Default to strictest timeout
    if (userJson) {
        try {
            const user = JSON.parse(userJson);
            userRole = user.role || 'admin';
        } catch (e) {
            console.error('Error parsing user for inactivity check:', e);
        }
    }

    const lastActivityTime = parseInt(lastActivity);
    const now = Date.now();
    const inactiveTime = now - lastActivityTime;
    const timeout = SESSION_TIMEOUTS[userRole] || DEFAULT_SESSION_TIMEOUT;

    console.log(`[Auth] Inactivity check: ${Math.round(inactiveTime / 60000)} min inactive, ${timeout / 60000} min timeout for ${userRole}`);

    return inactiveTime > timeout;
}

// Check if user is authenticated (call this on page load)
async function requireAuth(redirectUrl = 'dashboard.html') {
    const accessToken = sessionStorage.getItem('rrts_access_token');
    const user = sessionStorage.getItem('rrts_user');

    if (!accessToken || !user) {
        console.log('No authentication found - redirecting to login');
        window.location.href = redirectUrl;
        return false;
    }

    // SECURITY: Check if user has been inactive too long BEFORE attempting token refresh
    // This prevents token renewal after extended absence (e.g., returning next day)
    if (checkInactivityTimeout()) {
        console.log('Session expired due to inactivity - forcing logout');
        alert('Your session has expired due to inactivity. Please log in again.');
        logout();
        return false;
    }

    // Check if token is expired
    if (isTokenExpired()) {
        console.log('Token expired - attempting refresh');
        const refreshed = await refreshAccessToken();

        if (!refreshed) {
            console.log('Token refresh failed - redirecting to login');
            logout();
            return false;
        }
    }

    // Reset activity timestamp — user is actively navigating to a protected page
    sessionStorage.setItem('rrts_last_activity', Date.now().toString());

    // Start token refresh timer
    startTokenRefreshTimer();

    return true;
}

// Get current user from session storage
function getCurrentUser() {
    const userJson = sessionStorage.getItem('rrts_user');
    if (userJson) {
        try {
            return JSON.parse(userJson);
        } catch (e) {
            console.error('Error parsing user data:', e);
            return null;
        }
    }
    return null;
}

// Get authorization headers for API calls
function getAuthHeaders() {
    const accessToken = sessionStorage.getItem('rrts_access_token');

    if (accessToken) {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        };
    }

    return {
        'Content-Type': 'application/json'
    };
}

// Token refresh timer (refreshes every 45 minutes)
function startTokenRefreshTimer() {
    // Clear existing timer if any
    if (window.tokenRefreshInterval) {
        clearInterval(window.tokenRefreshInterval);
    }

    // Refresh token every 45 minutes (token expires in 1 hour)
    window.tokenRefreshInterval = setInterval(async () => {
        console.log('Token refresh timer triggered');
        await refreshAccessToken();
    }, 45 * 60 * 1000);

    console.log('Token refresh timer started (45 min interval)');
}

// Refresh access token using refresh token
async function refreshAccessToken() {
    const refreshToken = sessionStorage.getItem('rrts_refresh_token');

    if (!refreshToken) {
        console.log('No refresh token found - user needs to login');
        return false;
    }

    try {
        console.log('Refreshing access token...');

        const response = await fetch(JWT_API_ENDPOINTS.REFRESH_TOKEN, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                refresh_token: refreshToken
            })
        });

        const result = await response.json();

        if (result.success) {
            // Update access token and expiry
            sessionStorage.setItem('rrts_access_token', result.access_token);
            sessionStorage.setItem('rrts_token_expiry', Date.now() + (result.expires_in * 1000));

            // Store new refresh token (rotation security feature)
            if (result.refresh_token) {
                sessionStorage.setItem('rrts_refresh_token', result.refresh_token);
                console.log('Refresh token rotated successfully');
            }

            console.log('Access token refreshed successfully');
            return true;
        } else {
            console.error('Token refresh failed:', result.message);
            // If refresh fails, redirect to login
            alert('Your session has expired. Please login again.');
            logout();
            return false;
        }
    } catch (error) {
        console.error('Token refresh error:', error);
        return false;
    }
}

// Logout function (clears all tokens and redirects to login)
function logout() {
    // Clear all session storage
    sessionStorage.removeItem('rrts_user');
    sessionStorage.removeItem('rrts_access_token');
    sessionStorage.removeItem('rrts_refresh_token');
    sessionStorage.removeItem('rrts_token_expiry');
    sessionStorage.removeItem('rrts_limited_token');
    sessionStorage.removeItem('rrts_temp_username');
    sessionStorage.removeItem('rrts_temp_password');
    sessionStorage.removeItem(LAST_ACTIVITY_KEY); // Clear last activity timestamp

    // Clear token refresh timer if exists
    if (window.tokenRefreshInterval) {
        clearInterval(window.tokenRefreshInterval);
    }

    console.log('Logged out - redirecting to login');

    // Redirect to dashboard.html (which shows login screen)
    window.location.href = 'dashboard.html';
}

// Check if token is expired or about to expire
function isTokenExpired() {
    const expiry = sessionStorage.getItem('rrts_token_expiry');

    if (!expiry) {
        return true;
    }

    const expiryTime = parseInt(expiry);
    const now = Date.now();

    // Consider expired if less than 5 minutes remaining
    return (expiryTime - now) < (5 * 60 * 1000);
}

// Make authenticated API call with automatic token refresh
async function authenticatedFetch(url, options = {}) {
    // Check if token is expired or about to expire
    if (isTokenExpired()) {
        console.log('Token expired or expiring soon - refreshing...');
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            throw new Error('Failed to refresh token');
        }
    }

    // Add auth headers to options
    options.headers = getAuthHeaders();

    // Make the request
    try {
        const response = await fetch(url, options);

        // If unauthorized, try to refresh token once
        if (response.status === 401) {
            console.log('Received 401 - attempting token refresh');
            const refreshed = await refreshAccessToken();

            if (refreshed) {
                // Retry request with new token
                options.headers = getAuthHeaders();
                return await fetch(url, options);
            } else {
                // Refresh failed - logout
                logout();
                throw new Error('Authentication failed');
            }
        }

        return response;
    } catch (error) {
        console.error('Authenticated fetch error:', error);
        throw error;
    }
}

// JWTManager object for compatibility with session-manager.js
const JWTManager = {
    getCurrentUser: function() {
        return getCurrentUser();
    },

    isAuthenticated: function() {
        const accessToken = sessionStorage.getItem('rrts_access_token');
        const user = sessionStorage.getItem('rrts_user');
        return !!(accessToken && user);
    },

    clearTokens: function() {
        sessionStorage.removeItem('rrts_user');
        sessionStorage.removeItem('rrts_access_token');
        sessionStorage.removeItem('rrts_refresh_token');
        sessionStorage.removeItem('rrts_token_expiry');
        sessionStorage.removeItem('rrts_limited_token');
        sessionStorage.removeItem('rrts_temp_username');
        sessionStorage.removeItem('rrts_temp_password');
        sessionStorage.removeItem(LAST_ACTIVITY_KEY);

        // Clear token refresh timer if exists
        if (window.tokenRefreshInterval) {
            clearInterval(window.tokenRefreshInterval);
        }
    },

    getAccessToken: async function() {
        // Check if token needs refresh first
        if (isTokenExpired()) {
            await refreshAccessToken();
        }
        return sessionStorage.getItem('rrts_access_token');
    }
};

// Initialize JWT auth on page load
console.log('JWT Authentication Helper loaded');
