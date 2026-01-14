/**
 * API Client - Authenticated Request Wrapper
 *
 * Simplifies making authenticated API calls to n8n webhooks.
 * Uses jwt-auth.js functions for token management (no JWTManager dependency).
 *
 * Dependencies: jwt-auth.js (provides isTokenExpired, refreshAccessToken, logout)
 *
 * Usage:
 *   <script src="js/auth/jwt-auth.js"></script>
 *   <script src="js/core/api-client.js"></script>
 */

const APIClient = (function() {
    'use strict';

    // Base URL for all API endpoints
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
                console.log('[API] Token expired, refreshing...');
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
                console.log('[API]', options.method || 'GET', endpoint);
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
            // Handle authentication errors
            if (error.status === 401) {
                console.error('[API] Authentication failed, logging out');
                // Clear tokens and redirect (uses logout function from jwt-auth.js)
                if (typeof logout === 'function') {
                    logout();
                } else {
                    alert('Your session has expired. Please log in again.');
                    window.location.href = 'dashboard.html';
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
            // Check if token is expired and refresh if needed
            if (typeof isTokenExpired === 'function' && isTokenExpired()) {
                if (typeof refreshAccessToken === 'function') {
                    const refreshed = await refreshAccessToken();
                    if (!refreshed) {
                        throw new Error('Token refresh failed');
                    }
                }
            }

            const token = sessionStorage.getItem('rrts_access_token');
            if (!token) {
                throw new Error('No authentication token found');
            }

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
            if (error.status === 401) {
                if (typeof logout === 'function') {
                    logout();
                } else {
                    alert('Your session has expired. Please log in again.');
                    window.location.href = 'dashboard.html';
                }
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

// Convenience functions for common endpoints
const AppointmentsAPI = {
    getAll: () => APIClient.get('/get-all-appointments'),
    getActive: () => APIClient.get('/get-active-present-future-appointments'),
    getOperations: () => APIClient.get('/get-operations-appointments'),
    save: (data) => APIClient.post('/save-appointment-v7', data),
    update: (data) => APIClient.post('/update-appointment-complete', data),
    delete: (id) => APIClient.post('/delete-appointment-with-calendar', { id })
};

const ClientsAPI = {
    getAll: () => APIClient.get('/get-all-clients'),
    getActive: () => APIClient.get('/get-active-clients'),
    add: (data) => APIClient.post('/add-client', data),
    update: (data) => APIClient.post('/update-client', data)
};

const DriversAPI = {
    getAll: () => APIClient.get('/get-all-drivers'),
    add: (data) => APIClient.post('/add-driver-with-calendar', data),
    update: (data) => APIClient.post('/update-driver', data)
};

const UsersAPI = {
    getAll: () => APIClient.get('/get-all-users'),
    create: (data) => APIClient.post('/create-user', data),
    update: (data) => APIClient.post('/update-user', data),
    delete: (id) => APIClient.post('/delete-user', { id }),
    resetPassword: (username) => APIClient.post('/password-reset', { username })
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
