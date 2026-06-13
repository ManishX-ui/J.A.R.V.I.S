import BaseAgent from './base_agent.js';
import eventBus from '../core/event_bus.js';

class PlannerAgent extends BaseAgent {
  constructor() {
    super('PLANNER');
  }

  async execute(action, params, rawText) {
    console.log(`[PLANNER] Decomposing request: "${rawText}"`);
    
    eventBus.publish('diagnostic_log', {
      type: 'CORE',
      msg: `Planning task decomposition for: "${rawText}"`
    });

    try {
      const steps = await this.generatePlanViaLLM(rawText);
      
      eventBus.publish('diagnostic_log', {
        type: 'CORE',
        msg: `Plan generated successfully: ${steps.length} steps identified.`
      });

      return { steps };
    } catch (err) {
      console.warn('[PLANNER] LLM planning failed, using regex rule fallback.', err.message);
      
      // Heuristic fallback
      const steps = this.generateFallbackPlan(rawText);
      
      eventBus.publish('diagnostic_log', {
        type: 'WARN',
        msg: `Using fallback rule planner: ${steps.length} steps generated.`
      });

      return { steps };
    }
  }

  async generatePlanViaLLM(text) {
    const groqKey = process.env.GROQ_API_KEY || '';
    const geminiKey = process.env.GEMINI_API_KEY || '';
    const provider = process.env.ACTIVE_PROVIDER || (geminiKey ? 'gemini' : 'groq');

    const systemPrompt = `You are the JARVIS virtual assistant task planner.
Decompose the user's complex request into a sequential JSON array of steps for specialized agents.

Available Agents & Actions:
1. Agent: "RESEARCH"
   - Action: "WEB_SEARCH" (params: { "query": "search term" })
   - Action: "SCRAPE_URL" (params: { "url": "http..." })
2. Agent: "BROWSER"
   - Action: "NAVIGATE" (params: { "url": "http..." })
   - Action: "CLICK" (params: { "selector": "css selector" })
   - Action: "TYPE" (params: { "selector": "css selector", "text": "text to type" })
   - Action: "SCREENSHOT" (params: { "fileName": "name.png" })
3. Agent: "CODING"
   - Action: "CREATE_FILE" (params: { "filePath": "relative path or name", "content": "exact content or '$PREVIOUS_RESULT' to inject output from previous step" })
   - Action: "READ_FILE" (params: { "filePath": "path" })
   - Action: "APPEND_FILE" (params: { "filePath": "path", "content": "text" })
4. Agent: "SYSTEM"
   - Action: "RUN_APP" (params: { "app": "calc|notepad|mspaint" })
   - Action: "VOLUME_CONTROL" (params: { "level": 0-100, "direction": "UP|DOWN|TOGGLE" })
   - Action: "BRIGHTNESS_CONTROL" (params: { "level": 0-100 })
   - Action: "MUTE_CONTROL" (params: { "mute": true|false })
   - Action: "LOCK_SCREEN"
   - Action: "CAPTURE_SCREEN"
5. Agent: "MEMORY"
   - Action: "REMEMBER" (params: { "content": "fact to remember" })
   - Action: "SEARCH" (params: { "queryText": "search phrase" })
6. Agent: "VISION"
   - Action: "EXPLAIN_SCREEN"
   - Action: "CAPTURE_WEBCAM"

Instructions:
- Return ONLY a raw JSON array of objects representing the steps. Do NOT include markdown code blocks (\`\`\`json) or conversational text.
- If the request is a simple conversational statement or question that does not require any tool execution, return an empty array: []
- If one step depends on the output of a previous step, set "content" or "query" to "$PREVIOUS_RESULT".

Example Input: "search the web for Vite config and write a summary.txt file"
Example Output:
[
  { "id": 1, "agent": "RESEARCH", "action": "WEB_SEARCH", "params": { "query": "Vite configuration" } },
  { "id": 2, "agent": "CODING", "action": "CREATE_FILE", "params": { "filePath": "summary.txt", "content": "$PREVIOUS_RESULT" } }
]`;

    let planStr = '';

    if (provider === 'gemini') {
      if (!geminiKey) throw new Error('Gemini API Key missing');
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      });
      if (!response.ok) throw new Error(`Gemini API error ${response.status}`);
      const result = await response.json();
      planStr = result.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
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
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt + '\nEnsure output is valid JSON in a "steps" array field.' },
            { role: 'user', content: text }
          ],
          temperature: 0.1
        })
      });
      if (!response.ok) throw new Error(`Groq API error ${response.status}`);
      const result = await response.json();
      const rawJson = JSON.parse(result.choices?.[0]?.message?.content || '{}');
      planStr = JSON.stringify(rawJson.steps || rawJson || '[]');
    }

    // Parse the output string and validate it's an array
    console.log('[PLANNER] Raw Plan response:', planStr);
    const parsed = JSON.parse(planStr.trim());
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed && Array.isArray(parsed.steps)) {
      return parsed.steps;
    }
    return [];
  }

  generateFallbackPlan(text) {
    const raw = text.toLowerCase();
    const steps = [];

    // Web search + file write fallback
    // e.g. "search the web for X and write it to Y"
    if ((raw.includes('search') || raw.includes('find')) && raw.includes('file')) {
      const fileMatch = raw.match(/file\s+([a-zA-Z0-9_\-\.]+)/) || raw.match(/to\s+([a-zA-Z0-9_\-\.]+)/);
      const filePath = fileMatch ? fileMatch[1] : 'output.txt';
      
      let query = 'information';
      if (raw.includes('for')) {
        query = text.substring(raw.indexOf('for') + 3).split('and')[0].trim();
      }

      steps.push({
        id: 1,
        agent: 'RESEARCH',
        action: 'WEB_SEARCH',
        params: { query }
      });
      steps.push({
        id: 2,
        agent: 'CODING',
        action: 'CREATE_FILE',
        params: { filePath, content: '$PREVIOUS_RESULT' }
      });
      return steps;
    }

    // Default conversational/memory fallback
    if (raw.startsWith('remember')) {
      steps.push({
        id: 1,
        agent: 'MEMORY',
        action: 'REMEMBER',
        params: { content: text.replace(/remember/i, '').trim() }
      });
    } else if (raw.startsWith('search notes')) {
      steps.push({
        id: 1,
        agent: 'MEMORY',
        action: 'SEARCH',
        params: { queryText: text.replace(/search notes (about|for)?/i, '').trim() }
      });
    } else if (raw.includes('screen')) {
      steps.push({
        id: 1,
        agent: 'VISION',
        action: 'EXPLAIN_SCREEN',
        params: {}
      });
    }

    return steps;
  }
}

const planner = new PlannerAgent();
export default planner;
