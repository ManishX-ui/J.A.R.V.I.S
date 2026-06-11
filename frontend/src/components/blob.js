import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react"

const getColorTheme = (colorName) => {
  switch (colorName) {
    case 'purple':
      return {
        core: '#d946ef',
        node: 'rgba(244, 114, 182, 0.7)',
        radial: 'rgba(217, 70, 239, 0.14)',
        mesh: 'rgba(168, 85, 247, 0.08)',
        ring: 'rgba(168, 85, 247, 0.16)',
        web: 'rgba(139, 92, 246, 0.28)',
        glow: '#a855f7'
      }
    case 'green':
      return {
        core: '#22c55e',
        node: 'rgba(74, 222, 128, 0.7)',
        radial: 'rgba(34, 197, 94, 0.14)',
        mesh: 'rgba(34, 197, 94, 0.08)',
        ring: 'rgba(34, 197, 94, 0.16)',
        web: 'rgba(234, 179, 8, 0.28)',
        glow: '#22c55e'
      }
    case 'red':
      return {
        core: '#ef4444',
        node: 'rgba(248, 113, 113, 0.7)',
        radial: 'rgba(239, 68, 68, 0.14)',
        mesh: 'rgba(239, 68, 68, 0.08)',
        ring: 'rgba(239, 68, 68, 0.16)',
        web: 'rgba(249, 115, 22, 0.28)',
        glow: '#ef4444'
      }
    case 'cyan':
    default:
      // A gorgeous deep indigo/blue/violet theme to match the user's reference image
      return {
        core: '#7a82fc',
        node: 'rgba(165, 180, 252, 0.85)',
        radial: 'rgba(129, 140, 248, 0.2)',
        mesh: 'rgba(99, 102, 241, 0.08)',
        ring: 'rgba(99, 102, 241, 0.22)',
        web: 'rgba(139, 92, 246, 0.18)',
        glow: '#818cf8'
      }
  }
}

