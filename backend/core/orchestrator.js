import eventBus from './event_bus.js';

export const States = {
  STANDBY: 'STANDBY',
  ACTIVE: 'ACTIVE',
  THINKING: 'THINKING',
  SPEAKING: 'SPEAKING',
};

class JarvisOrchestrator {
  constructor() {
    this.currentState = States.STANDBY;
    this.initializeListeners();
  }

  setState(newState) {
    if (this.currentState === newState) return;
    const oldState = this.currentState;
    this.currentState = newState;
    console.log(`[ORCHESTRATOR] Transition: ${oldState} -> ${newState}`);
    eventBus.publish('state_changed', { oldState, newState });
  }

  initializeListeners() {
    // Listen for incoming voice transcriptions from the Python voice daemon
    eventBus.subscribe('voice_transcript', async (data) => {
      const { text, lang } = data;
      console.log(`[ORCHESTRATOR] Received voice input: "${text}" [${lang}]`);
      this.setState(States.ACTIVE);
      eventBus.publish('process_command', { source: 'voice', text, lang });
    });

    // Listen for text-based commands from the frontend UI
    eventBus.subscribe('text_command', async (data) => {
      const { text } = data;
      console.log(`[ORCHESTRATOR] Received text command: "${text}"`);
      this.setState(States.ACTIVE);
      eventBus.publish('process_command', { source: 'text', text });
    });

    // Handle when speaking starts or ends
    eventBus.subscribe('speech_start', () => {
      this.setState(States.SPEAKING);
    });

    eventBus.subscribe('speech_end', () => {
      this.setState(States.ACTIVE);
    });
  }

  // Fallback handler: tries cloud LLM, drops down to local Ollama if offline/error
  async generateResponse(prompt, messages, cloudRequestFn) {
    this.setState(States.THINKING);
    try {
      // Attempt cloud request
      const response = await cloudRequestFn();
      this.setState(States.ACTIVE);
      return response;
    } catch (cloudErr) {
      console.warn('[ORCHESTRATOR] Cloud LLM failed. Attempting offline Ollama fallback...', cloudErr.message);
      eventBus.publish('diagnostic_log', { type: 'WARN', msg: 'Cloud AI offline. Activating local fallback...' });
      
      try {
        // Fallback to local Ollama endpoint (typically port 11434)
        const localResponse = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3', // default fallback model
            messages: [
              { role: 'system', content: 'You are JARVIS, running locally on user\'s PC. Be very concise (1-2 sentences).' },
              ...messages.map(m => ({ role: m.role, content: m.content }))
            ],
            stream: false
          })
        });

        if (!localResponse.ok) {
          throw new Error(`Ollama returned status ${localResponse.status}`);
        }

        const data = await localResponse.json();
        const text = data.message?.content || '';
        this.setState(States.ACTIVE);
        return { text, provider: 'ollama' };
      } catch (localErr) {
        console.error('[ORCHESTRATOR] Local fallback also failed:', localErr.message);
        this.setState(States.ACTIVE);
        return {
          text: 'System offline. Both cloud and local neural networks are unreachable.',
          provider: 'offline_fail'
        };
      }
    }
  }
}

const orchestrator = new JarvisOrchestrator();
export default orchestrator;
