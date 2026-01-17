/**
 * TEST API Client - Authenticated Request Wrapper for Testing Branch
 *
 * This is the TEST version of api-client.js with proper TEST-dashboard.html redirects
 *
 * Differences from production:
 * - Redirects to TEST-dashboard.html instead of dashboard.html on 401
 * - Same BASE_URL (Railway production instance handles both production and TEST workflows)
 *
 * Dependencies: jwt-manager.js
 *
 * Usage:
 *   <script src="../js/auth/jwt-manager.js"></script>
 *   <script src="js/core/TEST-api-client.js"></script>
 */

const APIClient = (function() {
    'use strict';

    // Base URL for all API endpoints (same for production and TEST workflows)
    const BASE_URL = 'https://webhook-processor-production-3bb8.up.railway.app/webhook';

    /**
     * Make authenticated API request
     * @param {string} endpoint - API endpoint (without base URL)
     * @param {object} options - Fetch options
     * @returns {Promise<object>} Response data
     * @throws {Error} If request fails
     */
    async function request(endpoint, options = {}) {
        try {
            // Check if token is expired and refresh if needed
            if (typeof isTokenExpired === 'function' && isTokenExpired()) {
                console.log('[TEST API] Token expired, refreshing...');
                if (typeof refreshAccessToken === 'function') {
                    const refreshed = await refreshAccessToken();
                    if (!refreshed) {
                        throw new Error('Token refresh failed');
                    }
                }
            }

            // Get access token from session storage
            const token = sessionStorage.getItem('rrts_access_token');

            if (!token) {
                throw new Error('No authentication token found');
            }

            // Build full URL
            const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

            // Prepare headers
            const headers = {
                'Authorization': `Bearer ${token}`,
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                ...options.headers
            };

            // Prepare request options
            const fetchOptions = {
                ...options,
                headers
            };

            // Log request (development only)
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('[TEST API]', options.method || 'GET', endpoint);
            }

            // Make request
            const response = await fetch(url, fetchOptions);

            // Parse response
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            // Check for errors
            if (!response.ok) {
                throw new APIError(
                    data.message || `HTTP ${response.status}: ${response.statusText}`,
                    response.status,
                    data
                );
            }

            // Check for application-level errors
            if (data && data.success === false) {
                throw new APIError(
                    data.message || 'Request failed',
                    response.status,
                    data
                );
            }

            return data;

        } catch (error) {
            // Handle authentication errors - TEST version redirects to TEST-dashboard
            if (error.status === 401) {
                console.error('[TEST API] Authentication failed, logging out');
                // Clear tokens and redirect (uses logout function from TEST-jwt-auth.js)
                if (typeof logout === 'function') {
                    logout();
                } else {
                    alert('Your session has expired. Please log in again.');
                    window.location.href = 'TEST-dashboard.html';
                }
                return; // Don't re-throw after redirect
            }

            // Re-throw error for caller to handle
            throw error;
        }
    }

    /**
     * GET request
     * @param {string} endpoint - API endpoint
     * @param {object} queryParams - Query parameters (optional)
     * @returns {Promise<object>} Response data
     */
    async function get(endpoint, queryParams = null) {
        let url = endpoint;

        // Add query parameters if provided
        if (queryParams) {
            const params = new URLSearchParams(queryParams);
            url += (url.includes('?') ? '&' : '?') + params.toString();
        }

        return await request(url, {
            method: 'GET'
        });
    }

    /**
     * POST request
     * @param {string} endpoint - API endpoint
     * @param {object} data - Request body
     * @returns {Promise<object>} Response data
     */
    async function post(endpoint, data) {
        return await request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * PUT request
     * @param {string} endpoint - API endpoint
     * @param {object} data - Request body
     * @returns {Promise<object>} Response data
     */
    async function put(endpoint, data) {
        return await request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    /**
     * DELETE request
     * @param {string} endpoint - API endpoint
     * @param {object} data - Request body (optional)
     * @returns {Promise<object>} Response data
     */
    async function deleteRequest(endpoint, data = null) {
        const options = {
            method: 'DELETE'
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        return await request(endpoint, options);
    }

    /**
     * Upload file
     * @param {string} endpoint - API endpoint
     * @param {FormData} formData - Form data with file
     * @returns {Promise<object>} Response data
     */
    async function upload(endpoint, formData) {
        try {
            const token = await JWTManager.getAccessToken();
            const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

            // Don't set Content-Type for FormData (browser sets it with boundary)
            const headers = {
                'Authorization': `Bearer ${token}`,
                'X-Requested-With': 'XMLHttpRequest'
            };

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: formData
            });

            const data = await response.json();

            if (!response.ok || data.success === false) {
                throw new APIError(
                    data.message || 'Upload failed',
                    response.status,
                    data
                );
            }

            return data;

        } catch (error) {
            // TEST version redirects to TEST-dashboard
            if (error.status === 401) {
                JWTManager.clearTokens();
                alert('Your session has expired. Please log in again.');
                window.location.href = 'TEST-dashboard.html';  // ← TEST redirect
            }
            throw error;
        }
    }

    /**
     * Custom API Error class
     */
    class APIError extends Error {
        constructor(message, status, data) {
            super(message);
            this.name = 'APIError';
            this.status = status;
            this.data = data;
        }
    }

    /**
     * Batch requests (parallel execution)
     * @param {Array<Promise>} requests - Array of request promises
     * @returns {Promise<Array>} Array of results
     */
    async function batch(requests) {
        return await Promise.all(requests);
    }

    /**
     * Set base URL (for testing or different environments)
     * @param {string} url - New base URL
     */
    function setBaseURL(url) {
        BASE_URL = url;
    }

    // Public API
    return {
        request,
        get,
        post,
        put,
        delete: deleteRequest,
        upload,
        batch,
        setBaseURL,
        APIError
    };

})();

// Convenience functions for common TEST endpoints
const AppointmentsAPI = {
    getAll: () => APIClient.get('/TEST-get-historic-appointments'),
    getActive: () => APIClient.get('/TEST-get-active-present-future-appointments'),
    getOperations: () => APIClient.get('/TEST-get-operations-appointments'),
    save: (data) => APIClient.post('/TEST-save-appointment', data),
    update: (data) => APIClient.post('/TEST-update-appointment', data),
    delete: (id) => APIClient.post('/TEST-delete-appointment-with-calendar', { id })
};

const ClientsAPI = {
    getAll: () => APIClient.get('/TEST-get-all-clients'),
    getActive: () => APIClient.get('/TEST-getActiveClients'),
    add: (data) => APIClient.post('/TEST-add-client', data),
    update: (data) => APIClient.post('/TEST-update-client', data)
};

const DriversAPI = {
    getAll: () => APIClient.get('/TEST-get-all-drivers'),
    add: (data) => APIClient.post('/TEST-add-driver-with-calendar', data),
    update: (data) => APIClient.post('/TEST-update-driver', data)
};

const UsersAPI = {
    getAll: () => APIClient.get('/TEST-get-all-users'),
    create: (data) => APIClient.post('/TEST-create-user', data),
    update: (data) => APIClient.post('/TEST-update-user', data),
    delete: (id) => APIClient.post('/TEST-delete-user', { id }),
    resetPassword: (username) => APIClient.post('/TEST-password-reset', { username })
};

// Export for CommonJS if available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        APIClient,
        AppointmentsAPI,
        ClientsAPI,
        DriversAPI,
        UsersAPI
    };
}
