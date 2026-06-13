import eventBus from '../core/event_bus.js';
import orchestrator from '../core/orchestrator.js';
import memoryAgent from './memory_agent.js';
import plannerAgent from './planner_agent.js';

class CoordinatorAgent {
  constructor() {
    this.name = 'COORDINATOR';
    this.initialize();
  }

  initialize() {
    console.log(`[AGENT] Initializing: ${this.name}`);
    
    // Listen for incoming complex prompt tasks
    eventBus.subscribe('agent_coordinator_execute', async (data) => {
      const { text, source, lang } = data;
      console.log(`[COORDINATOR] Processing complex command request: "${text}"`);
      eventBus.publish('agent_activity', { agent: this.name, status: 'busy', action: 'planning' });

      try {
        eventBus.publish('diagnostic_log', { type: 'CORE', msg: 'Decomposing request into action plan...' });
        
        // 1. Generate plan using Planner Agent
        const planResult = await plannerAgent.execute('PLAN', {}, text);
        const steps = planResult.steps || [];

        if (steps.length === 0) {
          // If no steps generated, handle as simple conversation
          eventBus.publish('diagnostic_log', { type: 'CORE', msg: 'No tool execution needed. Processing as conversational query.' });
          const responseData = await this.delegateToBrain(text);
          eventBus.publish('agent_result', { agent: this.name, success: true, result: responseData });
          eventBus.publish('speak_response', { text: responseData.text, provider: responseData.provider });
        } else {
          // Send generated plan to UI to display step timeline cards
          eventBus.publish('plan_generated', { steps });
          eventBus.publish('diagnostic_log', { type: 'CORE', msg: `Executing plan with ${steps.length} steps.` });

          let previousResult = '';
          const stepResults = [];

          for (const step of steps) {
            // Update UI step state to in_progress
            eventBus.publish('step_status_changed', { stepId: step.id, status: 'in_progress' });
            
            // Resolve previous result dependencies
            const params = this.resolveStepDependencies(step.params || {}, previousResult);
            
            eventBus.publish('diagnostic_log', { 
              type: 'CORE', 
              msg: `Step ${step.id} [${step.agent}]: Executing "${step.action}"...` 
            });

            try {
              // Execute step via Event Bus communication
              const result = await this.executeAgentStep(step.agent, step.action, params, text);
              
              previousResult = typeof result === 'string' ? result : JSON.stringify(result);
              stepResults.push({ stepId: step.id, success: true, result });
              
              eventBus.publish('step_status_changed', { stepId: step.id, status: 'completed', result });
            } catch (stepErr) {
              console.error(`[COORDINATOR] Step ${step.id} failed:`, stepErr.message);
              eventBus.publish('step_status_changed', { stepId: step.id, status: 'failed', error: stepErr.message });
              eventBus.publish('diagnostic_log', { type: 'WARN', msg: `Step ${step.id} failed: ${stepErr.message}` });
              throw stepErr;
            }
          }

          // Formulate final response combining step results
          eventBus.publish('diagnostic_log', { type: 'CORE', msg: 'Formulating final summary of plan execution...' });
          
          const summaryPrompt = `The user asked: "${text}".
We successfully executed an automated plan with the following steps and results:
${stepResults.map((sr, idx) => `Step ${idx + 1} (${steps[idx].agent}.${steps[idx].action}): ${typeof sr.result === 'string' ? sr.result.slice(0, 150) : JSON.stringify(sr.result).slice(0, 150)}`).join('\n')}

Briefly summarize the results for the user and tell them what you did. Keep it natural and extremely concise (maximum 2 sentences).`;

          const responseData = await this.delegateToBrain(summaryPrompt);
          eventBus.publish('agent_result', { agent: this.name, success: true, result: responseData });
          eventBus.publish('speak_response', { text: responseData.text, provider: responseData.provider });
        }
      } catch (err) {
        console.error('[COORDINATOR] Processing failed:', err.message);
        eventBus.publish('agent_result', { agent: this.name, success: false, error: err.message });
        eventBus.publish('speak_response', { text: `Execution failed. ${err.message}`, provider: 'system' });
      } finally {
        eventBus.publish('agent_activity', { agent: this.name, status: 'idle' });
      }
    });
  }

