/**
 * Task Monitor - Background Task Status Monitoring
 *
 * Monitors background tasks for failures and notifies users via TaskNotifications.
 * Supports two modes:
 *   1. Supabase Realtime (preferred) - instant notifications
 *   2. Polling fallback - checks every 30 seconds
 *
 * Dependencies:
 *   - task-notifications.js (for displaying errors)
 *   - Optionally: Supabase JS client for Realtime
 *
 * Usage:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> (optional)
 *   <script src="js/core/task-monitor.js"></script>
 *   <script src="js/components/task-notifications.js"></script>
 *
 *   // Initialize after page load
 *   TaskMonitor.init({
 *       supabaseUrl: 'https://xxx.supabase.co',  // Optional: enables Realtime
 *       supabaseAnonKey: 'xxx',                   // Optional: enables Realtime
 *       pollingInterval: 30000,                   // Fallback polling interval (ms)
 *       onError: (task) => { ... }                // Callback for new failures
 *   });
 */

const TaskMonitor = (function() {
    'use strict';

    // Configuration
    let config = {
        supabaseUrl: null,
        supabaseAnonKey: null,
        pollingInterval: 30000,  // 30 seconds
        onError: null,
        webhookEndpoint: '/get-failed-tasks'  // n8n endpoint for polling
    };

    // State
    let supabaseClient = null;
    let realtimeChannel = null;
    let pollingTimer = null;
    let isInitialized = false;
    let knownFailedTaskIds = new Set();  // Track tasks we've already notified about
    let currentUserId = null;
    let userRole = null;

    /**
     * Initialize the task monitor
     * @param {object} options - Configuration options
     */
    function init(options = {}) {
        if (isInitialized) {
            console.warn('[TaskMonitor] Already initialized');
            return;
        }

        // Merge options
        config = { ...config, ...options };

        // Get current user info
        currentUserId = getCurrentUserId();
        userRole = getCurrentUserRole();

        if (!currentUserId) {
            console.warn('[TaskMonitor] No user ID found, skipping initialization');
            return;
        }

        // Try Supabase Realtime first, fall back to polling
        if (config.supabaseUrl && config.supabaseAnonKey && typeof supabase !== 'undefined') {
            initSupabaseRealtime();
        } else {
            console.log('[TaskMonitor] Supabase not configured, using polling mode');
            initPolling();
        }

        isInitialized = true;
        console.log('[TaskMonitor] Initialized for user:', currentUserId, 'role:', userRole);

        // Do initial fetch
        fetchFailedTasks();
    }

    /**
     * Initialize Supabase Realtime subscription
     */
    function initSupabaseRealtime() {
        try {
            supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

            // Build filter based on user role
            let filter = `status=eq.failed`;
            if (userRole !== 'admin' && userRole !== 'supervisor') {
                filter += `,created_by=eq.${currentUserId}`;
            }

            realtimeChannel = supabaseClient
                .channel('task-failures')
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'background_tasks',
                    filter: filter
                }, handleRealtimeChange)
                .subscribe((status) => {
                    console.log('[TaskMonitor] Realtime subscription status:', status);
                    if (status === 'CHANNEL_ERROR') {
                        console.warn('[TaskMonitor] Realtime failed, falling back to polling');
                        initPolling();
                    }
                });

            console.log('[TaskMonitor] Supabase Realtime initialized');
        } catch (error) {
            console.error('[TaskMonitor] Supabase Realtime error:', error);
            initPolling();
        }
    }

    /**
     * Handle Realtime change event
     * @param {object} payload - Change payload from Supabase
     */
    function handleRealtimeChange(payload) {
        const task = payload.new;

        // Only notify about new failures (not dismissals)
        if (task.status === 'failed' && !task.dismissed_at && !knownFailedTaskIds.has(task.id)) {
            knownFailedTaskIds.add(task.id);
            notifyTaskFailure(task);
        }

        // If task was dismissed, remove from known set
        if (task.dismissed_at) {
            knownFailedTaskIds.delete(task.id);
        }
    }

    /**
     * Initialize polling mode
     */
    function initPolling() {
        if (pollingTimer) {
            clearInterval(pollingTimer);
        }

        pollingTimer = setInterval(fetchFailedTasks, config.pollingInterval);
        console.log('[TaskMonitor] Polling initialized, interval:', config.pollingInterval, 'ms');
    }

    /**
     * Fetch failed tasks from API
     */
    async function fetchFailedTasks() {
        try {
            let tasks;

            if (supabaseClient) {
                // Use Supabase directly
                const query = supabaseClient
                    .from('background_tasks')
                    .select('*')
                    .eq('status', 'failed')
                    .is('dismissed_at', null)
                    .order('completed_at', { ascending: false });

                // Filter by user unless admin/supervisor
                if (userRole !== 'admin' && userRole !== 'supervisor') {
                    query.eq('created_by', currentUserId);
                }

                const { data, error } = await query;
                if (error) throw error;
                tasks = data;
            } else {
                // Use n8n webhook
                const endpoint = userRole === 'admin' || userRole === 'supervisor'
                    ? '/get-all-failed-tasks'
                    : '/get-failed-tasks';

                const response = await APIClient.get(endpoint);
                tasks = response.data || response.tasks || response || [];
            }

            // Process tasks
            processFailedTasks(tasks);

        } catch (error) {
            console.error('[TaskMonitor] Error fetching failed tasks:', error);
        }
    }

    /**
     * Process fetched failed tasks
     * @param {Array} tasks - Array of failed tasks
     */
    function processFailedTasks(tasks) {
        if (!Array.isArray(tasks)) {
            console.warn('[TaskMonitor] Invalid tasks data:', tasks);
            return;
        }

        const newFailures = [];

        tasks.forEach(task => {
            if (!knownFailedTaskIds.has(task.id)) {
                knownFailedTaskIds.add(task.id);
                newFailures.push(task);
            }
        });

        // Notify about new failures
        newFailures.forEach(task => notifyTaskFailure(task));

        // Update TaskNotifications with full list
        if (typeof TaskNotifications !== 'undefined') {
            TaskNotifications.updateFailedTasks(tasks);
        }
    }

    /**
     * Notify about a single task failure
     * @param {object} task - The failed task
     */
    function notifyTaskFailure(task) {
        console.log('[TaskMonitor] New task failure:', task);

        // Call custom callback if provided
        if (typeof config.onError === 'function') {
            config.onError(task);
        }

        // Show toast notification
        if (typeof TaskNotifications !== 'undefined') {
            TaskNotifications.showErrorToast(task);
        }
    }

    /**
     * Get current user ID from session
     * @returns {string|null} User ID
     */
    function getCurrentUserId() {
        try {
            const userStr = sessionStorage.getItem('rrts_user');
            if (userStr) {
                const user = JSON.parse(userStr);
                return user.id || user.user_id || null;
            }
        } catch (e) {
            console.warn('[TaskMonitor] Error getting user ID:', e);
        }
        return null;
    }

    /**
     * Get current user role from session
     * @returns {string|null} User role
     */
    function getCurrentUserRole() {
        try {
            const userStr = sessionStorage.getItem('rrts_user');
            if (userStr) {
                const user = JSON.parse(userStr);
                return user.role || user.user_role || null;
            }
        } catch (e) {
            console.warn('[TaskMonitor] Error getting user role:', e);
        }
        return null;
    }

    /**
     * Dismiss a failed task
     * @param {string} taskId - Task ID to dismiss
     * @returns {Promise<boolean>} Success status
     */
    async function dismissTask(taskId) {
        try {
            if (supabaseClient) {
                const { error } = await supabaseClient
                    .rpc('dismiss_background_task', { p_task_id: taskId });
                if (error) throw error;
            } else {
                await APIClient.post('/dismiss-task', { task_id: taskId });
            }

            knownFailedTaskIds.delete(taskId);
            console.log('[TaskMonitor] Task dismissed:', taskId);
            return true;

        } catch (error) {
            console.error('[TaskMonitor] Error dismissing task:', error);
            return false;
        }
    }

    /**
     * Dismiss all failed tasks for current user
     * @returns {Promise<boolean>} Success status
     */
    async function dismissAllTasks() {
        try {
            if (supabaseClient) {
                const { error } = await supabaseClient
                    .rpc('dismiss_all_failed_tasks');
                if (error) throw error;
            } else {
                await APIClient.post('/dismiss-all-tasks', {});
            }

            knownFailedTaskIds.clear();
            console.log('[TaskMonitor] All tasks dismissed');
            return true;

        } catch (error) {
            console.error('[TaskMonitor] Error dismissing all tasks:', error);
            return false;
        }
    }

    /**
     * Refresh failed tasks (manual refresh)
     */
    function refresh() {
        fetchFailedTasks();
    }

    /**
     * Stop monitoring
     */
    function stop() {
        if (realtimeChannel) {
            realtimeChannel.unsubscribe();
            realtimeChannel = null;
        }

        if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = null;
        }

        isInitialized = false;
        console.log('[TaskMonitor] Stopped');
    }

    /**
     * Check if admin/supervisor (can see all tasks)
     * @returns {boolean}
     */
    function isAdminOrSupervisor() {
        return userRole === 'admin' || userRole === 'supervisor';
    }

    // Public API
    return {
        init,
        refresh,
        stop,
        dismissTask,
        dismissAllTasks,
        isAdminOrSupervisor,
        get isInitialized() { return isInitialized; },
        get failedTaskCount() { return knownFailedTaskIds.size; }
    };

})();

// Auto-initialize when DOM is ready (if TaskNotifications is loaded)
document.addEventListener('DOMContentLoaded', function() {
    // Delay init to ensure other scripts are loaded
    setTimeout(function() {
        if (typeof TaskNotifications !== 'undefined' && !TaskMonitor.isInitialized) {
            TaskMonitor.init();
        }
    }, 500);
});
