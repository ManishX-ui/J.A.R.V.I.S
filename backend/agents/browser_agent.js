import BaseAgent from './base_agent.js';
import browserController from '../automation/browser_controller.js';
import eventBus from '../core/event_bus.js';

class BrowserAgent extends BaseAgent {
  constructor() {
    super('BROWSER');
  }

  async execute(action, params, rawText) {
    console.log(`[BROWSER_AGENT] Execution requested: ${action}`, params);
    
    eventBus.publish('diagnostic_log', {
      type: 'INFO',
      msg: `Browser Agent executing action: ${action}`
    });

    try {
      let result;
      switch (action) {
        case 'NAVIGATE':
          result = await browserController.execute('BROWSER_NAVIGATE', { url: params.url });
          break;
        case 'CLICK':
          result = await browserController.execute('BROWSER_CLICK', { selector: params.selector });
          break;
        case 'TYPE':
          result = await browserController.execute('BROWSER_TYPE', { selector: params.selector, text: params.text });
          break;
        case 'SCREENSHOT':
          result = await browserController.execute('BROWSER_SCREENSHOT', { fileName: params.fileName });
          break;
        case 'CLOSE':
          await browserController.close();
          result = { status: 'success', msg: 'Browser closed.' };
          break;
        default:
          throw new Error(`Unsupported browser action "${action}"`);
      }

      return result;
    } catch (err) {
      console.error(`[BROWSER_AGENT] Action "${action}" failed:`, err.message);
      throw err;
    }
  }
}

const browserAgent = new BrowserAgent();
export default browserAgent;
export { browserAgent };
