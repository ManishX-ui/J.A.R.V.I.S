import eventBus from '../core/event_bus.js';

export default class BaseAgent {
  /**
   * @param {string} name - The identity of this agent
   */
  constructor(name) {
    this.name = name;
    this.initialize();
  }

  initialize() {
    console.log(`[AGENT] Initializing: ${this.name}`);
    
    // Subscribe to standard execute directives
    eventBus.subscribe('agent_execute', async (data) => {
      if (data.agent.toUpperCase() === this.name.toUpperCase()) {
        console.log(`[AGENT ${this.name}] Intercepted execution command.`);
        eventBus.publish('agent_activity', { agent: this.name, status: 'busy', action: data.action });
        
        try {
          const result = await this.execute(data.action, data.params, data.originalText);
          eventBus.publish('agent_result', { agent: this.name, success: true, result });
        } catch (err) {
          console.error(`[AGENT ${this.name}] Execution error:`, err.message);
          eventBus.publish('agent_result', { agent: this.name, success: false, error: err.message });
        } finally {
          eventBus.publish('agent_activity', { agent: this.name, status: 'idle' });
        }
      }
    });
  }

  /**
   * Execution hook to be implemented by child class agents
   * @param {string} action - Action command type
   * @param {object} params - Argument variables
   * @param {string} rawText - Original command text
   * @returns {Promise<any>} Response output
   */
  async execute(action, params, rawText) {
    throw new Error(`execute() must be implemented in specialized agent ${this.name}`);
  }
}
