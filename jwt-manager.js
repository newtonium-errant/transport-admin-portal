/**
 * JWT Manager - Token Storage and Refresh
 *
 * Handles JWT access tokens and refresh tokens for RRTS Admin Portal
 * Provides automatic token refresh before expiration
 *
 * Dependencies: None (vanilla JavaScript)
 *
 * Usage:
 *   <script src="jwt-manager.js"></script>
 *   <script>
 *     // After login
 *     JWTManager.storeTokens(accessToken, refreshToken, expiresIn, user);
 *
 *     // Before API calls
 *     const token = await JWTManager.getAccessToken();
 *   </script>
 */

const JWTManager = (function() {
    'use strict';

    // API endpoint for token refresh
    const REFRESH_TOKEN_ENDPOINT = 'https://webhook-processor-production-3bb8.up.railway.app/webhook/refresh-token';

    // Refresh token 5 minutes before expiration
    const REFRESH_BUFFER_MS = 5 * 60 * 1000;

    // Storage keys
    const STORAGE_KEYS = {
        ACCESS_TOKEN: 'rrts_access_token',
        REFRESH_TOKEN: 'rrts_refresh_token',
        TOKEN_EXPIRES: 'rrts_token_expires',
        USER: 'rrts_user'
    };

    /**
     * Store tokens after successful login
     * @param {string} accessToken - JWT access token
     * @param {string} refreshToken - Refresh token
     * @param {number} expiresIn - Token lifetime in seconds
     * @param {object} user - User information
     */
    function storeTokens(accessToken, refreshToken, expiresIn, user) {
        try {
            const expiresAt = Date.now() + (expiresIn * 1000);

            sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
            sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
            sessionStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES, expiresAt.toString());
            sessionStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));

            console.log('[JWT] Tokens stored successfully');
            console.log('[JWT] Access token expires:', new Date(expiresAt).toLocaleString());

        } catch (error) {
            console.error('[JWT] Failed to store tokens:', error);
            throw new Error('Token storage failed');
        }
    }

    /**
     * Get current access token, refreshing if necessary
     * @returns {Promise<string>} Access token
     * @throws {Error} If token refresh fails or user not authenticated
     */
    async function getAccessToken() {
        try {
            const token = sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
            const expiresAt = parseInt(sessionStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES));

            if (!token || !expiresAt) {
                throw new Error('No authentication token found');
            }

            // Check if token needs refresh
            const timeUntilExpiry = expiresAt - Date.now();
            if (timeUntilExpiry < REFRESH_BUFFER_MS) {
                console.log('[JWT] Token expiring soon, refreshing...');
                await refreshAccessToken();
                return sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
            }

            return token;

        } catch (error) {
            console.error('[JWT] Failed to get access token:', error);
            // Force re-login
            clearTokens();
            window.location.href = 'dashboard.html';
            throw error;
        }
    }

    /**
     * Refresh access token using refresh token
     * @returns {Promise<void>}
     * @throws {Error} If refresh fails
     */
    async function refreshAccessToken() {
        try {
            const refreshToken = sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

            if (!refreshToken) {
                throw new Error('No refresh token found');
            }

            console.log('[JWT] Requesting new access token...');

            const response = await fetch(REFRESH_TOKEN_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({ refreshToken })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || 'Token refresh failed');
            }

            // Update access token and expiration
            const newExpiresAt = Date.now() + (data.expiresIn * 1000);
            sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken);
            sessionStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES, newExpiresAt.toString());

            console.log('[JWT] Access token refreshed successfully');
            console.log('[JWT] New expiration:', new Date(newExpiresAt).toLocaleString());

        } catch (error) {
            console.error('[JWT] Token refresh failed:', error);
            // Refresh token is invalid, force re-login
            clearTokens();
            alert('Your session has expired. Please log in again.');
            window.location.href = 'dashboard.html';
            throw error;
        }
    }

    /**
     * Get current user information
     * @returns {object|null} User object or null if not logged in
     */
    function getCurrentUser() {
        try {
            const userJson = sessionStorage.getItem(STORAGE_KEYS.USER);
            return userJson ? JSON.parse(userJson) : null;
        } catch (error) {
            console.error('[JWT] Failed to get current user:', error);
            return null;
        }
    }

    /**
     * Check if user is authenticated
     * @returns {boolean} True if valid tokens exist
     */
    function isAuthenticated() {
        const accessToken = sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
        const refreshToken = sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
        const expiresAt = sessionStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES);

        return !!(accessToken && refreshToken && expiresAt);
    }

    /**
     * Clear all tokens (logout)
     */
    function clearTokens() {
        sessionStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
        sessionStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
        sessionStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRES);
        sessionStorage.removeItem(STORAGE_KEYS.USER);

        console.log('[JWT] Tokens cleared');
    }

    /**
     * Get Authorization header value
     * @returns {Promise<string>} Bearer token header
     */
    async function getAuthorizationHeader() {
        const token = await getAccessToken();
        return `Bearer ${token}`;
    }

    /**
     * Decode JWT payload (client-side only, for debugging)
     * WARNING: This doesn't verify signature, only decodes
     * @param {string} token - JWT token
     * @returns {object} Decoded payload
     */
    function decodeToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid token format');
            }

            const payload = parts[1];
            const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
            return decoded;

        } catch (error) {
            console.error('[JWT] Failed to decode token:', error);
            return null;
        }
    }

    /**
     * Get token expiration time
     * @returns {Date|null} Expiration date or null
     */
    function getTokenExpiration() {
        const expiresAt = sessionStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES);
        return expiresAt ? new Date(parseInt(expiresAt)) : null;
    }

    /**
     * Get time remaining until token expires
     * @returns {number} Milliseconds until expiration, or 0 if expired
     */
    function getTimeUntilExpiration() {
        const expiresAt = parseInt(sessionStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES));
        if (!expiresAt) return 0;

        const remaining = expiresAt - Date.now();
        return remaining > 0 ? remaining : 0;
    }

    // Public API
    return {
        storeTokens,
        getAccessToken,
        refreshAccessToken,
        getCurrentUser,
        isAuthenticated,
        clearTokens,
        getAuthorizationHeader,
        decodeToken,
        getTokenExpiration,
        getTimeUntilExpiration
    };

})();

// Export for CommonJS if available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = JWTManager;
}
