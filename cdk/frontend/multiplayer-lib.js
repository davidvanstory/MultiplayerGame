/**
 * @fileoverview Universal multiplayer event bridge for HTML games
 * @module GameEventBridge
 * @version 1.0.0
 * @description Lightweight client library that provides a simple interface for HTML games
 * to send/receive network events while being decoupled from multiplayer implementation
 */

(function(window) {
  'use strict';
  
  /**
   * @class GameEventBridge
   * @description Main event bridge class for intercepting and emitting game events
   */
  class GameEventBridge {
    /**
     * Creates a new GameEventBridge instance
     * @param {Object} config - Configuration object
     * @param {string} config.gameId - Unique game identifier
     * @param {string} config.playerId - Current player ID
     * @param {string} [config.sessionId] - Optional session identifier
     * @param {boolean} [config.batchEvents=true] - Whether to batch events before sending
     * @param {number} [config.batchInterval=100] - Interval in ms for batching events
     * @param {boolean} [config.autoIntercept=true] - Whether to automatically intercept DOM events
     */
    constructor(config) {
      if (!config || !config.gameId || !config.playerId) {
        throw new Error('GameEventBridge requires gameId and playerId in config');
      }
      
      this.gameId = config.gameId;
      this.playerId = config.playerId;
      this.sessionId = config.sessionId || this._generateSessionId();
      this.batchEvents = config.batchEvents !== false;
      this.batchInterval = config.batchInterval || 100;
      this.autoIntercept = config.autoIntercept !== false;
      
      // Internal state
      this.eventQueue = [];
      this.sequenceNumber = 0;
      this.observers = [];
      this.listeners = new Map();
      this.batchTimer = null;
      this.isInitialized = false;
      
      // Debug mode
      this.debug = window.DEBUG_MULTIPLAYER === true;
      
      this._initialize();
    }
    
    /**
     * Initialize the event bridge
     * @private
     */
    _initialize() {
      if (this.isInitialized) return;
      
      this._log('Initializing GameEventBridge', {
        gameId: this.gameId,
        playerId: this.playerId,
        sessionId: this.sessionId
      });
      
      // Set up automatic event interception
      if (this.autoIntercept) {
        this.interceptGameEvents();
      }
      
      // Start batch processing if enabled
      if (this.batchEvents) {
        this.startBatchProcessing();
      }
      
      // Listen for messages from parent frame
      this._setupMessageListener();
      
      this.isInitialized = true;
      
      // Emit initialization event
      this.emit('TRANSITION', {
        state: 'initialized',
        message: 'GameEventBridge ready'
      });
    }
    
    /**
     * Emit an event with metadata
     * @param {string} type - Event type: TRANSITION|INTERACTION|UPDATE|ERROR
     * @param {Object} data - Event-specific data
     * @param {Object} [options] - Additional options
     * @param {boolean} [options.immediate=false] - Send immediately without batching
     * @param {string} [options.priority='normal'] - Event priority: low|normal|high
     * @returns {Object} The created event object
     */
    emit(type, data, options = {}) {
      const validTypes = ['TRANSITION', 'INTERACTION', 'UPDATE', 'ERROR'];
      if (!validTypes.includes(type)) {
        console.error(`Invalid event type: ${type}. Must be one of: ${validTypes.join(', ')}`);
        return null;
      }
      
      const event = {
        type,
        data,
        metadata: {
          gameId: this.gameId,
          playerId: this.playerId,
          sessionId: this.sessionId,
          timestamp: Date.now(),
          sequenceNumber: this.sequenceNumber++,
          priority: options.priority || 'normal'
        }
      };
      
      this._log(`Emitting ${type} event`, event);
      
      // Notify local listeners
      this._notifyListeners(type, event);
      
      // Send to parent frame
      if (options.immediate || !this.batchEvents) {
        this._sendToParent([event]);
      } else {
        this.eventQueue.push(event);
        this._scheduleBatch();
      }
      
      return event;
    }
    
    /**
     * Register a listener for specific event types
     * @param {string} type - Event type to listen for
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    on(type, callback) {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, new Set());
      }
      
      this.listeners.get(type).add(callback);
      
      this._log(`Registered listener for ${type} events`);
      
      // Return unsubscribe function
      return () => {
        const typeListeners = this.listeners.get(type);
        if (typeListeners) {
          typeListeners.delete(callback);
        }
      };
    }
    
    /**
     * Auto-detect and intercept game events from DOM
     * @public
     */
    interceptGameEvents() {
      this._log('Setting up game event interception');
      
      // Intercept clicks on elements with data-game-action
      this._interceptClicks();
      
      // Monitor state changes on elements with data-game-state
      this._monitorStateChanges();
      
      // Intercept form submissions
      this._interceptForms();
      
      // Monitor keyboard events for games
      this._interceptKeyboard();
      
      // Monitor touch events for mobile games
      this._interceptTouch();
    }
    
    /**
     * Start synchronization and batch processing
     * @public
     */
    startBatchProcessing() {
      this._log('Starting batch processing');
      
      // Ensure we send batched events periodically
      if (this.batchTimer) {
        clearInterval(this.batchTimer);
      }
      
      this.batchTimer = setInterval(() => {
        this._flushEventQueue();
      }, this.batchInterval);
    }
    
    /**
     * Stop batch processing
     * @public
     */
    stopBatchProcessing() {
      if (this.batchTimer) {
        clearInterval(this.batchTimer);
        this.batchTimer = null;
      }
      
      // Flush any remaining events
      this._flushEventQueue();
    }
    
    /**
     * Intercept click events
     * @private
     */
    _interceptClicks() {
      document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-game-action]');
        if (target) {
          const action = target.dataset.gameAction;
          const additionalData = this._extractDataAttributes(target);
          
          this.emit('INTERACTION', {
            action: 'click',
            target: action,
            position: { x: e.clientX, y: e.clientY },
            element: target.tagName.toLowerCase(),
            ...additionalData
          });
        }
      }, true);
    }
    
    /**
     * Monitor state changes using MutationObserver
     * @private
     */
    _monitorStateChanges() {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          const target = mutation.target;
          
          // Check if element or its parent has data-game-state
          const stateElement = target.nodeType === Node.ELEMENT_NODE &&
                              target.closest('[data-game-state]');
          
          if (stateElement) {
            const stateName = stateElement.dataset.gameState;
            const additionalData = this._extractDataAttributes(stateElement);
            
            if (mutation.type === 'characterData' || mutation.type === 'childList') {
              this.emit('UPDATE', {
                element: stateName,
                type: 'content',
                oldValue: mutation.oldValue,
                newValue: stateElement.textContent,
                ...additionalData
              });
            } else if (mutation.type === 'attributes') {
              this.emit('UPDATE', {
                element: stateName,
                type: 'attribute',
                attribute: mutation.attributeName,
                oldValue: mutation.oldValue,
                newValue: stateElement.getAttribute(mutation.attributeName),
                ...additionalData
              });
            }
          }
        });
      });
      
      // Start observing (wait for body to be available)
      const startObserving = () => {
        if (document.body) {
          observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeOldValue: true,
            characterDataOldValue: true,
            attributeFilter: ['data-game-state', 'data-player', 'data-value', 'class', 'style']
          });
          this.observers.push(observer);
        } else {
          setTimeout(startObserving, 10);
        }
      };
      
      startObserving();
    }
    
    /**
     * Intercept form submissions
     * @private
     */
    _interceptForms() {
      document.addEventListener('submit', (e) => {
        const form = e.target;
        if (form.dataset.gameForm) {
          e.preventDefault();
          
          const formData = new FormData(form);
          const data = Object.fromEntries(formData.entries());
          
          this.emit('INTERACTION', {
            action: 'form_submit',
            formId: form.dataset.gameForm,
            formData: data
          });
        }
      }, true);
    }
    
    /**
     * Intercept keyboard events
     * @private
     */
    _interceptKeyboard() {
      const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                       'Enter', ' ', 'w', 'a', 's', 'd'];
      
      document.addEventListener('keydown', (e) => {
        if (gameKeys.includes(e.key) || e.target.dataset.gameInput) {
          const focusedElement = document.activeElement;
          const gameContext = focusedElement.closest('[data-game-context]');
          
          if (gameContext || e.target.dataset.gameInput) {
            this.emit('INTERACTION', {
              action: 'keydown',
              key: e.key,
              keyCode: e.keyCode,
              context: gameContext?.dataset.gameContext || 'global',
              ctrlKey: e.ctrlKey,
              shiftKey: e.shiftKey,
              altKey: e.altKey
            });
          }
        }
      });
    }
    
    /**
     * Intercept touch events for mobile games
     * @private
     */
    _interceptTouch() {
      let touchStartPos = null;
      
      document.addEventListener('touchstart', (e) => {
        const target = e.target.closest('[data-game-touch]');
        if (target) {
          touchStartPos = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
          };
          
          this.emit('INTERACTION', {
            action: 'touch_start',
            target: target.dataset.gameTouch,
            position: touchStartPos
          });
        }
      }, { passive: true });
      
      document.addEventListener('touchend', (e) => {
        const target = e.target.closest('[data-game-touch]');
        if (target && touchStartPos) {
          const touchEndPos = {
            x: e.changedTouches[0].clientX,
            y: e.changedTouches[0].clientY
          };
          
          // Calculate swipe if moved significantly
          const deltaX = touchEndPos.x - touchStartPos.x;
          const deltaY = touchEndPos.y - touchStartPos.y;
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          
          if (distance > 30) {
            // Determine swipe direction
            let direction;
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
              direction = deltaX > 0 ? 'right' : 'left';
            } else {
              direction = deltaY > 0 ? 'down' : 'up';
            }
            
            this.emit('INTERACTION', {
              action: 'swipe',
              direction,
              distance,
              startPosition: touchStartPos,
              endPosition: touchEndPos
            });
          } else {
            // Treat as tap
            this.emit('INTERACTION', {
              action: 'tap',
              target: target.dataset.gameTouch,
              position: touchEndPos
            });
          }
          
          touchStartPos = null;
        }
      }, { passive: true });
    }
    
    /**
     * Extract all data attributes from an element
     * @private
     * @param {HTMLElement} element - Element to extract from
     * @returns {Object} Object with data attributes
     */
    _extractDataAttributes(element) {
      const data = {};
      for (const key in element.dataset) {
        if (key.startsWith('game') && key !== 'gameState' && key !== 'gameAction') {
          data[key.replace('game', '').toLowerCase()] = element.dataset[key];
        }
      }
      return data;
    }
    
    /**
     * Send events to parent frame
     * @private
     * @param {Array} events - Array of events to send
     */
    _sendToParent(events) {
      if (window.parent === window) {
        this._log('No parent frame detected, events not sent', events);
        return;
      }
      
      const message = {
        source: 'GameEventBridge',
        gameId: this.gameId,
        playerId: this.playerId,
        events
      };
      
      this._log('Sending to parent frame', message);
      
      try {
        window.parent.postMessage(message, '*');
      } catch (error) {
        this.emit('ERROR', {
          message: 'Failed to send events to parent frame',
          error: error.message
        }, { immediate: true });
      }
    }
    
    /**
     * Flush the event queue
     * @private
     */
    _flushEventQueue() {
      if (this.eventQueue.length === 0) return;
      
      const events = [...this.eventQueue];
      this.eventQueue = [];
      
      this._sendToParent(events);
    }
    
    /**
     * Schedule batch processing
     * @private
     */
    _scheduleBatch() {
      if (!this.batchEvents) return;
      
      // If queue is getting large, flush immediately
      if (this.eventQueue.length > 50) {
        this._flushEventQueue();
      }
    }
    
    /**
     * Set up listener for messages from parent frame
     * @private
     */
    _setupMessageListener() {
      window.addEventListener('message', (e) => {
        // Only process messages intended for this game
        if (e.data && e.data.target === 'GameEventBridge' && e.data.gameId === this.gameId) {
          this._log('Received message from parent', e.data);
          
          // Handle different message types
          switch (e.data.type) {
            case 'STATE_UPDATE':
              this._handleStateUpdate(e.data.state);
              break;
            case 'PLAYER_ACTION':
              this._handlePlayerAction(e.data.action);
              break;
            case 'GAME_EVENT':
              this._handleGameEvent(e.data.event);
              break;
            case 'CONFIG_UPDATE':
              this._handleConfigUpdate(e.data.config);
              break;
            default:
              this._log('Unknown message type', e.data.type);
          }
        }
      });
    }
    
    /**
     * Handle state update from parent
     * @private
     * @param {Object} state - New state data
     */
    _handleStateUpdate(state) {
      this._notifyListeners('STATE_UPDATE', { state });
    }
    
    /**
     * Handle player action from parent
     * @private
     * @param {Object} action - Player action data
     */
    _handlePlayerAction(action) {
      this._notifyListeners('PLAYER_ACTION', { action });
    }
    
    /**
     * Handle game event from parent
     * @private
     * @param {Object} event - Game event data
     */
    _handleGameEvent(event) {
      this._notifyListeners(event.type, event);
    }
    
    /**
     * Handle configuration update
     * @private
     * @param {Object} config - New configuration
     */
    _handleConfigUpdate(config) {
      if (config.batchEvents !== undefined) {
        this.batchEvents = config.batchEvents;
      }
      if (config.batchInterval !== undefined) {
        this.batchInterval = config.batchInterval;
        if (this.batchEvents) {
          this.stopBatchProcessing();
          this.startBatchProcessing();
        }
      }
      if (config.debug !== undefined) {
        this.debug = config.debug;
      }
    }
    
    /**
     * Notify registered listeners
     * @private
     * @param {string} type - Event type
     * @param {Object} data - Event data
     */
    _notifyListeners(type, data) {
      const typeListeners = this.listeners.get(type);
      if (typeListeners) {
        typeListeners.forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error('Error in event listener:', error);
          }
        });
      }
      
      // Also notify wildcard listeners
      const wildcardListeners = this.listeners.get('*');
      if (wildcardListeners) {
        wildcardListeners.forEach(callback => {
          try {
            callback({ type, ...data });
          } catch (error) {
            console.error('Error in wildcard listener:', error);
          }
        });
      }
    }
    
    /**
     * Generate a unique session ID
     * @private
     * @returns {string} Session ID
     */
    _generateSessionId() {
      return `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }
    
    /**
     * Log debug messages
     * @private
     * @param {string} message - Log message
     * @param {*} data - Additional data to log
     */
    _log(message, data) {
      // Skip routine UPDATE event logging unless verbose mode is on
      if (message.includes('UPDATE') && !window.DEBUG_ALL_EVENTS) {
        return;
      }
      
      if (this.debug) {
        console.log(`[GameEventBridge] ${message}`, data || '');
      }
    }
    
    /**
     * Clean up and destroy the event bridge
     * @public
     */
    destroy() {
      this._log('Destroying GameEventBridge');
      
      // Stop batch processing
      this.stopBatchProcessing();
      
      // Disconnect observers
      this.observers.forEach(observer => observer.disconnect());
      this.observers = [];
      
      // Clear listeners
      this.listeners.clear();
      
      // Send final event
      this.emit('TRANSITION', {
        state: 'destroyed',
        message: 'GameEventBridge destroyed'
      }, { immediate: true });
      
      this.isInitialized = false;
    }
  }
  
  // Auto-initialize if GAME_CONFIG exists
  if (window.GAME_CONFIG && !window.gameEvents) {
    window.gameEvents = new GameEventBridge(window.GAME_CONFIG);
    
    if (window.DEBUG_MULTIPLAYER) {
      console.log('[GameEventBridge] Auto-initialized with config:', window.GAME_CONFIG);
    }
  }
  
  // Expose the class globally
  window.GameEventBridge = GameEventBridge;
  
  // Also expose utility functions
  window.GameEventBridge.VERSION = '1.0.0';
  
  /**
   * Quick initialization helper
   * @param {string} gameId - Game identifier
   * @param {string} playerId - Player identifier
   * @returns {GameEventBridge} New bridge instance
   */
  window.GameEventBridge.init = function(gameId, playerId) {
    return new GameEventBridge({ gameId, playerId });
  };
  
})(window);