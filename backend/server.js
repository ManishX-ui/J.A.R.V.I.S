import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { exec } from 'child_process'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'JARVIS backend is online' })
})

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    return res.status(400).json({ error: 'Groq API Key is not configured on the backend server.' })
  }

  // Ensure system prompt contains command tags instructions
  const updatedMessages = [...messages]
  const systemPromptIndex = updatedMessages.findIndex(m => m.role === 'system')

  const systemInstructions = `You are JARVIS, an extremely intelligent and advanced AI assistant running on the user's Windows machine.
Respond in the language the user speaks (English or Hindi).
Your response must be very concise, conversational, and direct (at most 1 or 2 short sentences).

You have direct access to the user's system to run local applications, open websites, and send WhatsApp messages.
If the user commands you to do one of these actions, you must output a special command tag at the end of your response:

1. To run a local Windows application:
   Tag: [CMD: RUN_APP app_name]
   Valid app_names: 'notepad', 'calc' (for Calculator), 'mspaint' (for Paint), 'explorer' (for File Explorer), 'cmd' (for Command Prompt), 'taskmgr' (for Task Manager).
   Example: "Opening Notepad. [CMD: RUN_APP notepad]"

2. To open a website:
   Tag: [CMD: OPEN_WEB url]
   Example: "Opening YouTube. [CMD: OPEN_WEB https://youtube.com]"

3. To send a WhatsApp message:
   Tag: [CMD: WHATSAPP phone_number "message text"]
   Example: "Opening WhatsApp to send your message. [CMD: WHATSAPP +919999999999 \"Hello, how are you?\"]"
   Note: If the user asks to send a WhatsApp message but doesn't specify a phone number, politely ask them for the phone number first.

Do not output any command tags unless explicitly requested by the user's command.`

  if (systemPromptIndex !== -1) {
    updatedMessages[systemPromptIndex] = {
      role: 'system',
      content: systemInstructions
    }
  } else {
    updatedMessages.unshift({
      role: 'system',
      content: systemInstructions
    })
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: updatedMessages,
        temperature: 0.7,
        max_tokens: 150
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return res.status(response.status).json({ 
        error: errorData.error?.message || `Groq API responded with status ${response.status}` 
      })
    }

    const data = await response.json()
    let text = data.choices[0]?.message?.content || ''
    let clientCommand = null

    // Regex to match [CMD: TYPE ARG1 ARG2 ...]
    const cmdRegex = /\[CMD:\s*([A-Z_]+)\s*([^\]]+)?\]/
    const match = text.match(cmdRegex)

    if (match) {
      const type = match[1]
      const argsStr = match[2] ? match[2].trim() : ""
      
      // Clean up the text by removing the command tag
      text = text.replace(cmdRegex, "").trim()

      if (type === 'RUN_APP') {
        const appName = argsStr.toLowerCase()
        const allowedApps = ['notepad', 'calc', 'mspaint', 'explorer', 'cmd', 'taskmgr']
        if (allowedApps.includes(appName)) {
          console.log(`Executing system app: ${appName}`)
          exec(`start ${appName}`, (err) => {
            if (err) console.error(`Failed to launch app ${appName}:`, err)
          })
        }
      } else if (type === 'OPEN_WEB') {
        clientCommand = { type: 'OPEN_WEB', url: argsStr }
      } else if (type === 'WHATSAPP') {
        // WHATSAPP phone "message text"
        const waRegex = /^(\+?\d+)\s+"([^"]+)"/
        const waMatch = argsStr.match(waRegex)
        if (waMatch) {
          clientCommand = {
            type: 'WHATSAPP',
            phone: waMatch[1],
            message: waMatch[2]
          }
        } else {
          clientCommand = { type: 'WHATSAPP', raw: argsStr }
        }
      }
    }

    res.json({
      text: text,
      command: clientCommand
    })
  } catch (error) {
    console.error('Error proxying to Groq API:', error)
    res.status(500).json({ error: 'Internal server error during Groq API request' })
  }
})

app.listen(PORT, () => {
  console.log(`JARVIS backend server running on port ${PORT}`)
})
