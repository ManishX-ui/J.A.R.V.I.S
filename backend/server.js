import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'JARVIS backend is online' })
})

app.post('/api/chat', async (req, res) => {
  const { messages, apiKey } = req.body

  if (!apiKey) {
    return res.status(400).json({ error: 'Groq API Key is required' })
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
        messages: messages,
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
    res.json(data)
  } catch (error) {
    console.error('Error proxying to Groq API:', error)
    res.status(500).json({ error: 'Internal server error during Groq API request' })
  }
})

app.listen(PORT, () => {
  console.log(`JARVIS backend server running on port ${PORT}`)
})
