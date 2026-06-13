import eventBus from './event_bus.js';

class JarvisQueue {
  constructor() {
    this.queue = [];
    this.activeTask = null;
  }

  /**
   * Pushes a task into the execution queue
   * @param {string} name - Human readable name of the task
   * @param {function} executeFn - Async execution callback
   * @param {number} priority - Task execution priority (higher = sooner)
   */
  addTask(name, executeFn, priority = 0) {
    const task = { name, executeFn, priority, timestamp: Date.now() };
    this.queue.push(task);
    
    // Sort by priority desc, then timestamp asc
    this.queue.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);
    console.log(`[QUEUE] Task added: "${name}". Current queue size: ${this.queue.length}`);
    eventBus.publish('diagnostic_log', { type: 'INFO', msg: `Task "${name}" added to execution queue.` });
    
    this.processNext();
  }

  async processNext() {
    if (this.activeTask || this.queue.length === 0) return;

    this.activeTask = this.queue.shift();
    console.log(`[QUEUE] Executing task: "${this.activeTask.name}"`);
    eventBus.publish('diagnostic_log', { type: 'CORE', msg: `Starting task: "${this.activeTask.name}"` });

    try {
      await this.activeTask.executeFn();
      console.log(`[QUEUE] Finished task: "${this.activeTask.name}"`);
      eventBus.publish('diagnostic_log', { type: 'CORE', msg: `Completed task: "${this.activeTask.name}"` });
    } catch (err) {
      console.error(`[QUEUE] Task "${this.activeTask.name}" failed:`, err.message);
      eventBus.publish('diagnostic_log', { type: 'WARN', msg: `Task "${this.activeTask.name}" failed: ${err.message}` });
    } finally {
      this.activeTask = null;
      // Trigger execution of the next task in the queue
      setTimeout(() => this.processNext(), 50);
    }
  }
}

const taskQueue = new JarvisQueue();
export default taskQueue;