const JarvisBlob = forwardRef(({ color = 'cyan', intensity = 1.5, size = 105, lang = 'en-US', autoListen = true, onNewMessage }, ref) => {
  const [active, setActive] = useState(false)
  const [listening, setListening] = useState(false)
  const [isAwake, setIsAwake] = useState(true) // Starts awake on activate
  const [currentSpeech, setCurrentSpeech] = useState("")
  const [jarvisResponse, setJarvisResponse] = useState("")
  const [micError, setMicError] = useState("")
  
  const canvasRef = useRef(null)
  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const streamRef = useRef(null)
  
  // Refs for tracking states across async event listeners
  const isAwakeRef = useRef(true)
  const isSpeakingRef = useRef(false)
  const inactivityTimeoutRef = useRef(null)
  const activeUtterancesRef = useRef([])
  
  useEffect(() => {
    isAwakeRef.current = isAwake
  }, [isAwake])

  // Shared refs for settings to update canvas render loop instantly at 60 FPS
  const colorRef = useRef(color)
  const intensityRef = useRef(intensity)
  const sizeRef = useRef(size)
  const langRef = useRef(lang)
  
  const volumeRef = useRef(0)
  const animationFrameIdRef = useRef(null)

  // Sync settings props to refs
  useEffect(() => {
    colorRef.current = color
    intensityRef.current = intensity
    sizeRef.current = size
    langRef.current = lang
  }, [color, intensity, size, lang])

  const autoListenRef = useRef(autoListen)
  useEffect(() => {
    autoListenRef.current = autoListen
    if (autoListen) {
      setIsAwake(true)
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
        inactivityTimeoutRef.current = null
      }
    }
  }, [autoListen])

  useImperativeHandle(ref, () => ({
    sendTextMessage: async (text) => {
      // Auto-activate system if not activated
      if (!active) {
        await handleActivate()
      }
      
      if (onNewMessage) onNewMessage('user', text)
      setCurrentSpeech(text)
      setIsAwake(true)
      resetInactivityTimer()
      await takeCommand(text)
    }
  }))

  // WAKE WORDS LIST
  const wakeWords = [
    "hello jarvis", "hi jarvis", "hey jarvis", "ok jarvis", "jarvis",
    "हेलो जार्विस", "नमस्ते जार्विस", "हाय जार्विस", "जार्विस"
  ]

  // RESET INACTIVITY TIMER
  const resetInactivityTimer = () => {
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current)
    }
    // Only go to standby after 8 seconds of silence if autoListen is false
    if (!autoListenRef.current) {
      inactivityTimeoutRef.current = setTimeout(() => {
        setIsAwake(false)
        inactivityTimeoutRef.current = null
      }, 8000)
    } else {
      setIsAwake(true)
    }
  }

  // HANDLE SPEECH THROUGH STATE MACHINE
  const handleIncomingSpeech = (message) => {
    const isHindi = langRef.current.startsWith('hi')

    if (onNewMessage) onNewMessage('user', message)

    resetInactivityTimer()

    const foundWake = wakeWords.find(word => message.toLowerCase().includes(word))

    if (autoListenRef.current || isAwakeRef.current || foundWake) {
      setIsAwake(true)
      if (foundWake) {
        const index = message.toLowerCase().indexOf(foundWake)
        const command = message.substring(index + foundWake.length).trim()
        if (command) {
          setJarvisResponse("")
          setCurrentSpeech(message)
          takeCommand(command)
        } else {
          setJarvisResponse("")
          setCurrentSpeech(message)
          respond(isHindi ? "जी बोलिए, मैं सुन रहा हूँ।" : "Yes, I am listening.")
        }
      } else {
        setJarvisResponse("")
        setCurrentSpeech(message)
        takeCommand(message)
      }
    } else {
      console.log("Ignored speech (no wake word found and standby active):", message)
    }
  }

  // SPEAK FUNCTION
  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text)
    const activeLang = langRef.current
    utterance.lang = activeLang
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    
    if (window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices()
      const voice = voices.find(v => v.lang.toLowerCase().startsWith(activeLang.split('-')[0].toLowerCase()))
      if (voice) {
        utterance.voice = voice
      }
    }

    // Keep active reference to prevent garbage collection in Chrome
    activeUtterancesRef.current.push(utterance)
    
    let safetyTimeout = null
    const textLength = text.length
    // Average speaking rate: ~12 characters per second. Set a generous safety buffer.
    const estimatedDuration = (textLength / 12) * 1000 + 4000 

    const cleanupSpeech = () => {
      if (safetyTimeout) {
        clearTimeout(safetyTimeout)
        safetyTimeout = null
      }
      isSpeakingRef.current = false
      activeUtterancesRef.current = activeUtterancesRef.current.filter(u => u !== utterance)
      
      setTimeout(() => {
        if (active && !isSpeakingRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start()
          } catch (e) {
            console.log("Error resuming recognition:", e)
          }
        }
      }, 150)
    }

    utterance.onstart = () => {
      isSpeakingRef.current = true
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
          console.log("Error stopping recognition on speech start:", e)
        }
      }
      // Safety fallback: resume mic if browser fails to trigger onend
      safetyTimeout = setTimeout(() => {
        if (isSpeakingRef.current) {
          console.warn("Safety fallback triggered: SpeechSynthesis onend failed to fire.")
          cleanupSpeech()
        }
      }, estimatedDuration)
    }

    utterance.onend = () => {
      cleanupSpeech()
    }

    utterance.onerror = () => {
      cleanupSpeech()
    }
    
    speechSynthesis.speak(utterance)
  }

  // HELPER TO RESPOND (SPEAKS + UPDATES TERMINAL)
  const respond = (text) => {
    setJarvisResponse(text)
    speak(text)
    if (onNewMessage) onNewMessage('jarvis', text)
  }

  // COMMANDS
  const takeCommand = async (message) => {
    const activeLang = langRef.current
    const isHindi = activeLang.startsWith('hi')

    // Local commands check
    if (isHindi) {
      if (message.includes("गूगल खोलो") || message.includes("गूगल खोलें") || message.includes("गूगल खोलिए")) {
        respond("गूगल खोल रहा हूँ")
        window.open("https://google.com", "_blank")
        return
      }
      else if (message.includes("यूट्यूब खोलो") || message.includes("यूट्यूब खोलें") || message.includes("यूट्यूब खोलिए")) {
        respond("यूट्यूब खोल रहा हूँ")
        window.open("https://youtube.com", "_blank")
        return
      }
      else if (message.includes("समय") || message.includes("टाइम")) {
        const time = new Date().toLocaleTimeString()
        respond(`अभी का समय है ${time}`)
        return
      }
    } else {
      if (message.includes("open google")) {
        respond("Opening Google")
        window.open("https://google.com", "_blank")
        return
      }
      else if (message.includes("open youtube")) {
        respond("Opening Youtube")
        window.open("https://youtube.com", "_blank")
        return
      }
      else if (message.includes("time")) {
        const time = new Date().toLocaleTimeString()
        respond(`Current time is ${time}`)
        return
      }
    }

    // Call Groq LLM for anything else!
    await callGroqLLM(message)
  }

  const handleClientCommand = (command) => {
    if (command.type === 'OPEN_WEB') {
      console.log("Opening web link:", command.url)
      window.open(command.url, "_blank")
    } else if (command.type === 'WHATSAPP') {
      const phone = command.phone || ""
      const text = command.message || command.raw || ""
      const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`
      console.log("Opening WhatsApp web:", url)
      window.open(url, "_blank")
    }
  }

  // CALL GROQ LLM API VIA BACKEND PROXY (RESOLVES CORS)
  const callGroqLLM = async (prompt) => {
    const activeLang = langRef.current
    const isHindi = activeLang.startsWith('hi')

    // Set initial loading indicator
    setJarvisResponse(isHindi ? "सिस्टम प्रतिक्रिया लोड हो रही है..." : "Synchronizing synaptic response...")

    try {
      const response = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        })
      })

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}))
        throw new Error(errJson.error || `HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const fullText = data.text || ""
      const command = data.command
      
      setJarvisResponse(fullText)
      if (onNewMessage) onNewMessage('jarvis', fullText)

      // Voice synthesis
      if (fullText) {
        speak(fullText)
      }

      // Handle system commands
      if (command) {
        handleClientCommand(command)
      }

    } catch (err) {
      console.error("Groq API error:", err)
      const errorMsg = isHindi
        ? "माफ़ कीजिए, कनेक्टिविटी समस्या के कारण मैं अभी जवाब नहीं दे पा रहा हूँ।"
        : "I apologize, but connection latency is preventing a synaptic response at this moment."
      setJarvisResponse(errorMsg)
      speak(errorMsg)
      if (onNewMessage) onNewMessage('jarvis', errorMsg)
    }
  }

  // ACTIVATE PROTOCOL
  const handleActivate = async () => {
    if (active) return

    // 1. Setup Speech Recognition
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setMicError("Speech Recognition is not supported in this browser. Please use Chrome or Edge.")
      return
    }

    setMicError("")

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = false
      recognition.lang = langRef.current

      recognition.onstart = () => {
        setListening(true)
        setMicError("")
      }

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error)
        if (event.error === 'not-allowed') {
          setMicError("Microphone access blocked. Please allow mic permission in your browser address bar.")
          recognitionRef.current = null
          setListening(false)
        } else if (event.error === 'service-not-allowed') {
          setMicError("Speech recognition service not allowed.")
          recognitionRef.current = null
          setListening(false)
        } else if (event.error === 'network') {
          setMicError("Speech recognition network error. Please check your internet connection.")
        } else if (event.error !== 'no-speech') {
          setMicError(`Speech Recognition Error: ${event.error}`)
        }
      }

      recognition.onend = () => {
        if (recognitionRef.current && !isSpeakingRef.current) {
          try {
            recognitionRef.current.start()
          } catch (e) {
            console.log("Recognition restart skipped:", e)
          }
        }
      }

      recognition.onresult = (event) => {
        const transcript =
          event.results[event.results.length - 1][0].transcript
            .toLowerCase()

        console.log("Voice Command:", transcript)
        handleIncomingSpeech(transcript)
      }

      recognition.start()
      recognitionRef.current = recognition
    } catch (err) {
      console.error("Speech recognition activation failed:", err)
      setMicError(`Speech recognition start failed: ${err.message}`)
    }

    // 2. Setup Mic Input for Visuals
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      })
      streamRef.current = stream

      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      // Audio analysis loop
      const updateVolume = () => {
        if (!audioContextRef.current) return
        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        volumeRef.current = average
        requestAnimationFrame(updateVolume)
      }
      updateVolume()
    } catch (err) {
      console.error("Microphone setup failed:", err)
      setMicError("Microphone hardware access failed. Please ensure your microphone is connected and allowed.")
    }

    setActive(true)
    setIsAwake(true)
    resetInactivityTimer()
    setTimeout(() => {
      const isHindi = langRef.current.startsWith('hi')
      respond(isHindi ? "जार्विस न्यूरल विज़ुअलाइज़र सक्रिय। मैं सुन रहा हूँ।" : "Jarvis neural visualizer loaded. Ready for input.")
    }, 400)
  }

  // 3. Canvas Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    
    // Set internal size
    canvas.width = 400
    canvas.height = 400

    // Initialize neural network particles (resting on a 1.0 relative radius)
    // 145 particles for extreme hair-like fiber density matching reference image
    const particleCount = 145
    const particles = []
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        angle: (i / particleCount) * Math.PI * 2,
        relativeRadius: 1.0 + (Math.random() * 0.08 - 0.04), // slight variance for depth
        speed: (Math.random() * 0.002 + 0.001) * (Math.random() < 0.5 ? 1 : -1),
        size: Math.random() * 1.6 + 1.0
      })
    }

    // High density background floating dust particles
    const dustCount = 70
    const dustParticles = []
    for (let i = 0; i < dustCount; i++) {
      dustParticles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() * 0.24 - 0.12),
        vy: (Math.random() * 0.24 - 0.12),
        size: Math.random() * 1.2 + 0.5
      })
    }

    let time = 0

    const render = () => {
      const width = canvas.width
      const height = canvas.height
      const rawVolume = volumeRef.current
      
      // Calculate responsive volume factor using user intensity settings
      // Dampen volume response if standby to keep blob calm
      const volume = isAwakeRef.current ? (rawVolume * intensityRef.current) : (rawVolume * intensityRef.current * 0.12)
      
      // Add slow breathing oscillation when in standby
      const baseOscillation = isAwakeRef.current ? 0 : Math.sin(time * 0.02) * 6
      const currentSize = sizeRef.current + baseOscillation
      
      time += 1.2

      ctx.clearRect(0, 0, width, height)

      const centerX = width / 2
      const centerY = height / 2
      const theme = getColorTheme(colorRef.current)

      // 1. Draw background floating dust particles with connection lines (constellation effect)
      ctx.fillStyle = `rgba(129, 140, 248, ${0.14 + (volume / 200)})`
      dustParticles.forEach(d => {
        d.x += d.vx * (1 + volume * 0.02)
        d.y += d.vy * (1 + volume * 0.02)

        if (d.x < 0) d.x = width
        if (d.x > width) d.x = 0
        if (d.y < 0) d.y = height
        if (d.y > height) d.y = 0

        ctx.beginPath()
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2)
        ctx.fill()
      })

      // Draw faint constellation lines between close dust particles
      for (let i = 0; i < dustParticles.length; i++) {
        for (let j = i + 1; j < dustParticles.length; j++) {
          const dx = dustParticles[i].x - dustParticles[j].x
          const dy = dustParticles[i].y - dustParticles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 40) {
            ctx.strokeStyle = `rgba(129, 140, 248, ${(1 - dist / 40) * 0.06})`
            ctx.lineWidth = 0.4
            ctx.beginPath()
            ctx.moveTo(dustParticles[i].x, dustParticles[i].y)
            ctx.lineTo(dustParticles[j].x, dustParticles[j].y)
            ctx.stroke()
          }
        }
      }

      // 2. Draw dual-layered neural grid meshes (horizontal and vertical)
      ctx.strokeStyle = theme.mesh
      ctx.lineWidth = 0.4
      
      // Vertical grid lines
      for (let offset = -60; offset <= 60; offset += 20) {
        ctx.beginPath()
        ctx.moveTo(centerX + offset, 0)
        ctx.bezierCurveTo(
          centerX + offset + Math.sin(time * 0.006 + offset) * 40, height * 0.25,
          centerX + offset - Math.sin(time * 0.009 + offset) * 40, height * 0.75,
          centerX + offset, height
        )
        ctx.stroke()
      }
      
      // Horizontal grid lines
      for (let offset = -60; offset <= 60; offset += 20) {
        ctx.beginPath()
        ctx.moveTo(0, centerY + offset)
        ctx.bezierCurveTo(
          width * 0.25, centerY + offset + Math.cos(time * 0.006 + offset) * 40,
          width * 0.75, centerY + offset - Math.cos(time * 0.009 + offset) * 40,
          width, centerY + offset
        )
        ctx.stroke()
      }

      // 3. Draw central glowing core with multiple gradients for deep realism
      const coreRadius = (currentSize * 0.2) + volume * 0.35
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius * 2.5)
      gradient.addColorStop(0, '#ffffff')
      gradient.addColorStop(0.12, theme.core)
      gradient.addColorStop(0.35, theme.radial)
      gradient.addColorStop(1, 'rgba(10, 15, 26, 0)')
      
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, coreRadius * 2.5, 0, Math.PI * 2)
      ctx.fill()

      // 4. Position & draw winding bezier radial fibers (creating the organic hair look)
      const positions = []
      particles.forEach(p => {
        const currentSpeed = p.speed * (1 + volume * 0.06)
        p.angle += currentSpeed

        const wave = Math.sin(p.angle * 6 + time * 0.015) * 6
        const currentRadius = (currentSize * p.relativeRadius) + wave + (volume * 1.05)

        const x = centerX + Math.cos(p.angle) * currentRadius
        const y = centerY + Math.sin(p.angle) * currentRadius
        positions.push({ x, y, size: p.size, angle: p.angle })

        // Draw winding bezier radial fiber
        ctx.strokeStyle = theme.radial
        ctx.lineWidth = 0.2
        ctx.beginPath()
        ctx.moveTo(centerX, centerY)
        const cp1x = centerX + Math.cos(p.angle - 0.25) * (currentRadius * 0.45)
        const cp1y = centerY + Math.sin(p.angle - 0.25) * (currentRadius * 0.45)
        const cp2x = centerX + Math.cos(p.angle + 0.15) * (currentRadius * 0.75)
        const cp2y = centerY + Math.sin(p.angle + 0.15) * (currentRadius * 0.75)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)
        ctx.stroke()
      })

      // 5. Draw node synapse particles (high density glowing dots)
      positions.forEach(pos => {
        ctx.fillStyle = theme.node
        ctx.shadowBlur = 5 + (volume * 0.12)
        ctx.shadowColor = theme.glow
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, pos.size + (volume * 0.008), 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.shadowBlur = 0 // Reset

      // 6. Draw connection neural web lines between neighboring nodes
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = positions[i].x - positions[j].x
          const dy = positions[i].y - positions[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 45) {
            const opacity = (1 - dist / 45) * (0.12 + (volume / 90))
            ctx.strokeStyle = `rgba(129, 140, 248, ${opacity})`
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(positions[i].x, positions[i].y)
            ctx.lineTo(positions[j].x, positions[j].y)
            ctx.stroke()
          }
        }
      }

      // 7. Draw double counter-orbiting dashed dashed guide rings
      ctx.strokeStyle = theme.ring
      ctx.lineWidth = 0.8
      ctx.setLineDash([5, 8])
      ctx.beginPath()
      // Clockwise rotating dashed ring
      ctx.arc(centerX, centerY, currentSize - 15 + volume * 0.3, time * 0.005, time * 0.005 + Math.PI * 2)
      ctx.stroke()
      
      ctx.strokeStyle = `rgba(139, 92, 246, 0.22)`
      ctx.setLineDash([3, 10])
      ctx.beginPath()
      // Counter-clockwise rotating dashed ring
      ctx.arc(centerX, centerY, currentSize + 28 + volume * 0.15, -time * 0.003, -time * 0.003 + Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // 8. Draw very bright central synapse dot
      ctx.fillStyle = '#ffffff'
      ctx.shadowBlur = 10
      ctx.shadowColor = '#ffffff'
      ctx.beginPath()
      ctx.arc(centerX, centerY, 4.5 + volume * 0.05, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0 // Reset

      animationFrameIdRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
    }
  }, [])

  // Restart Speech Recognition if language changes while active
  useEffect(() => {
    if (active && recognitionRef.current) {
      console.log("Language changed to", lang, "- Restarting recognition...")
      
      const oldRecognition = recognitionRef.current
      recognitionRef.current = null
      
      oldRecognition.onend = null
      try {
        oldRecognition.stop()
      } catch (e) {
        console.error("Error stopping old recognition:", e)
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition()
          recognition.continuous = true
          recognition.interimResults = false
          recognition.lang = lang
          
          recognition.onstart = () => {
            setListening(true)
          }
          
          recognition.onerror = (event) => {
            console.error("Speech recognition error during language change:", event.error)
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
              recognitionRef.current = null
              setListening(false)
            }
          }
          
          recognition.onend = () => {
            if (recognitionRef.current && !isSpeakingRef.current) {
              try {
                recognitionRef.current.start()
              } catch (e) {
                console.log("Recognition restart skipped:", e)
              }
            }
          }
          
          recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase()
            console.log("Voice Command:", transcript)
            handleIncomingSpeech(transcript)
          }
          
          recognition.start()
          recognitionRef.current = recognition
        } catch (err) {
          console.error("Speech recognition restart failed:", err)
        }
      }
    }
  }, [lang, active])

  // Cleanup & Connection Listeners
  useEffect(() => {
    const handleOnline = () => {
      const isHindi = langRef.current.startsWith('hi')
      respond(isHindi 
        ? "नेटवर्क कनेक्शन बहाल हो गया है। सिस्टम पुनः ऑनलाइन आ गया है।" 
        : "Connection restored. System is back online. Security protocols active."
      )
    }
    const handleOffline = () => {
      const isHindi = langRef.current.startsWith('hi')
      respond(isHindi 
        ? "नेटवर्क कनेक्शन टूट गया है। स्टैंड अलोन मोड सक्रिय।" 
        : "Warning. Network connection lost. Local standby backup operational."
      )
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }
  }, [])

  return (
    <div style={styles.container}>
      <div 
        style={{
          ...styles.canvasWrapper,
          width: `${size * 3.5}px`,
          height: `${size * 3.5}px`
        }} 
        onClick={handleActivate}
      >
        <canvas
          ref={canvasRef}
          style={{
            ...styles.canvas,
            cursor: active ? "default" : "pointer",
            border: active ? "none" : "2px dashed rgba(0, 245, 255, 0.2)",
            borderRadius: "50%"
          }}
        />
        {!active && (
          <div style={styles.tapTextOverlay}>
            <div style={styles.tapText}>TAP TO</div>
            <div style={styles.tapTextGlow}>ACTIVATE</div>
          </div>
        )}
      </div>

      <h1 style={styles.title}>JARVIS</h1>

      <p style={styles.status}>
        {!active 
          ? "SYSTEM STANDBY" 
          : !listening 
            ? (lang.startsWith('hi') ? "ऑफलाइन - माइक बंद है" : "OFFLINE - MICROPHONE INACTIVE")
            : isAwake
              ? (lang.startsWith('hi') ? "ऑनलाइन - जार्विस सुन रहा है" : "ONLINE - LISTENING FOR COMMAND")
              : (lang.startsWith('hi') ? "स्टैंडबाय - 'हेलो जार्विस' बोलें" : "STANDBY - SAY 'HELLO JARVIS' TO WAKE UP")}
      </p>

      {micError && (
        <p style={{
          color: '#ef4444',
          marginTop: '8px',
          fontSize: '14px',
          fontFamily: "'Rajdhani', sans-serif",
          letterSpacing: '1px',
          fontWeight: '700',
          textAlign: 'center',
          maxWidth: '300px',
          textShadow: '0 0 8px rgba(239, 68, 68, 0.4)'
        }}>
          ⚠ {micError}
        </p>
      )}

      {/* Futuristic Speech Transcription Terminal */}
      {active && (
        <div style={styles.speechTerminal}>
          <div style={styles.terminalLine}>
            <span style={styles.terminalPromptUser}>&gt; USER:</span>
            <span style={styles.terminalText}> {currentSpeech || "listening..."}</span>
          </div>
          {jarvisResponse && (
            <div style={styles.terminalLine}>
              <span style={styles.terminalPromptJarvis}>&gt; JARVIS:</span>
              <span style={styles.terminalTextGlow}> {jarvisResponse}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

const styles = {
  container: {
    background: "transparent",
    height: "auto",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    padding: "10px"
  },

  canvasWrapper: {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    transition: "width 0.3s ease, height 0.3s ease"
  },

  canvas: {
    width: "100%",
    height: "100%",
    transition: "all 0.3s ease"
  },

  tapTextOverlay: {
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    pointerEvents: "none",
    zIndex: 10
  },

  tapText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: "15px",
    fontWeight: "500",
    letterSpacing: "3px",
    color: "rgba(255,255,255,0.6)",
    marginBottom: "5px"
  },

  tapTextGlow: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: "22px",
    fontWeight: "900",
    letterSpacing: "4px",
    color: "#00f5ff",
    textShadow: "0 0 10px rgba(0, 245, 255, 0.7)"
  },

  title: {
    color: "#00F5FF",
    marginTop: "20px",
    fontSize: "36px",
    letterSpacing: "8px",
    fontFamily: "'Orbitron', sans-serif",
    transition: "color 0.3s"
  },

  status: {
    color: "#a7d8de",
    marginTop: "10px",
    fontSize: "16px",
    fontFamily: "'Rajdhani', sans-serif",
    letterSpacing: "2px"
  },

  speechTerminal: {
    width: "90%",
    maxWidth: "420px",
    background: "rgba(10, 15, 26, 0.45)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "16px",
    padding: "16px 20px",
    marginTop: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
    boxSizing: "border-box",
    textAlign: "left"
  },

  terminalLine: {
    fontFamily: "'Share Tech Mono', ui-monospace, monospace",
    fontSize: "14px",
    lineHeight: "145%",
    display: "flex",
    alignItems: "flex-start",
    wordBreak: "break-word"
  },

  terminalPromptUser: {
    color: "#a855f7",
    fontWeight: "700",
    marginRight: "8px",
    flexShrink: 0
  },

  terminalPromptJarvis: {
    color: "#00f5ff",
    fontWeight: "700",
    marginRight: "8px",
    flexShrink: 0
  },

  terminalText: {
    color: "rgba(255, 255, 255, 0.8)"
  },

  terminalTextGlow: {
    color: "#00f5ff",
    textShadow: "0 0 8px rgba(0, 245, 255, 0.4)"
  }
}

export default JarvisBlob