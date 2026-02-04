/**
 * @fileoverview JWT Authentication Helper for RRTS Frontend
 *
 * @description
 * Provides JWT-based authentication utilities shared across all RRTS pages.
 * Handles token storage, refresh, expiration checking, and authenticated API calls.
 *
 * Token Flow:
 * 1. User logs in → receives access_token (1hr) + refresh_token (7 days)
 * 2. Access token stored in sessionStorage (cleared on tab close)
 * 3. Token auto-refreshes 15 minutes before expiry
 * 4. On 401 response, attempts one refresh before logout
 *
 * @example
 * // On protected page load
 * if (await requireAuth()) {
 *     // User is authenticated, load page content
 *     loadDashboardData();
 * }
 *
 * @example
 * // Making authenticated API calls
 * const response = await authenticatedFetch('/api/endpoint', {
 *     method: 'POST',
 *     body: JSON.stringify(data)
 * });
 *
 * @requires No external dependencies (standalone module)
 * @version 2.0.0
 * @since 2024-01-01
 */

'use strict';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * API endpoints for authentication operations
 * @constant {Object.<string, string>}
 */
const JWT_API_ENDPOINTS = {
    /** User login endpoint - returns access_token, refresh_token */
    LOGIN: 'https://webhook-processor-production-3bb8.up.railway.app/webhook/user-login',
    /** Password change endpoint - requires current password verification */
    CHANGE_PASSWORD: 'https://webhook-processor-production-3bb8.up.railway.app/webhook/change-password',
    /** Token refresh endpoint - exchanges refresh_token for new access_token */
    REFRESH_TOKEN: 'https://webhook-processor-production-3bb8.up.railway.app/webhook/refresh-token'
};

/**
 * Session storage keys used by this module
 * @constant {Object.<string, string>}
 */
const STORAGE_KEYS = {
    /** JSON-encoded user object {id, username, role, fullName} */
    USER: 'rrts_user',
    /** JWT access token (short-lived, ~1 hour) */
    ACCESS_TOKEN: 'rrts_access_token',
    /** JWT refresh token (long-lived, ~7 days) */
    REFRESH_TOKEN: 'rrts_refresh_token',
    /** Timestamp (ms) when access token expires */
    TOKEN_EXPIRY: 'rrts_token_expiry',
    /** Limited token for password change flow */
    LIMITED_TOKEN: 'rrts_limited_token',
    /** Temporary username during password change */
    TEMP_USERNAME: 'rrts_temp_username',
    /** Temporary password during password change */
    TEMP_PASSWORD: 'rrts_temp_password'
};

// =============================================================================
// TIMING CONSTANTS
// =============================================================================

/**
 * Token refresh interval in milliseconds
 * Tokens expire after 60 minutes, so refresh at 45 minutes to ensure
 * continuous authentication without interruption
 * @constant {number}
 */
const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000; // 45 minutes

/**
 * Buffer time before token expiry to consider it "expired"
 * If less than 5 minutes remain, proactively refresh to avoid
 * mid-request expiration
 * @constant {number}
 */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// AUTHENTICATION CHECK
// =============================================================================

/**
 * Verify user is authenticated, redirect to login if not
 *
 * Call this at the start of every protected page to ensure
 * the user has valid credentials before loading content.
 *
 * @param {string} [redirectUrl='dashboard.html'] - Page to redirect to if not authenticated
 * @returns {Promise<boolean>} True if authenticated, false if redirecting to login
 *
 * @example
 * document.addEventListener('DOMContentLoaded', async () => {
 *     if (!await requireAuth()) return; // Will redirect if not authenticated
 *     // User is authenticated, continue loading page
 *     initializePage();
 * });
 */
