/**
 * Failed Tasks Dashboard Widget
 *
 * Displays a dashboard card showing failed task count for supervisors/admins.
 * Follows the existing dashboard card pattern for consistent styling.
 *
 * Dependencies:
 *   - task-monitor.js
 *   - task-notifications.js
 *
 * Usage:
 *   <div id="failed-tasks-widget-container"></div>
 *
 *   <script src="js/core/task-monitor.js"></script>
 *   <script src="js/components/task-notifications.js"></script>
 *   <script src="js/components/failed-tasks-widget.js"></script>
 *
 *   // Widget auto-initializes if container exists
 *   // Or manually:
 *   FailedTasksWidget.init('failed-tasks-widget-container');
 */

const FailedTasksWidget = (function() {
    'use strict';

    let container = null;
    let isInitialized = false;
    let failedCount = 0;
    let oldestFailure = null;

    /**
     * Initialize the widget
     * @param {string} containerId - ID of container element (optional)
     */
    function init(containerId) {
        // Check if user has permission to see this widget
        if (!canViewWidget()) {
            console.log('[FailedTasksWidget] User does not have permission to view widget');
            return;
        }

        // Find or create container
        if (containerId) {
            container = document.getElementById(containerId);
        }

        if (!container) {
            // Try to find the dashboard grid
            container = document.querySelector('.dashboard-grid');
            if (container) {
                // Insert as first card in the grid
                const widget = createWidgetElement();
                container.insertBefore(widget, container.firstChild);
                container = widget;
            }
        }

        if (!container) {
            console.warn('[FailedTasksWidget] Could not find container for widget');
            return;
        }

        isInitialized = true;

        // Initial data fetch
        fetchFailedTasksSummary();

        // Set up polling for updates (every 60 seconds)
        setInterval(fetchFailedTasksSummary, 60000);

        console.log('[FailedTasksWidget] Initialized');
    }

    /**
     * Check if current user can view the widget
     * @returns {boolean}
     */
    function canViewWidget() {
        try {
            const userStr = sessionStorage.getItem('rrts_user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const role = user.role || user.user_role || '';
                return ['admin', 'supervisor', 'manager'].includes(role.toLowerCase());
            }
        } catch (e) {
            console.warn('[FailedTasksWidget] Error checking user role:', e);
        }
        return false;
    }

    /**
     * Create the widget DOM element
     * @returns {HTMLElement}
     */
    function createWidgetElement() {
        const widget = document.createElement('div');
        widget.id = 'failed-tasks-widget';
        widget.className = 'card failed-tasks-widget';
        widget.innerHTML = `
            <div class="card-header">
                <div class="card-icon">⚠️</div>
                <div class="card-title">Failed Tasks</div>
            </div>
            <div class="metric danger" id="failedTasksCount">--</div>
            <div class="metric-label" id="failedTasksLabel">Loading...</div>
            <button class="widget-action-btn" onclick="FailedTasksWidget.openPanel()">
                View Details
            </button>
        `;

        // Add widget-specific styles
        injectWidgetStyles();

        return widget;
    }

    /**
     * Fetch failed tasks summary from API
     */
    async function fetchFailedTasksSummary() {
        try {
            let data;

            // Try to get data from TaskMonitor if available
            if (typeof TaskMonitor !== 'undefined' && TaskMonitor.isInitialized) {
                // Use TaskNotifications data if available
                if (typeof TaskNotifications !== 'undefined') {
                    const tasks = TaskNotifications.failedTasks;
                    failedCount = tasks.length;
                    oldestFailure = tasks.length > 0 ? tasks[tasks.length - 1].completed_at : null;
                    updateWidget();
                    return;
                }
            }

            // Fall back to API call
            const response = await APIClient.get('/get-failed-tasks-summary');
            data = response.data || response;

            failedCount = data.total_failed || 0;
            oldestFailure = data.oldest_failure || null;

            updateWidget();

        } catch (error) {
            console.error('[FailedTasksWidget] Error fetching summary:', error);
            updateWidgetError();
        }
    }

    /**
     * Update the widget display
     */
    function updateWidget() {
        const countEl = document.getElementById('failedTasksCount');
        const labelEl = document.getElementById('failedTasksLabel');

        if (!countEl || !labelEl) return;

        countEl.textContent = failedCount;

        if (failedCount === 0) {
            countEl.className = 'metric success';
            labelEl.textContent = 'All tasks completed';
        } else {
            countEl.className = 'metric danger';
            if (oldestFailure) {
                const age = formatAge(oldestFailure);
                labelEl.textContent = `Oldest: ${age}`;
            } else {
                labelEl.textContent = 'Need attention';
            }
        }

        // Update widget visibility/urgency
        const widget = document.getElementById('failed-tasks-widget');
        if (widget) {
            widget.classList.toggle('has-failures', failedCount > 0);
            widget.classList.toggle('urgent', failedCount >= 5);
        }
    }

    /**
     * Update widget to show error state
     */
    function updateWidgetError() {
        const countEl = document.getElementById('failedTasksCount');
        const labelEl = document.getElementById('failedTasksLabel');

        if (countEl) countEl.textContent = '?';
        if (labelEl) labelEl.textContent = 'Error loading';
    }

    /**
     * Format the age of the oldest failure
     * @param {string} dateStr - ISO date string
     * @returns {string}
     */
    function formatAge(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const hours = Math.floor((now - date) / (1000 * 60 * 60));

        if (hours < 1) return 'Less than 1 hour';
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        const days = Math.floor(hours / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }

    /**
     * Open the failed tasks panel
     */
    function openPanel() {
        if (typeof TaskNotifications !== 'undefined') {
            TaskNotifications.openPanel();
        }
    }

    /**
     * Refresh the widget data
     */
    function refresh() {
        fetchFailedTasksSummary();
    }

    /**
     * Inject widget-specific CSS styles
     */
    function injectWidgetStyles() {
        if (document.getElementById('failed-tasks-widget-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'failed-tasks-widget-styles';
        styles.textContent = `
            /* Failed Tasks Widget */
            .failed-tasks-widget {
                position: relative;
                transition: all 0.3s ease;
            }

            .failed-tasks-widget.has-failures {
                border-color: #dc3545;
                box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.2);
            }

            .failed-tasks-widget.urgent {
                animation: urgentPulse 2s infinite;
            }

            @keyframes urgentPulse {
                0%, 100% {
                    box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.2);
                }
                50% {
                    box-shadow: 0 0 0 4px rgba(220, 53, 69, 0.3);
                }
            }

            .failed-tasks-widget .metric.danger {
                color: #dc3545;
            }

            .failed-tasks-widget .metric.success {
                color: #28a745;
            }

            .widget-action-btn {
                display: block;
                width: 100%;
                margin-top: 12px;
                padding: 8px 16px;
                background: transparent;
                border: 1px solid #dee2e6;
                border-radius: 6px;
                color: #495057;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .widget-action-btn:hover {
                background: #f8f9fa;
                border-color: #adb5bd;
            }

            .failed-tasks-widget.has-failures .widget-action-btn {
                border-color: #dc3545;
                color: #dc3545;
            }

            .failed-tasks-widget.has-failures .widget-action-btn:hover {
                background: #dc3545;
                color: #fff;
            }
        `;
        document.head.appendChild(styles);
    }

    // Public API
    return {
        init,
        refresh,
        openPanel,
        get failedCount() { return failedCount; },
        get isInitialized() { return isInitialized; }
    };

})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Delay to ensure other scripts are loaded
    setTimeout(function() {
        if (!FailedTasksWidget.isInitialized) {
            FailedTasksWidget.init();
        }
    }, 600);
});
