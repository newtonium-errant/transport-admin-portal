/**
 * @fileoverview Session Manager - Role-Based Inactivity Timeout
 *
 * @description
 * Monitors user activity and automatically logs out after a period of inactivity.
 * Timeout duration varies by user role for security - admin accounts have shorter
 * timeouts than standard users due to their elevated privileges.
 *
 * Activity Detection:
 * - Monitors mouse, keyboard, scroll, click, and touch events
 * - Resets inactivity timer on any user interaction
 * - Shows warning dialog 5 minutes before timeout
 *
 * @requires jwt-auth.js - Provides getCurrentUser() for role detection
 *
 * @example
 * // Start monitoring after successful login
 * SessionManager.start();
 *
 * @example
 * // Stop monitoring on manual logout
 * SessionManager.stop();
 *
 * @version 2.0.0
 * @since 2024-01-01
 */

const SessionManager = (function() {
    'use strict';

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    /**
     * Session timeout durations by user role (in milliseconds)
     *
     * Shorter timeouts for privileged roles to minimize exposure window
     * if a user leaves their workstation unattended.
     *
     * @constant {Object.<string, number>}
     */
    const SESSION_TIMEOUTS = {
        /** Admin: 30 minutes - highest privilege, shortest timeout */
        admin: 30 * 60 * 1000,
        /** Supervisor: 60 minutes - elevated access */
        supervisor: 60 * 60 * 1000,
        /** Booking Agent: 120 minutes - standard operations */
        booking_agent: 120 * 60 * 1000,
        /** Driver: 120 minutes - field operations, may have interruptions */
        driver: 120 * 60 * 1000,
        /** Client: 120 minutes - external users */
        client: 120 * 60 * 1000
    };

    /**
     * Default timeout when role is not recognized
     * Uses conservative (shorter) timeout for security
     * @constant {number}
     */
    const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    /**
     * Time before timeout to show warning dialog
     * Gives user opportunity to extend their session
     * @constant {number}
     */
    const WARNING_BEFORE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * DOM events that indicate user activity
     * Using capture phase (true) to detect activity before it's handled
     * @constant {string[]}
     */
    const ACTIVITY_EVENTS = [
        'mousedown',  // Mouse clicks
        'mousemove',  // Mouse movement
        'keypress',   // Keyboard input
        'scroll',     // Page scrolling
        'touchstart', // Touch device interaction
        'click'       // General clicks
    ];

    // =========================================================================
    // INTERNAL STATE
    // =========================================================================

    /** @type {number|null} Timer ID for inactivity logout */
    let inactivityTimer = null;

    /** @type {number|null} Timer ID for warning dialog */
    let warningTimer = null;

    /** @type {boolean} Whether session monitoring is active */
    let isRunning = false;

    /** @type {number} Current timeout duration based on user's role */
    let currentTimeout = DEFAULT_TIMEOUT_MS;

    // =========================================================================
    // PUBLIC METHODS
    // =========================================================================

    /**
     * Start session monitoring for the current user
     *
     * Determines timeout based on user's role and begins monitoring
     * for inactivity. Safe to call multiple times - will not create
     * duplicate timers.
     *
     * @returns {void}
     *
     * @example
     * // After successful login
     * SessionManager.start();
     */
    function start() {
        if (isRunning) {
            console.log('[Session] Already running');
            return;
        }

        // Get user role to determine appropriate timeout
        const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        if (!user) {
            console.warn('[Session] No user found, cannot start session manager');
            return;
        }

        // Set timeout based on role, falling back to default for unknown roles
        currentTimeout = SESSION_TIMEOUTS[user.role] || DEFAULT_TIMEOUT_MS;

        console.log(`[Session] Starting for role: ${user.role}`);
        console.log(`[Session] Timeout: ${currentTimeout / 60000} minutes`);

        isRunning = true;

        // Register activity listeners on document (capture phase for early detection)
        ACTIVITY_EVENTS.forEach(event => {
            document.addEventListener(event, resetTimer, true);
        });

        // Start the initial timer
        resetTimer();
    }

    /**
     * Stop session monitoring and clear all timers
     *
     * Call this when user logs out manually to prevent
     * unnecessary timer callbacks.
     *
     * @returns {void}
     *
     * @example
     * // Before redirecting to login
     * SessionManager.stop();
     */
    function stop() {
        if (!isRunning) {
            return;
        }

        console.log('[Session] Stopping');

        isRunning = false;

        // Clear both timers
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }

        if (warningTimer) {
            clearTimeout(warningTimer);
            warningTimer = null;
        }

        // Remove all activity listeners
        ACTIVITY_EVENTS.forEach(event => {
            document.removeEventListener(event, resetTimer, true);
        });
    }

    /**
     * Get timeout duration for current user's role
     *
     * @returns {number} Timeout in milliseconds
     *
     * @example
     * const timeoutMinutes = SessionManager.getCurrentTimeout() / 60000;
     * console.log(`Session expires after ${timeoutMinutes} minutes of inactivity`);
     */
    function getCurrentTimeout() {
        return currentTimeout;
    }

    /**
     * Get approximate time remaining until timeout
     *
     * Note: This is an approximation since JavaScript doesn't expose
     * exact timer state. For precise tracking, would need to store
     * the last activity timestamp.
     *
     * @returns {number} Milliseconds remaining, or 0 if not running
     */
    function getTimeRemaining() {
        if (!isRunning || !inactivityTimer) {
            return 0;
        }

        // Approximation - returns full timeout since we don't track exact start time
        // TODO: Store lastActivityTime for accurate remaining time calculation
        return currentTimeout;
    }

    /**
     * Check if session monitoring is active
     *
     * @returns {boolean} True if monitoring is active
     */
    function isActive() {
        return isRunning;
    }

    /**
     * Manually trigger logout (for logout button)
     *
     * Stops monitoring and redirects to login page.
     *
     * @returns {void}
     */
    function manualLogout() {
        stop();
        if (typeof logout === 'function') {
            logout();
        } else {
            window.location.href = 'dashboard.html';
        }
    }

    // =========================================================================
    // INTERNAL METHODS
    // =========================================================================

    /**
     * Reset inactivity timer on user activity
     *
     * Called by activity event listeners. Clears existing timers
     * and starts fresh countdown.
     *
     * @private
     * @listens document#mousedown
     * @listens document#mousemove
     * @listens document#keypress
     * @listens document#scroll
     * @listens document#touchstart
     * @listens document#click
     */
    function resetTimer() {
        if (!isRunning) {
            return;
        }

        // Clear existing timers
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
        }

        if (warningTimer) {
            clearTimeout(warningTimer);
        }

        // Set warning timer (fires 5 minutes before logout)
        const warningTime = currentTimeout - WARNING_BEFORE_TIMEOUT_MS;
        if (warningTime > 0) {
            warningTimer = setTimeout(showWarning, warningTime);
        }

        // Set inactivity timer (fires at timeout to logout)
        inactivityTimer = setTimeout(handleTimeout, currentTimeout);
    }

    /**
     * Show warning dialog before timeout
     *
     * Displays a confirmation dialog giving user chance to extend
     * their session. If user clicks OK, timer resets. If Cancel
     * or dialog is ignored, logout proceeds.
     *
     * @private
     */
    function showWarning() {
        const minutesRemaining = WARNING_BEFORE_TIMEOUT_MS / 60000;

        console.warn(`[Session] Inactivity warning: ${minutesRemaining} minutes until logout`);

        // Browser confirm dialog - blocks until user responds
        // Note: Consider replacing with custom modal for better UX
        const shouldContinue = confirm(
            `Your session will expire in ${minutesRemaining} minutes due to inactivity.\n\n` +
            'Click OK to continue your session, or Cancel to logout now.'
        );

        if (shouldContinue) {
            // User wants to continue - reset the timer
            resetTimer();
        } else {
            // User chose to logout
            handleTimeout();
        }
    }

    /**
     * Handle session timeout - logout user
     *
     * Stops monitoring, clears authentication, shows message,
     * and redirects to login page.
     *
     * @private
     */
    function handleTimeout() {
        console.log('[Session] Session expired due to inactivity');

        stop();

        // Clear authentication tokens using jwt-auth.js logout
        if (typeof logout === 'function') {
            // Show message before logout redirects
            alert('Your session has expired due to inactivity. Please log in again.');
            logout();
        } else {
            // Fallback if logout function not available
            alert('Your session has expired due to inactivity. Please log in again.');
            window.location.href = 'dashboard.html';
        }
    }

    /**
     * Update activity timestamp on server (optional)
     *
     * For server-side session tracking, call this periodically
     * to update last_activity timestamp in database.
     *
     * @async
     * @private
     * @returns {Promise<void>}
     */
    async function updateServerActivity() {
        try {
            const headers = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {
                'Content-Type': 'application/json'
            };

            await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/update-activity', {
                method: 'POST',
                headers: {
                    ...headers,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

        } catch (error) {
            // Non-critical error - don't interrupt user
            console.error('[Session] Failed to update server activity:', error);
        }
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    return {
        start,
        stop,
        getCurrentTimeout,
        getTimeRemaining,
        isActive,
        logout: manualLogout
    };

})();

// =============================================================================
// AUTO-INITIALIZATION
// =============================================================================

/**
 * Auto-start session manager if user is already logged in
 *
 * Checks for existing authentication and starts monitoring.
 * Waits for DOM to be ready to ensure all dependencies are loaded.
 */
(function autoInit() {
    // Check if user is authenticated (jwt-auth.js function)
    const isAuthenticated = function() {
        return !!sessionStorage.getItem('rrts_access_token') &&
               !!sessionStorage.getItem('rrts_user');
    };

    if (isAuthenticated()) {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                SessionManager.start();
            });
        } else {
            SessionManager.start();
        }
    }
})();

// =============================================================================
// MODULE EXPORT
// =============================================================================

// Export for CommonJS environments (Node.js, bundlers)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionManager;
}
