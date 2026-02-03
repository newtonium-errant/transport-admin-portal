/**
 * Task Notifications - Error Notification UI Components
 *
 * Provides:
 *   1. Toast notifications for new task failures
 *   2. Header indicator badge showing failed task count
 *   3. Slide-out panel for reviewing/dismissing failed tasks
 *
 * Dependencies:
 *   - task-monitor.js (for data and actions)
 *   - Bootstrap 5 (for styling, optional)
 *
 * Usage:
 *   <script src="js/core/task-monitor.js"></script>
 *   <script src="js/components/task-notifications.js"></script>
 *
 *   // The component auto-initializes on DOMContentLoaded
 *   // Or manually initialize:
 *   TaskNotifications.init();
 */

const TaskNotifications = (function() {
    'use strict';

    // Configuration
    const config = {
        toastDuration: 8000,        // How long toasts stay visible (ms)
        maxToasts: 3,               // Maximum simultaneous toasts
        panelWidth: '400px'         // Width of the slide-out panel
    };

    // State
    let failedTasks = [];
    let isInitialized = false;
    let isPanelOpen = false;

    // DOM Elements (created on init)
    let toastContainer = null;
    let headerIndicator = null;
    let panel = null;
    let panelOverlay = null;

    /**
     * Initialize the notification system
     */
    function init() {
        if (isInitialized) return;

        createToastContainer();
        createHeaderIndicator();
        createPanel();
        injectStyles();

        isInitialized = true;
        console.log('[TaskNotifications] Initialized');
    }

    /**
     * Create toast container
     */
    function createToastContainer() {
        toastContainer = document.createElement('div');
        toastContainer.id = 'task-toast-container';
        toastContainer.className = 'task-toast-container';
        document.body.appendChild(toastContainer);
    }

    /**
     * Create header indicator badge
     */
    function createHeaderIndicator() {
        // Find the header/navbar - try common patterns
        const navbar = document.querySelector('.navbar-nav, .nav, header nav, .header-right, .navbar-collapse');

        if (!navbar) {
            console.warn('[TaskNotifications] Could not find navbar for indicator');
            // Create a floating indicator instead
            headerIndicator = document.createElement('div');
            headerIndicator.id = 'task-indicator';
            headerIndicator.className = 'task-indicator task-indicator-floating';
            headerIndicator.innerHTML = `
                <button class="task-indicator-btn" onclick="TaskNotifications.togglePanel()" title="Failed Tasks">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <span class="task-indicator-badge">0</span>
                </button>
            `;
            headerIndicator.style.display = 'none';
            document.body.appendChild(headerIndicator);
            return;
        }

        // Create indicator in navbar
        headerIndicator = document.createElement('li');
        headerIndicator.id = 'task-indicator';
        headerIndicator.className = 'nav-item task-indicator';
        headerIndicator.innerHTML = `
            <button class="nav-link task-indicator-btn" onclick="TaskNotifications.togglePanel()" title="Failed Tasks">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <span class="task-indicator-badge">0</span>
            </button>
        `;
        headerIndicator.style.display = 'none';

        // Insert before the last nav item (usually user dropdown)
        const lastItem = navbar.lastElementChild;
        if (lastItem) {
            navbar.insertBefore(headerIndicator, lastItem);
        } else {
            navbar.appendChild(headerIndicator);
        }
    }

    /**
     * Create slide-out panel
     */
    function createPanel() {
        // Create overlay
        panelOverlay = document.createElement('div');
        panelOverlay.id = 'task-panel-overlay';
        panelOverlay.className = 'task-panel-overlay';
        panelOverlay.onclick = closePanel;
        document.body.appendChild(panelOverlay);

        // Create panel
        panel = document.createElement('div');
        panel.id = 'task-panel';
        panel.className = 'task-panel';
        panel.innerHTML = `
            <div class="task-panel-header">
                <h5 class="task-panel-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    Failed Tasks <span id="task-panel-count">(0)</span>
                </h5>
                <button class="task-panel-close" onclick="TaskNotifications.closePanel()" title="Close">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="task-panel-body" id="task-panel-body">
                <div class="task-panel-empty">
                    <p>No failed tasks</p>
                </div>
            </div>
            <div class="task-panel-footer">
                <button class="btn btn-outline-secondary btn-sm" onclick="TaskNotifications.dismissAllTasks()">
                    Dismiss All
                </button>
                <button class="btn btn-outline-primary btn-sm" onclick="TaskMonitor.refresh()">
                    Refresh
                </button>
            </div>
        `;
        document.body.appendChild(panel);
    }

    /**
     * Show error toast for a failed task
     * @param {object} task - The failed task
     */
    function showErrorToast(task) {
        if (!toastContainer) init();

        // Limit number of toasts
        const existingToasts = toastContainer.querySelectorAll('.task-toast');
        if (existingToasts.length >= config.maxToasts) {
            existingToasts[0].remove();
        }

        const toast = document.createElement('div');
        toast.className = 'task-toast task-toast-error';
        toast.innerHTML = `
            <div class="task-toast-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
            </div>
            <div class="task-toast-content">
                <div class="task-toast-title">Task Failed</div>
                <div class="task-toast-message">
                    ${escapeHtml(getTaskDescription(task))}
                </div>
                <div class="task-toast-error">${escapeHtml(truncate(task.error_message, 100))}</div>
            </div>
            <button class="task-toast-close" onclick="this.parentElement.remove()" title="Dismiss">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        // Add click to open panel
        toast.querySelector('.task-toast-content').onclick = function() {
            openPanel();
            toast.remove();
        };

        toastContainer.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('task-toast-visible');
        });

        // Auto-remove after duration
        setTimeout(() => {
            toast.classList.remove('task-toast-visible');
            setTimeout(() => toast.remove(), 300);
        }, config.toastDuration);
    }

    /**
     * Update the failed tasks list and UI
     * @param {Array} tasks - Array of failed tasks
     */
    function updateFailedTasks(tasks) {
        failedTasks = tasks || [];
        updateIndicator();
        updatePanelContent();
    }

    /**
     * Update header indicator badge
     */
    function updateIndicator() {
        if (!headerIndicator) return;

        const count = failedTasks.length;
        const badge = headerIndicator.querySelector('.task-indicator-badge');

        if (count > 0) {
            headerIndicator.style.display = '';
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.add('has-failures');
        } else {
            headerIndicator.style.display = 'none';
            badge.classList.remove('has-failures');
        }
    }

    /**
     * Update panel content with failed tasks
     */
    function updatePanelContent() {
        if (!panel) return;

        const body = panel.querySelector('#task-panel-body');
        const countSpan = panel.querySelector('#task-panel-count');

        countSpan.textContent = `(${failedTasks.length})`;

        if (failedTasks.length === 0) {
            body.innerHTML = `
                <div class="task-panel-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                    </svg>
                    <p>No failed tasks</p>
                </div>
            `;
            return;
        }

        const isAdmin = typeof TaskMonitor !== 'undefined' && TaskMonitor.isAdminOrSupervisor();

        body.innerHTML = failedTasks.map(task => `
            <div class="task-panel-item" data-task-id="${task.id}">
                <div class="task-panel-item-header">
                    <span class="task-panel-item-type">${escapeHtml(formatEntityType(task.entity_type))}</span>
                    <span class="task-panel-item-time">${formatTimeAgo(task.completed_at)}</span>
                </div>
                <div class="task-panel-item-label">
                    ${escapeHtml(task.entity_label || 'Unknown')}
                </div>
                <div class="task-panel-item-task">
                    Task: ${escapeHtml(formatTaskType(task.task_type))}
                </div>
                <div class="task-panel-item-error">
                    ${escapeHtml(task.error_message || 'Unknown error')}
                </div>
                ${isAdmin && task.created_by_name ? `
                    <div class="task-panel-item-user">
                        Created by: ${escapeHtml(task.created_by_name)}
                    </div>
                ` : ''}
                <div class="task-panel-item-actions">
                    <button class="btn btn-sm btn-outline-primary" onclick="TaskNotifications.viewEntity('${task.entity_type}', '${task.entity_id}')">
                        View ${escapeHtml(formatEntityType(task.entity_type))}
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="TaskNotifications.dismissTask('${task.id}')">
                        Dismiss
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Open the panel
     */
    function openPanel() {
        if (!panel) init();
        panel.classList.add('task-panel-open');
        panelOverlay.classList.add('task-panel-overlay-visible');
        isPanelOpen = true;
    }

    /**
     * Close the panel
     */
    function closePanel() {
        if (!panel) return;
        panel.classList.remove('task-panel-open');
        panelOverlay.classList.remove('task-panel-overlay-visible');
        isPanelOpen = false;
    }

    /**
     * Toggle panel open/closed
     */
    function togglePanel() {
        if (isPanelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    }

    /**
     * Dismiss a single task
     * @param {string} taskId - Task ID
     */
    async function dismissTask(taskId) {
        if (typeof TaskMonitor !== 'undefined') {
            const success = await TaskMonitor.dismissTask(taskId);
            if (success) {
                // Remove from local list and update UI
                failedTasks = failedTasks.filter(t => t.id !== taskId);
                updateIndicator();
                updatePanelContent();
            }
        }
    }

    /**
     * Dismiss all tasks
     */
    async function dismissAllTasks() {
        if (typeof TaskMonitor !== 'undefined') {
            const success = await TaskMonitor.dismissAllTasks();
            if (success) {
                failedTasks = [];
                updateIndicator();
                updatePanelContent();
            }
        }
    }

    /**
     * Navigate to view an entity
     * @param {string} entityType - Type of entity
     * @param {string} entityId - Entity ID
     */
    function viewEntity(entityType, entityId) {
        closePanel();

        // Map entity types to pages
        const pageMap = {
            'client': 'clients.html',
            'appointment': 'appointments.html',
            'driver': 'driver-management.html'
        };

        const page = pageMap[entityType] || 'dashboard.html';
        window.location.href = `${page}?id=${entityId}&highlight=true`;
    }

    // Helper functions

    function getTaskDescription(task) {
        return `${formatTaskType(task.task_type)} for "${task.entity_label || 'Unknown'}"`;
    }

    function formatEntityType(type) {
        const map = {
            'client': 'Client',
            'appointment': 'Appointment',
            'driver': 'Driver'
        };
        return map[type] || type;
    }

    function formatTaskType(type) {
        if (!type) return 'Unknown task';
        const map = {
            'calculate_drive_times': 'Calculate drive times',
            'sync_quo': 'Sync to Quo',
            'sync_appointment_quo': 'Sync appointment to Quo',
            'generate_invoice': 'Generate invoice',
            'send_notification': 'Send notification'
        };
        return map[type] || type.replace(/_/g, ' ');
    }

    function formatTimeAgo(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
        return `${Math.floor(seconds / 86400)} days ago`;
    }

    function truncate(str, length) {
        if (!str) return '';
        return str.length > length ? str.substring(0, length) + '...' : str;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Inject CSS styles
     */
    function injectStyles() {
        if (document.getElementById('task-notifications-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'task-notifications-styles';
        styles.textContent = `
            /* Toast Container */
            .task-toast-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 380px;
            }

            /* Toast */
            .task-toast {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 14px 16px;
                background: #fff;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                border-left: 4px solid #dc3545;
                transform: translateX(120%);
                transition: transform 0.3s ease;
                cursor: pointer;
            }

            .task-toast-visible {
                transform: translateX(0);
            }

            .task-toast-icon {
                flex-shrink: 0;
                color: #dc3545;
            }

            .task-toast-content {
                flex: 1;
                min-width: 0;
            }

            .task-toast-title {
                font-weight: 600;
                font-size: 14px;
                color: #333;
                margin-bottom: 4px;
            }

            .task-toast-message {
                font-size: 13px;
                color: #555;
                margin-bottom: 4px;
            }

            .task-toast-error {
                font-size: 12px;
                color: #888;
                font-style: italic;
            }

            .task-toast-close {
                flex-shrink: 0;
                background: none;
                border: none;
                padding: 4px;
                cursor: pointer;
                color: #999;
                transition: color 0.2s;
            }

            .task-toast-close:hover {
                color: #333;
            }

            /* Header Indicator */
            .task-indicator {
                position: relative;
            }

            .task-indicator-floating {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
            }

            .task-indicator-btn {
                display: flex;
                align-items: center;
                gap: 4px;
                background: none;
                border: none;
                padding: 8px 12px;
                cursor: pointer;
                color: #dc3545;
                position: relative;
            }

            .task-indicator-badge {
                position: absolute;
                top: 2px;
                right: 2px;
                min-width: 18px;
                height: 18px;
                padding: 0 5px;
                font-size: 11px;
                font-weight: 600;
                color: #fff;
                background: #dc3545;
                border-radius: 9px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .task-indicator-badge.has-failures {
                animation: pulse 2s infinite;
            }

            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }

            /* Panel Overlay */
            .task-panel-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.3);
                z-index: 10000;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.3s, visibility 0.3s;
            }

            .task-panel-overlay-visible {
                opacity: 1;
                visibility: visible;
            }

            /* Panel */
            .task-panel {
                position: fixed;
                top: 0;
                right: 0;
                bottom: 0;
                width: ${config.panelWidth};
                max-width: 100vw;
                background: #fff;
                z-index: 10001;
                display: flex;
                flex-direction: column;
                transform: translateX(100%);
                transition: transform 0.3s ease;
                box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
            }

            .task-panel-open {
                transform: translateX(0);
            }

            .task-panel-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px;
                border-bottom: 1px solid #e5e5e5;
                background: #f8f9fa;
            }

            .task-panel-title {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: #dc3545;
            }

            .task-panel-close {
                background: none;
                border: none;
                padding: 4px;
                cursor: pointer;
                color: #666;
                transition: color 0.2s;
            }

            .task-panel-close:hover {
                color: #333;
            }

            .task-panel-body {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }

            .task-panel-empty {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 200px;
                color: #888;
            }

            .task-panel-empty svg {
                margin-bottom: 12px;
                opacity: 0.5;
            }

            .task-panel-item {
                padding: 14px;
                border: 1px solid #e5e5e5;
                border-radius: 8px;
                margin-bottom: 12px;
                background: #fafafa;
            }

            .task-panel-item-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }

            .task-panel-item-type {
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                color: #666;
                background: #e5e5e5;
                padding: 2px 8px;
                border-radius: 4px;
            }

            .task-panel-item-time {
                font-size: 12px;
                color: #888;
            }

            .task-panel-item-label {
                font-size: 15px;
                font-weight: 600;
                color: #333;
                margin-bottom: 4px;
            }

            .task-panel-item-task {
                font-size: 13px;
                color: #555;
                margin-bottom: 6px;
            }

            .task-panel-item-error {
                font-size: 12px;
                color: #dc3545;
                background: #fff5f5;
                padding: 8px 10px;
                border-radius: 4px;
                margin-bottom: 8px;
                border: 1px solid #ffdddd;
            }

            .task-panel-item-user {
                font-size: 12px;
                color: #888;
                margin-bottom: 8px;
            }

            .task-panel-item-actions {
                display: flex;
                gap: 8px;
            }

            .task-panel-footer {
                display: flex;
                justify-content: space-between;
                padding: 12px 20px;
                border-top: 1px solid #e5e5e5;
                background: #f8f9fa;
            }

            /* Responsive */
            @media (max-width: 480px) {
                .task-panel {
                    width: 100vw;
                }

                .task-toast-container {
                    left: 10px;
                    right: 10px;
                    max-width: none;
                }
            }
        `;
        document.head.appendChild(styles);
    }

    // Public API
    return {
        init,
        showErrorToast,
        updateFailedTasks,
        openPanel,
        closePanel,
        togglePanel,
        dismissTask,
        dismissAllTasks,
        viewEntity,
        get failedTasks() { return failedTasks; },
        get isPanelOpen() { return isPanelOpen; }
    };

})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    TaskNotifications.init();
});
