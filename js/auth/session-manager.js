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
        'keydown',
        'scroll',
        'touchstart',
        'click'
    ];

    // Storage key for last activity timestamp (shared with jwt-auth.js)
    const LAST_ACTIVITY_KEY = 'rrts_last_activity';

    // Internal state
    let inactivityTimer = null;
    let warningTimer = null;
    let warningCountdownTimer = null;
    let warningModalInstance = null;
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

        // Set initial last activity timestamp (user just loaded the page)
        lastActivityTime = Date.now();
        sessionStorage.setItem(LAST_ACTIVITY_KEY, lastActivityTime.toString());

        // Set up activity listeners (throttled)
        ACTIVITY_EVENTS.forEach(event => {
            document.addEventListener(event, handleActivity, true);
        });

        // Start timer
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

        // Clean up warning modal and countdown
        dismissWarningModal();

        // Remove activity listeners
        ACTIVITY_EVENTS.forEach(event => {
            document.removeEventListener(event, handleActivity, true);
        });
    }

    /**
     * Handle activity event (throttled wrapper for resetTimer)
     * Updates sessionStorage timestamp for cross-page inactivity tracking
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
        // Update sessionStorage so jwt-auth.js can check inactivity on page reload
        sessionStorage.setItem(LAST_ACTIVITY_KEY, lastActivityTime.toString());
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
    }

    /**
     * Show non-blocking warning modal before timeout.
     * The inactivity timer continues running — if the user doesn't
     * interact within the remaining time, handleTimeout() fires and
     * dismisses this modal automatically.
     */
    function showWarning() {
        console.warn(`[Session] Inactivity warning: ${WARNING_BEFORE_TIMEOUT / 60000} minutes until logout`);

        // Build or reuse the warning modal element
        let modalEl = document.getElementById('sessionWarningModal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'sessionWarningModal';
            modalEl.className = 'modal fade';
            modalEl.tabIndex = -1;
            modalEl.setAttribute('aria-labelledby', 'sessionWarningModalLabel');
            modalEl.setAttribute('data-bs-backdrop', 'static');
            modalEl.setAttribute('data-bs-keyboard', 'false');
            modalEl.innerHTML = `
                <div class="modal-dialog modal-dialog-centered modal-sm">
                    <div class="modal-content">
                        <div class="modal-header" style="background: #f39c12; color: white; padding: 12px 16px;">
                            <h6 class="modal-title" id="sessionWarningModalLabel" style="margin:0; font-weight:600;">
                                <i class="bi bi-exclamation-triangle-fill me-1"></i> Session Expiring
                            </h6>
                        </div>
                        <div class="modal-body text-center" style="padding: 20px 16px;">
                            <p style="margin: 0 0 8px 0; font-size: 0.95em; color: #333;">
                                Your session will expire due to inactivity in
                            </p>
                            <div id="sessionWarningCountdown" style="font-size: 1.8em; font-weight: 700; color: #e74c3c; margin-bottom: 12px;">
                                5:00
                            </div>
                            <p style="margin: 0; font-size: 0.85em; color: #666;">
                                Click below to stay logged in.
                            </p>
                        </div>
                        <div class="modal-footer" style="padding: 10px 16px; justify-content: center; gap: 10px;">
                            <button type="button" class="btn btn-outline-secondary btn-sm" id="sessionWarningLogoutBtn">
                                Logout
                            </button>
                            <button type="button" class="btn btn-success btn-sm" id="sessionWarningStayBtn">
                                <i class="bi bi-check-lg me-1"></i>Stay Logged In
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modalEl);

            // Bind button handlers
            document.getElementById('sessionWarningStayBtn').addEventListener('click', function() {
                dismissWarningModal();
                // Record activity and reset timer
                lastActivityTime = Date.now();
                sessionStorage.setItem(LAST_ACTIVITY_KEY, lastActivityTime.toString());
                resetTimer();
            });

            document.getElementById('sessionWarningLogoutBtn').addEventListener('click', function() {
                dismissWarningModal();
                handleTimeout();
            });
        }

        // Start countdown display
        let secondsLeft = Math.round(WARNING_BEFORE_TIMEOUT / 1000);
        const countdownEl = document.getElementById('sessionWarningCountdown');

        function updateCountdown() {
            if (secondsLeft <= 0) {
                // Time's up — handleTimeout() will be fired by the inactivityTimer
                return;
            }
            const mins = Math.floor(secondsLeft / 60);
            const secs = secondsLeft % 60;
            countdownEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
            secondsLeft--;
        }

        updateCountdown();
        if (warningCountdownTimer) clearInterval(warningCountdownTimer);
        warningCountdownTimer = setInterval(updateCountdown, 1000);

        // Show the modal
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            warningModalInstance = new bootstrap.Modal(modalEl);
            warningModalInstance.show();
        } else {
            // Fallback if Bootstrap JS not loaded: use basic confirm
            const shouldContinue = confirm(
                'Your session will expire in 5 minutes due to inactivity.\n\n' +
                'Click OK to continue your session, or Cancel to logout now.'
            );
            if (shouldContinue) {
                lastActivityTime = Date.now();
                sessionStorage.setItem(LAST_ACTIVITY_KEY, lastActivityTime.toString());
                resetTimer();
            } else {
                handleTimeout();
            }
        }
    }

    /**
     * Dismiss the warning modal and clear countdown timer
     */
    function dismissWarningModal() {
        if (warningCountdownTimer) {
            clearInterval(warningCountdownTimer);
            warningCountdownTimer = null;
        }
        if (warningModalInstance) {
            try { warningModalInstance.hide(); } catch(e) { /* modal may already be hidden */ }
            warningModalInstance = null;
        }
    }

    /**
     * Handle session timeout
     */
    function handleTimeout() {
        console.log('[Session] Session expired due to inactivity');

        // Dismiss warning modal if it's showing
        dismissWarningModal();

        stop();

        // Clear activity timestamp
        sessionStorage.removeItem(LAST_ACTIVITY_KEY);

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
        sessionStorage.removeItem(LAST_ACTIVITY_KEY);
        JWTManager.clearTokens();
        window.location.href = 'dashboard.html';
    }

    /**
     * Check if user has been inactive for longer than their role's timeout
     * Can be called externally (e.g., by jwt-auth.js)
     * @param {string} userRole - The user's role
     * @returns {boolean} True if inactive too long
     */
    function isInactiveForTooLong(userRole) {
        const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY);
        if (!lastActivity) {
            return false; // No activity recorded, likely first login
        }

        const lastActivityTime = parseInt(lastActivity);
        const now = Date.now();
        const inactiveTime = now - lastActivityTime;
        const timeout = SESSION_TIMEOUTS[userRole] || DEFAULT_TIMEOUT;

        return inactiveTime > timeout;
    }

    /**
     * Clear the last activity timestamp
     */
    function clearLastActivity() {
        sessionStorage.removeItem(LAST_ACTIVITY_KEY);
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
        logout,
        isInactiveForTooLong,
        clearLastActivity
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
