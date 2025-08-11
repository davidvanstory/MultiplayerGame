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
      // Main container - vertical side panel
      this.container = document.createElement('div');
      this.container.id = 'debug-console';
      this.container.className = 'debug-console-panel';
      
      // Toggle button (always visible)
      this.toggleButton = document.createElement('div');
      this.toggleButton.className = 'debug-toggle-btn';
      this.toggleButton.innerHTML = '🛠️';
      this.toggleButton.title = 'Toggle Debug Console';
      
      // Header
      const header = document.createElement('div');
      header.className = 'debug-header';
      header.innerHTML = `
        <div class="debug-title">
          <span class="debug-icon">🛠️</span>
          <span class="debug-text">Game Debug</span>
        </div>
        <div class="debug-controls">
          <button class="debug-btn" id="debug-clear" title="Clear logs">🗑️</button>
          <button class="debug-btn" id="debug-export" title="Export logs">💾</button>
          <button class="debug-btn" id="debug-close" title="Close panel">✕</button>
        </div>
      `;
      
      // Single unified log list (no tabs, no nested scrolling)
      this.logList = document.createElement('div');
      this.logList.className = 'debug-log-list';
      this.logList.innerHTML = '<div class="debug-welcome">Debug console initialized. Game events will appear here...</div>';
      
      // Assemble
      this.container.appendChild(header);
      this.container.appendChild(this.logList);
      
      // Add both to DOM
      document.body.appendChild(this.toggleButton);
      document.body.appendChild(this.container);
      
      // Start collapsed
      this.isCollapsed = true;
      this.container.classList.add('collapsed');
    }

    attachEventListeners() {
      // Toggle button
      this.toggleButton.addEventListener('click', () => this.toggle());
      
      // Control buttons
      document.getElementById('debug-clear').addEventListener('click', () => this.clear());
      document.getElementById('debug-export').addEventListener('click', () => this.exportLogs());
      document.getElementById('debug-close').addEventListener('click', () => this.hide());
    }

    addLog(source, message, data = null) {
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = {
        timestamp,
        source,
        message,
        data,
        type: 'log',
        id: Date.now() + Math.random()
      };
      
      this.logs.unshift(logEntry);
      
      // Limit logs
      if (this.logs.length > this.config.maxLogs) {
        this.logs = this.logs.slice(0, this.config.maxLogs);
      }
      
      this.renderUnifiedList();
    }

    addStateUpdate(source, oldState, newState, changes) {
      const stateEntry = {
        timestamp: new Date().toLocaleTimeString(),
        source,
        oldState,
        newState,
        changes,
        type: 'state',
        id: Date.now() + Math.random()
      };
      
      this.logs.unshift(stateEntry);
      
      // Limit logs
      if (this.logs.length > this.config.maxLogs) {
        this.logs = this.logs.slice(0, this.config.maxLogs);
      }
      
      this.renderUnifiedList();
    }

    renderUnifiedList() {
      const itemsHtml = this.logs.map(item => {
        if (item.type === 'log') {
          return this.renderLogItem(item);
        } else if (item.type === 'state') {
          return this.renderStateItem(item);
        }
        return '';
      }).join('');
      
      this.logList.innerHTML = itemsHtml || '<div class="debug-welcome">No activity yet...</div>';
      
      // Auto-scroll to top for latest items
      this.logList.scrollTop = 0;
    }

    renderLogItem(log) {
      const dataHtml = log.data ? 
        `<div class="debug-data">${this.formatData(log.data)}</div>` : '';
      
      const icon = this.getSourceIcon(log.source);
      
      return `
        <div class="debug-item debug-item-log debug-source-${log.source.toLowerCase()}">
          <div class="debug-item-header">
            <span class="debug-icon">${icon}</span>
            <span class="debug-time">${log.timestamp}</span>
            <span class="debug-source">${log.source}</span>
          </div>
          <div class="debug-message">${log.message}</div>
          ${dataHtml}
        </div>
      `;
    }

    renderStateItem(state) {
      const changesHtml = state.changes.map(change => {
        const changeIcon = change.type === 'property_change' ? '🔄' : '❌';
        return `
          <div class="debug-change">
            ${changeIcon} <strong>${change.property || change.type}:</strong> 
            ${change.old !== undefined ? JSON.stringify(change.old) : ''} 
            → ${change.new !== undefined ? JSON.stringify(change.new) : ''}
          </div>
        `;
      }).join('');
      
      return `
        <div class="debug-item debug-item-state">
          <div class="debug-item-header">
            <span class="debug-icon">🎮</span>
            <span class="debug-time">${state.timestamp}</span>
            <span class="debug-source">${state.source}</span>
          </div>
          <div class="debug-message">State Update (${state.changes.length} changes)</div>
          <div class="debug-changes">
            ${changesHtml}
          </div>
        </div>
      `;
    }

    getSourceIcon(source) {
      const icons = {
        'MULTIPLAYER': '🌐',
        'GAME': '🎮',
        'SYSTEM': '⚙️',
        'ERROR': '❌',
        'USER': '👤',
        'SERVER': '🖥️'
      };
      return icons[source.toUpperCase()] || '📝';
    }

    formatData(data) {
      if (typeof data === 'object' && data !== null) {
        return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
      }
      return String(data);
    }

    clear() {
      this.logs = [];
      this.renderUnifiedList();
    }

    toggle() {
      this.isCollapsed = !this.isCollapsed;
      this.container.classList.toggle('collapsed', this.isCollapsed);
    }

    hide() {
      this.isVisible = false;
      this.container.classList.add('hidden');
      this.toggleButton.style.display = 'block';
    }

    show() {
      this.isVisible = true;
      this.container.classList.remove('hidden');
      this.toggleButton.style.display = 'none';
    }

    exportLogs() {
      const exportData = {
        timestamp: new Date().toISOString(),
        logs: this.logs,
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
        /* Toggle Button */
        .debug-toggle-btn {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 40px;
          height: 40px;
          background: #2d2d2d;
          border: 2px solid #4CAF50;
          border-radius: 50%;
          color: #4CAF50;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10001;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
          user-select: none;
        }
        
        .debug-toggle-btn:hover {
          background: #3d3d3d;
          transform: scale(1.1);
        }
        
        /* Main Panel */
        .debug-console-panel {
          position: fixed;
          top: 0;
          right: 0;
          width: 400px;
          height: 100vh;
          background: #1a1a1a;
          border-left: 3px solid #4CAF50;
          font-family: 'Monaco', 'Consolas', monospace;
          font-size: 13px;
          color: #fff;
          z-index: 10000;
          display: flex;
          flex-direction: column;
          box-shadow: -4px 0 20px rgba(0,0,0,0.5);
          transition: transform 0.3s ease;
        }
        
        .debug-console-panel.collapsed {
          transform: translateX(100%);
        }
        
        .debug-console-panel.hidden {
          display: none;
        }
        
        /* Header */
        .debug-header {
          background: #2d2d2d;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #4CAF50;
        }
        
        .debug-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: bold;
          color: #4CAF50;
        }
        
        .debug-controls {
          display: flex;
          gap: 8px;
        }
        
        .debug-btn {
          background: #3d3d3d;
          border: 1px solid #555;
          color: #fff;
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }
        
        .debug-btn:hover {
          background: #4d4d4d;
          border-color: #4CAF50;
        }
        
        /* Log List */
        .debug-log-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          background: #1a1a1a;
        }
        
        .debug-log-list::-webkit-scrollbar {
          width: 8px;
        }
        
        .debug-log-list::-webkit-scrollbar-track {
          background: #2d2d2d;
        }
        
        .debug-log-list::-webkit-scrollbar-thumb {
          background: #4CAF50;
          border-radius: 4px;
        }
        
        /* Welcome Message */
        .debug-welcome {
          text-align: center;
          color: #666;
          font-style: italic;
          padding: 20px;
          background: rgba(76, 175, 80, 0.1);
          border-radius: 8px;
          margin-bottom: 12px;
        }
        
        /* Debug Items */
        .debug-item {
          margin-bottom: 12px;
          padding: 8px 12px;
          background: rgba(255,255,255,0.03);
          border-radius: 6px;
          border-left: 4px solid #666;
          transition: all 0.2s;
        }
        
        .debug-item:hover {
          background: rgba(255,255,255,0.05);
        }
        
        .debug-item-log {
          border-left-color: #2196F3;
        }
        
        .debug-item-state {
          border-left-color: #4CAF50;
          background: rgba(76, 175, 80, 0.08);
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
        
        .debug-source-error {
          border-left-color: #F44336;
          background: rgba(244, 67, 54, 0.08);
        }
        
        /* Item Headers */
        .debug-item-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
          font-size: 11px;
          opacity: 0.8;
        }
        
        .debug-icon {
          font-size: 14px;
        }
        
        .debug-time {
          color: #888;
          font-family: monospace;
        }
        
        .debug-source {
          background: #3d3d3d;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: bold;
        }
        
        /* Messages and Data */
        .debug-message {
          font-weight: 500;
          margin-bottom: 6px;
          line-height: 1.4;
        }
        
        .debug-data {
          background: #0f0f0f;
          padding: 8px;
          border-radius: 4px;
          font-size: 11px;
          border: 1px solid #333;
          max-height: 200px;
          overflow-y: auto;
        }
        
        .debug-data pre {
          margin: 0;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: #ccc;
        }
        
        /* State Changes */
        .debug-changes {
          margin-top: 6px;
        }
        
        .debug-change {
          padding: 4px 8px;
          margin: 2px 0;
          background: rgba(255,255,255,0.03);
          border-radius: 3px;
          font-size: 11px;
          line-height: 1.3;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
          .debug-console-panel {
            width: 100%;
          }
          
          .debug-toggle-btn {
            top: 10px;
            right: 10px;
          }
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