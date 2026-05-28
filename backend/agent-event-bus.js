'use strict';
/**
 * AgentEventBus — bridges agent-engine tool events to SSE streams.
 * When a tool fires during a skill run, this bus emits the event.
 * The SSE endpoint in api-proxy-routes subscribes and pushes to browser.
 */

const { EventEmitter } = require('events');

class AgentEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // support many concurrent streams
    this._subscribers = new Map(); // taskId -> [callback, ...]
  }

  /**
   * Emit a tool event for a task.
   * type: 'tool-start' | 'tool-done' | 'tool-error' | 'llm-start' | 'done' | 'error'
   */
  emitEvent(taskId, type, data = {}) {
    const event = { taskId, type, timestamp: Date.now(), ...data };
    this.emit('task-event', event);
    this.emit(`task:${taskId}`, event);
  }

  /**
   * Subscribe to events for a specific task.
   * Returns an unsubscribe function.
   */
  subscribe(taskId, callback) {
    const handler = (event) => callback(event);
    this.on(`task:${taskId}`, handler);
    return () => this.off(`task:${taskId}`, handler);
  }

  /**
   * Emit tool started event.
   */
  toolStart(taskId, toolName, params = {}) {
    this.emitEvent(taskId, 'tool-start', { tool: toolName, params });
  }

  /**
   * Emit tool completed event with result.
   */
  toolDone(taskId, toolName, result, durationMs = 0) {
    const preview = typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200);
    this.emitEvent(taskId, 'tool-done', { tool: toolName, preview, durationMs });
  }

  /**
   * Emit tool error event.
   */
  toolError(taskId, toolName, error) {
    this.emitEvent(taskId, 'tool-error', { tool: toolName, error: String(error) });
  }

  /**
   * Emit LLM synthesis started.
   */
  llmStart(taskId, provider = 'ollama') {
    this.emitEvent(taskId, 'llm-start', { provider });
  }

  /**
   * Emit task complete with final output.
   */
  taskDone(taskId, output, provider = 'unknown') {
    this.emitEvent(taskId, 'done', { output, provider });
  }

  /**
   * Emit task failed.
   */
  taskError(taskId, error) {
    this.emitEvent(taskId, 'error', { error: String(error) });
  }
}

// Singleton — shared across all modules
const bus = new AgentEventBus();
module.exports = bus;
