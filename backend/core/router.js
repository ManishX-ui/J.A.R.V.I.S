import eventBus from './event_bus.js';

class JarvisRouter {
  constructor() {
    this.initializeRouting();
  }

  initializeRouting() {
    // Listen for processed commands from the orchestrator
    eventBus.subscribe('process_command', async (data) => {
      const { text, source, lang } = data;
      console.log(`[ROUTER] Processing input: "${text}"`);

      // 1. Run Intent Classification Rules
      const classified = this.classifyIntent(text);
      console.log(`[ROUTER] Classified Intent: ${classified.intent} (Confidence: ${classified.confidence})`);

      if (classified.intent === 'CONVERSATION') {
        // Fall back to cloud LLM or coordinator agent
        eventBus.publish('agent_coordinator_execute', { text, source, lang });
      } else {
        // Route structured action immediately to the event bus
        eventBus.publish('agent_execute', {
          agent: classified.targetAgent,
          action: classified.action,
          params: classified.params,
          originalText: text
        });
      }
    });
  }

  /**
   * Simple and fast heuristic intent classifier for low-latency routing.
   * Can be scaled to local transformer embeddings in future phases.
   * @param {string} text - User command string
   * @returns {object} Classified intent metadata
   */
  classifyIntent(text) {
    const raw = text.toLowerCase().trim();

    // System Operations
    if (raw.includes('shutdown') || raw.includes('shut down') || raw.includes('बंद करो')) {
      return { intent: 'SYSTEM_ACTION', action: 'SHUTDOWN', targetAgent: 'SYSTEM', confidence: 1.0, params: {} };
    }
    if (raw.includes('restart') || raw.includes('रिस्टार्ट')) {
      return { intent: 'SYSTEM_ACTION', action: 'RESTART', targetAgent: 'SYSTEM', confidence: 1.0, params: {} };
    }
    if (raw.includes('lock screen') || raw.includes('screen lock') || raw.includes('कंप्यूटर लॉक')) {
      return { intent: 'SYSTEM_ACTION', action: 'LOCK_SCREEN', targetAgent: 'SYSTEM', confidence: 0.95, params: {} };
    }
    if (raw.includes('screenshot') || raw.includes('स्क्रीनशॉट') || raw.includes('capture screen')) {
      return { intent: 'SYSTEM_ACTION', action: 'CAPTURE_SCREEN', targetAgent: 'SYSTEM', confidence: 0.95, params: {} };
    }
    if (raw.match(/volume\s+(up|down|mute|unmute|\d+)/) || raw.includes('आवाज')) {
      const volMatch = raw.match(/(\d+)/);
      const level = volMatch ? parseInt(volMatch[0]) : null;
      return { 
        intent: 'SYSTEM_ACTION', 
        action: 'VOLUME_CONTROL', 
        targetAgent: 'SYSTEM', 
        confidence: 0.95, 
        params: { level, direction: raw.includes('up') ? 'UP' : raw.includes('down') ? 'DOWN' : 'TOGGLE' } 
      };
    }

    // Application launching
    if (raw.startsWith('open ') || raw.startsWith('launch ') || raw.startsWith('खोलो') || raw.endsWith('खोलो')) {
      const appName = raw.replace(/(open|launch|खोलो)/g, '').trim();
      const validApps = ['notepad', 'calc', 'calculator', 'mspaint', 'paint', 'explorer', 'cmd', 'taskmgr'];
      const matchedApp = validApps.find(a => appName.includes(a));
      if (matchedApp) {
        return { 
          intent: 'SYSTEM_ACTION', 
          action: 'RUN_APP', 
          targetAgent: 'SYSTEM', 
          confidence: 0.95, 
          params: { app: matchedApp } 
        };
      }
    }

    // Memory & Ingestion Actions
    if (raw.startsWith('remember that ') || raw.startsWith('remember ')) {
      const prefix = raw.startsWith('remember that ') ? 'remember that ' : 'remember ';
      const content = text.substring(prefix.length).trim();
      return { 
        intent: 'MEMORY_ACTION', 
        action: 'REMEMBER', 
        targetAgent: 'MEMORY', 
        confidence: 0.95, 
        params: { content, collection: 'notes' } 
      };
    }
    if (raw.startsWith('learn this pdf ') || raw.startsWith('learn document ') || raw.startsWith('learn ')) {
      let prefixLen = 0;
      if (raw.startsWith('learn this pdf ')) prefixLen = 'learn this pdf '.length;
      else if (raw.startsWith('learn document ')) prefixLen = 'learn document '.length;
      else prefixLen = 'learn '.length;
      const filePath = text.substring(prefixLen).trim();
      return { 
        intent: 'MEMORY_ACTION', 
        action: 'LEARN_DOCUMENT', 
        targetAgent: 'MEMORY', 
        confidence: 0.95, 
        params: { filePath } 
      };
    }
    if (raw.startsWith('search my notes about ') || raw.startsWith('search notes for ') || raw.startsWith('search notes ')) {
      let prefixLen = 0;
      if (raw.startsWith('search my notes about ')) prefixLen = 'search my notes about '.length;
      else if (raw.startsWith('search notes for ')) prefixLen = 'search notes for '.length;
      else prefixLen = 'search notes '.length;
      const queryText = text.substring(prefixLen).trim();
      return { 
        intent: 'MEMORY_ACTION', 
        action: 'SEARCH', 
        targetAgent: 'MEMORY', 
        confidence: 0.95, 
        params: { queryText, collection: 'notes' } 
      };
    }

    if (raw === 'list memories' || raw === 'show memories' || raw.includes('list facts') || raw === 'recall facts') {
      return {
        intent: 'MEMORY_ACTION',
        action: 'LIST',
        targetAgent: 'MEMORY',
        confidence: 1.0,
        params: { collection: 'notes' }
      };
    }

    if (raw.startsWith('delete memory id ') || raw.startsWith('delete memory ')) {
      const prefixLen = raw.startsWith('delete memory id ') ? 'delete memory id '.length : 'delete memory '.length;
      const docId = text.substring(prefixLen).trim();
      return {
        intent: 'MEMORY_ACTION',
        action: 'DELETE',
        targetAgent: 'MEMORY',
        confidence: 1.0,
        params: { id: docId, collection: 'notes' }
      };
    }

    // Vision actions
    if (raw.includes('what is on my screen') || raw.includes('explain screen') || raw.includes('स्क्रीन पर क्या है')) {
      return { intent: 'VISION_ACTION', action: 'EXPLAIN_SCREEN', targetAgent: 'VISION', confidence: 0.95, params: {} };
    }

    // Default to general conversation/coordinator agent (Planner/LLM)
    return { intent: 'CONVERSATION', confidence: 0.5 };
  }
}

const router = new JarvisRouter();
export default router;