  resolveStepDependencies(params, previousResult) {
    const resolved = { ...params };
    for (const key in resolved) {
      if (resolved[key] === '$PREVIOUS_RESULT') {
        resolved[key] = previousResult;
      } else if (typeof resolved[key] === 'string' && resolved[key].includes('$PREVIOUS_RESULT')) {
        resolved[key] = resolved[key].replace('$PREVIOUS_RESULT', previousResult);
      }
    }
    return resolved;
  }

  async executeAgentStep(agentName, action, params, originalText) {
    return new Promise((resolve, reject) => {
      // Create execution request
      const unsubscribe = eventBus.subscribe('agent_result', (data) => {
        if (data.agent.toUpperCase() === agentName.toUpperCase()) {
          unsubscribe();
          if (data.success) {
            resolve(data.result);
          } else {
            reject(new Error(data.error || 'Execution failed'));
          }
        }
      });

      eventBus.publish('agent_execute', {
        agent: agentName,
        action,
        params,
        originalText
      });

      // 30 seconds timeout limit
      setTimeout(() => {
        unsubscribe();
        reject(new Error(`Agent ${agentName} execution timed out`));
      }, 30000);
    });
  }

  async delegateToBrain(text) {
    const groqKey = process.env.GROQ_API_KEY || '';
    const geminiKey = process.env.GEMINI_API_KEY || '';
    const provider = process.env.ACTIVE_PROVIDER || (geminiKey ? 'gemini' : 'groq');

    let contextStr = '';
    try {
      const notesContext = await memoryAgent.execute('SEARCH', { collection: 'notes', queryText: text, limit: 2 }, text).catch(() => []);
      const docsContext = await memoryAgent.execute('SEARCH', { collection: 'documents', queryText: text, limit: 2 }, text).catch(() => []);
      
      const allContext = [...(notesContext || []), ...(docsContext || [])];
      const validContext = allContext.filter(c => c.distance < 1.35);
      
      if (validContext.length > 0) {
        contextStr = "\nContext retrieved from local memory:\n" + 
          validContext.map(c => `- ${c.content}`).join('\n') + 
          "\nUse this local context to inform your answer. Keep it natural and extremely concise.";
        console.log('[COORDINATOR] Injected RAG Context:', contextStr);
        eventBus.publish('diagnostic_log', { type: 'CORE', msg: `Injected ${validContext.length} semantic context links into prompt.` });
      }
    } catch (e) {
      console.warn('[COORDINATOR] RAG semantic memory lookup failed:', e.message);
    }

    const messages = [{ role: 'user', content: text }];

    const cloudRequestFn = async () => {
      if (provider === 'gemini') {
        if (!geminiKey) throw new Error('Gemini API Key missing');
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text }] }],
            systemInstruction: {
              parts: [{ text: 'You are JARVIS, a highly advanced virtual assistant. Respond in short, direct sentences (max 2 sentences).' + contextStr }]
            }
          })
        });
        if (!response.ok) throw new Error(`Gemini API error ${response.status}`);
        const result = await response.json();
        return { text: result.candidates?.[0]?.content?.parts?.[0]?.text || '', provider: 'gemini' };
      } else {
        if (!groqKey) throw new Error('Groq API Key missing');
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: 'You are JARVIS. Respond in extremely concise sentences (at most 2 short sentences).' + contextStr },
              { role: 'user', content: text }
            ],
            temperature: 0.7,
            max_tokens: 150
          })
        });
        if (!response.ok) throw new Error(`Groq API error ${response.status}`);
        const result = await response.json();
        return { text: result.choices?.[0]?.message?.content || '', provider: 'groq' };
      }
    };

    return orchestrator.generateResponse(text, messages, cloudRequestFn);
  }
}

const coordinator = new CoordinatorAgent();
export default coordinator;
export { coordinator };