async function requireAuth(redirectUrl = 'dashboard.html') {
    const accessToken = sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const user = sessionStorage.getItem(STORAGE_KEYS.USER);

    // No credentials found - redirect to login
    if (!accessToken || !user) {
        console.log('[JWT] No authentication found - redirecting to login');
        window.location.href = redirectUrl;
        return false;
    }

    // Token expired or expiring soon - attempt refresh
    if (isTokenExpired()) {
        console.log('[JWT] Token expired - attempting refresh');
        const refreshed = await refreshAccessToken();

        if (!refreshed) {
            console.log('[JWT] Token refresh failed - redirecting to login');
            logout();
            return false;
        }
    }

    // Start automatic token refresh timer
    startTokenRefreshTimer();

    return true;
}

// =============================================================================
// USER DATA ACCESS
// =============================================================================

/**
 * Get current authenticated user from session storage
 *
 * @returns {Object|null} User object or null if not logged in
 * @returns {string} return.id - User's unique identifier
 * @returns {string} return.username - User's login username
 * @returns {string} return.role - User's role (admin, supervisor, booking_agent, driver, client)
 * @returns {string} return.fullName - User's display name
 *
 * @example
 * const user = getCurrentUser();
 * if (user) {
 *     console.log(`Logged in as ${user.fullName} (${user.role})`);
 * }
 */
function getCurrentUser() {
    const userJson = sessionStorage.getItem(STORAGE_KEYS.USER);
    if (userJson) {
        try {
            return JSON.parse(userJson);
        } catch (e) {
            console.error('[JWT] Error parsing user data:', e);
            return null;
        }
    }
    return null;
}

/**
 * Get HTTP headers for authenticated API requests
 *
 * @returns {Object} Headers object with Content-Type and Authorization (if token exists)
 *
 * @example
 * const response = await fetch(url, {
 *     method: 'POST',
 *     headers: getAuthHeaders(),
 *     body: JSON.stringify(data)
 * });
 */
function getAuthHeaders() {
    const accessToken = sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);

    const headers = {
        'Content-Type': 'application/json'
    };

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    return headers;
}

// =============================================================================
// TOKEN REFRESH
// =============================================================================

/**
 * Start automatic token refresh timer
 *
 * Sets up an interval to refresh the access token before it expires.
 * Clears any existing timer before starting a new one.
 *
 * @returns {void}
 * @private
 */
function startTokenRefreshTimer() {
    // Clear existing timer to prevent duplicates
    if (window.tokenRefreshInterval) {
        clearInterval(window.tokenRefreshInterval);
    }

    // Schedule refresh every 45 minutes (15 min before 1hr expiry)
    window.tokenRefreshInterval = setInterval(async () => {
        console.log('[JWT] Token refresh timer triggered');
        await refreshAccessToken();
    }, TOKEN_REFRESH_INTERVAL_MS);

    console.log(`[JWT] Token refresh timer started (${TOKEN_REFRESH_INTERVAL_MS / 60000} min interval)`);
}

/**
 * Refresh access token using the refresh token
 *
 * Exchanges the long-lived refresh token for a new short-lived access token.
 * Also handles refresh token rotation if the server provides a new one.
 *
 * @returns {Promise<boolean>} True if refresh succeeded, false if failed
 *
 * @description
 * Error scenarios:
 * - No refresh token stored: Returns false, user must re-login
 * - Network error: Returns false, logs error
 * - Invalid/expired refresh token: Returns false, triggers logout with alert
 * - Success with token rotation: Stores new refresh token automatically
 */
async function refreshAccessToken() {
    const refreshToken = sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

    if (!refreshToken) {
        console.log('[JWT] No refresh token found - user needs to login');
        return false;
    }

    try {
        console.log('[JWT] Refreshing access token...');

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
            // Store new access token and calculate expiry time
            sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, result.access_token);
            sessionStorage.setItem(
                STORAGE_KEYS.TOKEN_EXPIRY,
                String(Date.now() + (result.expires_in * 1000))
            );

            // Handle refresh token rotation (security feature)
            // Server may issue new refresh token to limit token lifetime
            if (result.refresh_token) {
                sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, result.refresh_token);
                console.log('[JWT] Refresh token rotated successfully');
            }

            console.log('[JWT] Access token refreshed successfully');
            return true;
        } else {
            console.error('[JWT] Token refresh failed:', result.message);
            alert('Your session has expired. Please login again.');
            logout();
            return false;
        }
    } catch (error) {
        console.error('[JWT] Token refresh error:', error);
        return false;
    }
}

