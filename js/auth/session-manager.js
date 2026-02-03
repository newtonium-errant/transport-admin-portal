/**
 * Session Manager - Role-Based Timeout and Activity Tracking
 *
 * Handles automatic logout after period of inactivity
 * Timeout duration varies by user role for security
 *
 * Dependencies: jwt-auth.js (for JWTManager object and token management)
 *
 * Usage:
 *   <script src="js/auth/jwt-auth.js"></script>
 *   <script src="js/auth/session-manager.js"></script>
 *   <script>
 *     // Start session monitoring after login
 *     SessionManager.start();
 *
 *     // Stop monitoring on logout
 *     SessionManager.stop();
 *   </script>
 */

const SessionManager = (function() {
    'use strict';

    // Role-based session timeout durations (in milliseconds)
    const SESSION_TIMEOUTS = {
        admin: 30 * 60 * 1000,           // 30 minutes
        supervisor: 60 * 60 * 1000,       // 60 minutes (1 hour)
        booking_agent: 120 * 60 * 1000,   // 120 minutes (2 hours)
        driver: 120 * 60 * 1000,          // 120 minutes (2 hours)
        client: 120 * 60 * 1000           // 120 minutes (2 hours)
    };

    // Default timeout if role not found
    const DEFAULT_TIMEOUT = 30 * 60 * 1000; // 30 minutes

    // Warning before timeout (5 minutes)
    const WARNING_BEFORE_TIMEOUT = 5 * 60 * 1000;

    // Activity events to monitor
    const ACTIVITY_EVENTS = [
        'mousedown',
        'mousemove',
        'keypress',
        'scroll',
        'touchstart',
        'click'
    ];

    // Internal state
    let inactivityTimer = null;
    let warningTimer = null;
    let isRunning = false;
    let currentTimeout = DEFAULT_TIMEOUT;
    let lastActivityTime = 0;
    const THROTTLE_INTERVAL = 1000; // Only process activity events once per second

    /**
     * Start session monitoring
     */
    function start() {
        if (isRunning) {
            console.log('[Session] Already running');
            return;
        }

        // Get user role to determine timeout
        const user = JWTManager.getCurrentUser();
        if (!user) {
            console.warn('[Session] No user found, cannot start session manager');
            return;
        }

        currentTimeout = SESSION_TIMEOUTS[user.role] || DEFAULT_TIMEOUT;

        console.log(`[Session] Starting for role: ${user.role}`);
        console.log(`[Session] Timeout: ${currentTimeout / 60000} minutes`);

        isRunning = true;

        // Set up activity listeners
        ACTIVITY_EVENTS.forEach(event => {
            document.addEventListener(event, handleActivity, true);
        });

        // Start timer (initial start, not from activity)
        lastActivityTime = Date.now();
        resetTimer();
    }

    /**
     * Stop session monitoring
     */
    function stop() {
        if (!isRunning) {
            return;
        }

        console.log('[Session] Stopping');

        isRunning = false;

        // Clear timers
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }

        if (warningTimer) {
            clearTimeout(warningTimer);
            warningTimer = null;
        }

        // Remove activity listeners
        ACTIVITY_EVENTS.forEach(event => {
            document.removeEventListener(event, handleActivity, true);
        });
    }

    /**
     * Handle activity event (throttled wrapper for resetTimer)
     */
    function handleActivity() {
        if (!isRunning) {
            return;
        }

        const now = Date.now();

        // Throttle: only reset timer if enough time has passed since last activity
        if (now - lastActivityTime < THROTTLE_INTERVAL) {
            return;
        }

        lastActivityTime = now;
        resetTimer();
    }

    /**
     * Reset inactivity timer on user activity
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

        // Set warning timer (5 minutes before timeout)
        const warningTime = currentTimeout - WARNING_BEFORE_TIMEOUT;
        if (warningTime > 0) {
            warningTimer = setTimeout(showWarning, warningTime);
        }

        // Set inactivity timer
        inactivityTimer = setTimeout(handleTimeout, currentTimeout);

        // Update last activity time
        lastActivityTime = Date.now();
    }

    /**
     * Show warning before timeout
     */
    function showWarning() {
        const minutesRemaining = WARNING_BEFORE_TIMEOUT / 60000;

        console.warn(`[Session] Inactivity warning: ${minutesRemaining} minutes until logout`);

        // Show modal or notification
        const shouldContinue = confirm(
            `Your session will expire in ${minutesRemaining} minutes due to inactivity.\n\n` +
            'Click OK to continue your session, or Cancel to logout now.'
        );

        if (shouldContinue) {
            // User wants to continue, reset timer
            resetTimer();
        } else {
            // User chose to logout
            handleTimeout();
        }
    }

    /**
     * Handle session timeout
     */
    function handleTimeout() {
        console.log('[Session] Session expired due to inactivity');

        stop();

        // Clear tokens
        JWTManager.clearTokens();

        // Show message
        alert('Your session has expired due to inactivity. Please log in again.');

        // Redirect to login
        window.location.href = 'dashboard.html';
    }

    /**
     * Get current timeout duration for user's role
     * @returns {number} Timeout in milliseconds
     */
    function getCurrentTimeout() {
        return currentTimeout;
    }

    /**
     * Get time remaining until timeout
     * @returns {number} Milliseconds remaining, or 0 if not running
     */
    function getTimeRemaining() {
        if (!isRunning || !inactivityTimer) {
            return 0;
        }

        // Note: This is an approximation since we can't get exact timer state
        // For exact tracking, would need to store start time
        return currentTimeout;
    }

    /**
     * Check if session is active
     * @returns {boolean} True if monitoring is active
     */
    function isActive() {
        return isRunning;
    }

    /**
     * Manually trigger logout
     */
    function logout() {
        stop();
        JWTManager.clearTokens();
        window.location.href = 'dashboard.html';
    }

    /**
     * Update activity timestamp (for server-side tracking)
     * Call this periodically or on activity to update last_activity in database
     */
    async function updateActivity() {
        try {
            const token = await JWTManager.getAccessToken();

            // Call endpoint to update last_activity timestamp
            await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/update-activity', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

        } catch (error) {
            console.error('[Session] Failed to update activity:', error);
            // Non-critical error, don't interrupt user
        }
    }

    // Public API
    return {
        start,
        stop,
        getCurrentTimeout,
        getTimeRemaining,
        isActive,
        logout
    };

})();

// Auto-start session manager if JWTManager is available and user is logged in
if (typeof JWTManager !== 'undefined' && JWTManager.isAuthenticated()) {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            SessionManager.start();
        });
    } else {
        SessionManager.start();
    }
}

// Export for CommonJS if available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionManager;
}
