import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import eventBus from './core/event_bus.js'
import orchestrator from './core/orchestrator.js'
import router from './core/router.js'

// Import all agents to register their Event Bus listeners
import './agents/planner_agent.js'
import './agents/coordinator_agent.js'
import './agents/system_agent.js'
import './agents/memory_agent.js'
import './agents/research_agent.js'
import './agents/coding_agent.js'
import './agents/browser_agent.js'
import './agents/vision_agent.js'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'JARVIS backend is online' })
})

// HTTP Route mapping to original LLM brain directly for quick compatibility
app.post('/api/chat', async (req, res) => {
  const { messages, provider } = req.body
  const text = messages[messages.length - 1]?.content || ''
  
  // Publish text command to event bus to orchestrate normally
  eventBus.publish('text_command', { text });

  // Wait for the speak_response or agent_result event to return the response
  const responsePromise = new Promise((resolve) => {
    const speakUnsubscribe = eventBus.subscribe('speak_response', (speakData) => {
      speakUnsubscribe();
      resultUnsubscribe();
      resolve(speakData);
    });

    const resultUnsubscribe = eventBus.subscribe('agent_result', (resultData) => {
      if (resultData.agent === 'SYSTEM' || resultData.agent === 'PLANNER') {
        speakUnsubscribe();
        resultUnsubscribe();
        resolve({ text: resultData.error || `Command executed: ${JSON.stringify(resultData.result || '')}`, provider: 'system' });
      }
    });

    // Timeout safety
    setTimeout(() => {
      speakUnsubscribe();
      resultUnsubscribe();
      resolve({ text: 'No response received from agent pipeline.', provider: 'timeout' });
    }, 15000);
  });

  const response = await responsePromise;
  res.json({
    text: response.text,
    provider: response.provider
  })
})

const server = createServer(app)
const wss = new WebSocketServer({ server })

// Broadcast utility to push payloads to all active WebSocket clients (UI, voice daemon, etc.)
function broadcast(event, data = {}) {
  const payload = JSON.stringify({ event, data });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Pipe Event Bus events to WebSocket Clients
eventBus.subscribe('state_changed', (data) => broadcast('state_changed', data));
eventBus.subscribe('diagnostic_log', (data) => broadcast('diagnostic_log', data));
eventBus.subscribe('agent_activity', (data) => broadcast('agent_activity', data));
eventBus.subscribe('agent_result', (data) => broadcast('agent_result', data));
eventBus.subscribe('speak_response', (data) => broadcast('speak_response', data));
eventBus.subscribe('approval_required', (data) => broadcast('approval_required', data));
eventBus.subscribe('plan_generated', (data) => broadcast('plan_generated', data));
eventBus.subscribe('step_status_changed', (data) => broadcast('step_status_changed', data));

// WebSocket connection routing
wss.on('connection', (ws) => {
  console.log('[WEBSOCKET] Client connected.');
  
  // Send initial state
  ws.send(JSON.stringify({
    event: 'state_changed',
    data: { newState: orchestrator.currentState }
  }));

  ws.on('message', (message) => {
    try {
      const { event, data } = JSON.parse(message);
      console.log(`[WEBSOCKET] Received: ${event}`, data);

      switch (event) {
        case 'voice_transcript':
          eventBus.publish('voice_transcript', { text: data.text, lang: data.lang || 'en-US' });
          break;
        case 'text_command':
          eventBus.publish('text_command', { text: data.text });
          break;
        case 'permission_response':
          // Publish response back to the matching pending channel in permissions.js
          if (data.replyChannel) {
            eventBus.publish(data.replyChannel, { approved: data.approved });
          }
          break;
        case 'speech_start':
          eventBus.publish('speech_start');
          break;
        case 'speech_end':
          eventBus.publish('speech_end');
          break;
        default:
          console.warn(`[WEBSOCKET] Unknown event: ${event}`);
      }
    } catch (err) {
      console.error('[WEBSOCKET] Error parsing message:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('[WEBSOCKET] Client disconnected.');
  });
});

server.listen(PORT, () => {
  console.log(`JARVIS API server running on port ${PORT}`)
  eventBus.publish('diagnostic_log', { type: 'INFO', msg: 'Neural API gateway listening.' });
})