/**
 * Check if access token is expired or about to expire
 *
 * @returns {boolean} True if token is expired or expires within buffer time
 *
 * @example
 * if (isTokenExpired()) {
 *     await refreshAccessToken();
 * }
 */
function isTokenExpired() {
    const expiry = sessionStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);

    // No expiry stored - treat as expired
    if (!expiry) {
        return true;
    }

    const expiryTime = parseInt(expiry, 10);
    const now = Date.now();

    // Consider expired if less than buffer time remaining
    // This prevents mid-request expiration
    return (expiryTime - now) < TOKEN_EXPIRY_BUFFER_MS;
}

// =============================================================================
// LOGOUT
// =============================================================================

/**
 * Log out user and clear all authentication data
 *
 * Clears all session storage keys, stops the refresh timer,
 * and redirects to the login page.
 *
 * @returns {void}
 *
 * @example
 * // In logout button handler
 * document.getElementById('logoutBtn').addEventListener('click', logout);
 */
function logout() {
    // Clear all authentication-related session storage
    Object.values(STORAGE_KEYS).forEach(key => {
        sessionStorage.removeItem(key);
    });

    // Stop token refresh timer
    if (window.tokenRefreshInterval) {
        clearInterval(window.tokenRefreshInterval);
        window.tokenRefreshInterval = null;
    }

    console.log('[JWT] Logged out - redirecting to login');

    // Redirect to dashboard which shows login screen
    window.location.href = 'dashboard.html';
}

// =============================================================================
// AUTHENTICATED FETCH
// =============================================================================

/**
 * Make an authenticated API request with automatic token refresh
 *
 * Wrapper around fetch() that:
 * 1. Checks token expiry and refreshes if needed
 * 2. Adds authentication headers
 * 3. Handles 401 responses with one retry after refresh
 *
 * @param {string} url - The URL to fetch
 * @param {Object} [options={}] - Fetch options (method, body, etc.)
 * @returns {Promise<Response>} The fetch Response object
 * @throws {Error} If token refresh fails or authentication fails after retry
 *
 * @example
 * try {
 *     const response = await authenticatedFetch('/api/clients', {
 *         method: 'POST',
 *         body: JSON.stringify({ name: 'John Doe' })
 *     });
 *     const data = await response.json();
 * } catch (error) {
 *     console.error('Request failed:', error);
 * }
 */
async function authenticatedFetch(url, options = {}) {
    // Proactively refresh if token is expired or expiring soon
    if (isTokenExpired()) {
        console.log('[JWT] Token expired or expiring soon - refreshing...');
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            throw new Error('Failed to refresh token');
        }
    }

    // Add authentication headers to request
    options.headers = getAuthHeaders();

    try {
        const response = await fetch(url, options);

        // Handle 401 Unauthorized - attempt one token refresh and retry
        if (response.status === 401) {
            console.log('[JWT] Received 401 - attempting token refresh');
            const refreshed = await refreshAccessToken();

            if (refreshed) {
                // Retry request with new token
                options.headers = getAuthHeaders();
                return await fetch(url, options);
            } else {
                // Refresh failed - logout and throw
                logout();
                throw new Error('Authentication failed');
            }
        }

        return response;
    } catch (error) {
        console.error('[JWT] Authenticated fetch error:', error);
        throw error;
    }
}

// =============================================================================
// MODULE INITIALIZATION
// =============================================================================

console.log('[JWT] Authentication Helper v2.0.0 loaded');
