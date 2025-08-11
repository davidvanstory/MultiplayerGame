/**
 * @fileoverview Debug Console UI for Multiplayer Games
 * @module DebugConsole
 * @version 1.0.0
 * @description Provides a visual debug console for monitoring game state and events in real-time
 */

(function(window) {
  'use strict';

  class DebugConsole {
    constructor(config = {}) {
      this.config = {
        maxLogs: 100,
        position: 'bottom-right',
        width: '400px',
        height: '300px',
        collapsed: false,
        ...config
      };
      
      this.logs = [];
      this.stateHistory = [];
      this.isVisible = true;
      this.isCollapsed = this.config.collapsed;
      
      this.createElement();
      this.attachEventListeners();
      this.injectStyles();
      
      console.log('🛠️ Debug Console initialized');
    }

    createElement() {
      // Main container
      this.container = document.createElement('div');
      this.container.id = 'debug-console';
      this.container.className = `debug-console debug-console-${this.config.position}`;
      
      // Header
      const header = document.createElement('div');
      header.className = 'debug-console-header';
      header.innerHTML = `
        <span class="debug-console-title">🛠️ Game Debug Console</span>
        <div class="debug-console-controls">
          <button class="debug-console-btn" id="debug-clear">Clear</button>
          <button class="debug-console-btn" id="debug-export">Export</button>
          <button class="debug-console-btn" id="debug-collapse">−</button>
          <button class="debug-console-btn" id="debug-close">×</button>
        </div>
      `;
      
      // Tabs
      const tabs = document.createElement('div');
      tabs.className = 'debug-console-tabs';
      tabs.innerHTML = `
        <button class="debug-tab active" data-tab="logs">Logs</button>
        <button class="debug-tab" data-tab="state">State</button>
        <button class="debug-tab" data-tab="events">Events</button>
      `;
      
      // Content area
      this.content = document.createElement('div');
      this.content.className = 'debug-console-content';
      
      // Logs panel
      this.logsPanel = document.createElement('div');
      this.logsPanel.className = 'debug-panel active';
      this.logsPanel.id = 'debug-logs';
      
      // State panel
      this.statePanel = document.createElement('div');
      this.statePanel.className = 'debug-panel';
      this.statePanel.id = 'debug-state';
      this.statePanel.innerHTML = '<div class="debug-no-data">No state data yet...</div>';
      
      // Events panel
      this.eventsPanel = document.createElement('div');
      this.eventsPanel.className = 'debug-panel';
      this.eventsPanel.id = 'debug-events';
      this.eventsPanel.innerHTML = '<div class="debug-no-data">No events captured yet...</div>';
      
      // Assemble
      this.content.appendChild(this.logsPanel);
      this.content.appendChild(this.statePanel);
      this.content.appendChild(this.eventsPanel);
      
      this.container.appendChild(header);
      this.container.appendChild(tabs);
      this.container.appendChild(this.content);
      
      // Add to DOM
      document.body.appendChild(this.container);
    }

    attachEventListeners() {
      // Control buttons
      document.getElementById('debug-clear').addEventListener('click', () => this.clear());
      document.getElementById('debug-export').addEventListener('click', () => this.exportLogs());
      document.getElementById('debug-collapse').addEventListener('click', () => this.toggle());
      document.getElementById('debug-close').addEventListener('click', () => this.hide());
      
      // Tab switching
      this.container.querySelectorAll('.debug-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          this.switchTab(e.target.dataset.tab);
        });
      });
      
      // Make draggable
      let isDragging = false;
      let dragOffset = { x: 0, y: 0 };
      
      const header = this.container.querySelector('.debug-console-header');
      header.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragOffset.x = e.clientX - this.container.offsetLeft;
        dragOffset.y = e.clientY - this.container.offsetTop;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
      
      const onMouseMove = (e) => {
        if (isDragging) {
          this.container.style.left = (e.clientX - dragOffset.x) + 'px';
          this.container.style.top = (e.clientY - dragOffset.y) + 'px';
          this.container.style.position = 'fixed';
        }
      };
      
      const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
    }

    switchTab(tabName) {
      // Update tab buttons
      this.container.querySelectorAll('.debug-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
      });
      
      // Update panels
      this.container.querySelectorAll('.debug-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `debug-${tabName}`);
      });
    }

    addLog(source, message, data = null) {
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = {
        timestamp,
        source,
        message,
        data,
        id: Date.now() + Math.random()
      };
      
      this.logs.unshift(logEntry);
      
      // Limit logs
      if (this.logs.length > this.config.maxLogs) {
        this.logs = this.logs.slice(0, this.config.maxLogs);
      }
      
      this.renderLogs();
    }

    addStateUpdate(source, oldState, newState, changes) {
      const stateEntry = {
        timestamp: new Date().toLocaleTimeString(),
        source,
        oldState,
        newState,
        changes,
        id: Date.now() + Math.random()
      };
      
      this.stateHistory.unshift(stateEntry);
      
      // Limit state history
      if (this.stateHistory.length > 20) {
        this.stateHistory = this.stateHistory.slice(0, 20);
      }
      
      this.renderState();
    }

    renderLogs() {
      const logsHtml = this.logs.map(log => {
        const dataHtml = log.data ? 
          `<div class="debug-log-data">${this.formatData(log.data)}</div>` : '';
        
        return `
          <div class="debug-log-entry debug-source-${log.source.toLowerCase()}">
            <div class="debug-log-header">
              <span class="debug-log-time">${log.timestamp}</span>
              <span class="debug-log-source">${log.source}</span>
            </div>
            <div class="debug-log-message">${log.message}</div>
            ${dataHtml}
          </div>
        `;
      }).join('');
      
      this.logsPanel.innerHTML = logsHtml || '<div class="debug-no-data">No logs yet...</div>';
      
      // Auto-scroll to top for latest logs
      this.logsPanel.scrollTop = 0;
    }

    renderState() {
      if (this.stateHistory.length === 0) {
        this.statePanel.innerHTML = '<div class="debug-no-data">No state data yet...</div>';
        return;
      }
      
      const latest = this.stateHistory[0];
      const changesHtml = latest.changes.map(change => {
        return `
          <div class="debug-state-change debug-change-${change.type}">
            <strong>${change.property || change.type}:</strong> 
            ${change.old !== undefined ? JSON.stringify(change.old) : ''} 
            → ${change.new !== undefined ? JSON.stringify(change.new) : ''}
          </div>
        `;
      }).join('');
      
      this.statePanel.innerHTML = `
        <div class="debug-state-current">
          <h4>🎮 Current Game State (${latest.timestamp})</h4>
          <pre>${JSON.stringify(latest.newState, null, 2)}</pre>
        </div>
        <div class="debug-state-changes">
          <h4>🔄 Recent Changes</h4>
          ${changesHtml}
        </div>
        <div class="debug-state-history">
          <h4>📚 State History</h4>
          ${this.stateHistory.map((entry, i) => `
            <div class="debug-history-entry ${i === 0 ? 'current' : ''}">
              ${entry.timestamp} - ${entry.source} (${entry.changes.length} changes)
            </div>
          `).join('')}
        </div>
      `;
    }

    formatData(data) {
      if (typeof data === 'object' && data !== null) {
        return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
      }
      return String(data);
    }

    clear() {
      this.logs = [];
      this.stateHistory = [];
      this.renderLogs();
      this.renderState();
      this.eventsPanel.innerHTML = '<div class="debug-no-data">No events captured yet...</div>';
    }

    toggle() {
      this.isCollapsed = !this.isCollapsed;
      this.container.classList.toggle('collapsed', this.isCollapsed);
      const button = document.getElementById('debug-collapse');
      button.textContent = this.isCollapsed ? '+' : '−';
    }

    hide() {
      this.isVisible = false;
      this.container.style.display = 'none';
    }

    show() {
      this.isVisible = true;
      this.container.style.display = 'block';
    }

    exportLogs() {
      const exportData = {
        timestamp: new Date().toISOString(),
        logs: this.logs,
        stateHistory: this.stateHistory,
        gameConfig: window.GAME_CONFIG
      };
      
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `game-debug-${Date.now()}.json`;
      link.click();
      
      URL.revokeObjectURL(url);
      this.addLog('SYSTEM', 'Debug data exported to file');
    }

    injectStyles() {
      const styles = `
        .debug-console {
          position: fixed;
          background: #1a1a1a;
          border: 2px solid #333;
          border-radius: 8px;
          font-family: 'Monaco', 'Consolas', monospace;
          font-size: 12px;
          color: #fff;
          z-index: 10000;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
          width: ${this.config.width};
          height: ${this.config.height};
          min-width: 300px;
          min-height: 200px;
          display: flex;
          flex-direction: column;
        }
        
        .debug-console-bottom-right {
          bottom: 20px;
          right: 20px;
        }
        
        .debug-console-bottom-left {
          bottom: 20px;
          left: 20px;
        }
        
        .debug-console.collapsed .debug-console-content,
        .debug-console.collapsed .debug-console-tabs {
          display: none;
        }
        
        .debug-console-header {
          background: #333;
          padding: 8px 12px;
          border-radius: 6px 6px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: move;
          user-select: none;
        }
        
        .debug-console-title {
          font-weight: bold;
          color: #4CAF50;
        }
        
        .debug-console-controls {
          display: flex;
          gap: 4px;
        }
        
        .debug-console-btn {
          background: #555;
          border: none;
          color: #fff;
          padding: 4px 8px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 11px;
        }
        
        .debug-console-btn:hover {
          background: #666;
        }
        
        .debug-console-tabs {
          display: flex;
          background: #2a2a2a;
          border-bottom: 1px solid #333;
        }
        
        .debug-tab {
          background: none;
          border: none;
          color: #ccc;
          padding: 8px 16px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .debug-tab.active {
          background: #4CAF50;
          color: white;
        }
        
        .debug-tab:hover:not(.active) {
          background: #333;
        }
        
        .debug-console-content {
          flex: 1;
          overflow: hidden;
          display: flex;
        }
        
        .debug-panel {
          display: none;
          width: 100%;
          padding: 8px;
          overflow-y: auto;
          background: #1a1a1a;
        }
        
        .debug-panel.active {
          display: block;
        }
        
        .debug-log-entry {
          margin-bottom: 8px;
          padding: 6px;
          border-left: 3px solid #666;
          background: rgba(255,255,255,0.02);
        }
        
        .debug-source-multiplayer {
          border-left-color: #4CAF50;
        }
        
        .debug-source-game {
          border-left-color: #2196F3;
        }
        
        .debug-source-system {
          border-left-color: #FF9800;
        }
        
        .debug-log-header {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          opacity: 0.7;
          margin-bottom: 2px;
        }
        
        .debug-log-source {
          background: #333;
          padding: 2px 6px;
          border-radius: 10px;
        }
        
        .debug-log-message {
          font-weight: 500;
          margin-bottom: 4px;
        }
        
        .debug-log-data {
          background: #0a0a0a;
          padding: 6px;
          border-radius: 3px;
          font-size: 11px;
          max-height: 100px;
          overflow-y: auto;
        }
        
        .debug-log-data pre {
          margin: 0;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        
        .debug-no-data {
          text-align: center;
          color: #666;
          font-style: italic;
          padding: 20px;
        }
        
        .debug-state-current pre {
          background: #0a0a0a;
          padding: 8px;
          border-radius: 4px;
          max-height: 120px;
          overflow-y: auto;
          margin: 8px 0;
        }
        
        .debug-state-changes {
          margin-top: 12px;
        }
        
        .debug-state-change {
          padding: 4px 8px;
          margin: 2px 0;
          border-radius: 3px;
          font-size: 11px;
        }
        
        .debug-change-property_change {
          background: rgba(76, 175, 80, 0.1);
          border-left: 3px solid #4CAF50;
        }
        
        .debug-change-property_removed {
          background: rgba(244, 67, 54, 0.1);
          border-left: 3px solid #F44336;
        }
        
        .debug-history-entry {
          padding: 4px 8px;
          margin: 2px 0;
          background: rgba(255,255,255,0.02);
          border-radius: 3px;
          font-size: 11px;
        }
        
        .debug-history-entry.current {
          background: rgba(76, 175, 80, 0.1);
          border-left: 3px solid #4CAF50;
        }
      `;
      
      const styleSheet = document.createElement('style');
      styleSheet.textContent = styles;
      document.head.appendChild(styleSheet);
    }
  }

  // Auto-initialize if in debug mode
  if (window.DEBUG_MULTIPLAYER || window.location.hostname === 'localhost') {
    document.addEventListener('DOMContentLoaded', () => {
      window.debugConsole = new DebugConsole();
      
      // Add initial log
      window.debugConsole.addLog('SYSTEM', 'Debug console initialized', {
        gameConfig: window.GAME_CONFIG,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      });
    });
  }

  // Expose globally
  window.DebugConsole = DebugConsole;

})(window);