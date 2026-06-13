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

const JarvisBlob = forwardRef(({ 
  color = 'cyan', 
  intensity = 1.5, 
  size = 105, 
  lang = 'en-US', 
  autoListen = true, 
  onNewMessage,
  groqKey = '',
  geminiKey = '',
  provider = 'gemini',
  addDiagnosticLog,
  audioDeviceId = '',
  isCalibrating = false,
  onCalibrationComplete
}, ref) => {
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
  const activeRef = useRef(false)
  const isAwakeRef = useRef(true)
  const isSpeakingRef = useRef(false)
  const recognitionRunningRef = useRef(false)
  const inactivityTimeoutRef = useRef(null)
  const activeUtterancesRef = useRef([])
  
  // Noise gate & calibration
  const noiseThresholdRef = useRef(15) // default gate
  const calibrationSamplesRef = useRef([])
  const isCalibratingRef = useRef(false)
  const lastActiveSoundTimeRef = useRef(Date.now())
  const lastSpeakStartTimeRef = useRef(0)

  // Sync settings props to refs
  const colorRef = useRef(color)
  const intensityRef = useRef(intensity)
  const sizeRef = useRef(size)
  const langRef = useRef(lang)
  const volumeRef = useRef(0)
  const animationFrameIdRef = useRef(null)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    isAwakeRef.current = isAwake
  }, [isAwake])

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

  // Handle key changes
  const groqKeyRef = useRef(groqKey)
  const geminiKeyRef = useRef(geminiKey)
  const providerRef = useRef(provider)

  useEffect(() => {
    groqKeyRef.current = groqKey
    geminiKeyRef.current = geminiKey
    providerRef.current = provider
  }, [groqKey, geminiKey, provider])

  // Handle calibration prop change
  useEffect(() => {
    isCalibratingRef.current = isCalibrating
    if (isCalibrating) {
      calibrationSamplesRef.current = []
      if (addDiagnosticLog) addDiagnosticLog('INFO', 'Mic calibration: Please remain silent...')
      
      // Auto complete calibration after 2 seconds
      const timer = setTimeout(() => {
        const samples = calibrationSamplesRef.current
        if (samples.length > 0) {
          const maxVal = Math.max(...samples)
          // Threshold is maximum ambient noise + small safety buffer
          noiseThresholdRef.current = Math.max(12, maxVal + 8)
        } else {
          noiseThresholdRef.current = 15 // fallback
        }
        
        if (addDiagnosticLog) {
          addDiagnosticLog('VOICE', `Microphone calibrated. Ambient noise floor gate set to ${noiseThresholdRef.current.toFixed(1)} dB`)
        }
        
        if (onCalibrationComplete) onCalibrationComplete()
      }, 2000)

      return () => clearTimeout(timer)
    }
  }, [isCalibrating])

  // EXPOSE TEXT SENDING METHOD TO PARENT (CHATS)
  useImperativeHandle(ref, () => ({
    sendTextMessage: async (text) => {
      if (!active) {
        await handleActivate()
      }
      
      if (onNewMessage) onNewMessage('user', text)
      if (addDiagnosticLog) addDiagnosticLog('INFO', `User text command: "${text}"`)
      setCurrentSpeech(text)
      setIsAwake(true)
      resetInactivityTimer()
      
      // If speaking, cancel it
      if (isSpeakingRef.current) {
        window.speechSynthesis.cancel()
        cleanupSpeech()
      }
      
      await takeCommand(text)
    }
  }))

  // SOUNDALIKE PHONETIC WAKE WORDS (Wakes up if any match is found)
  // Matches "Jarvis", "Hey Jarvis", "Okay Jarvis" in Hindi & English, plus sound-alikes
  const wakeWordRegex = /\b(jarvis|hey\s+jarvis|ok\s+jarvis|okay\s+jarvis|hello\s+jarvis|hi\s+jarvis|javis|jarves|charvis|garvis|travis|jaffas|जार्विस|हेलो\s+जार्विस|नमस्ते\s+जार्विस)\b/i

  const resetInactivityTimer = () => {
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current)
    }
    if (!autoListenRef.current) {
      inactivityTimeoutRef.current = setTimeout(() => {
        setIsAwake(false)
        inactivityTimeoutRef.current = null
        if (addDiagnosticLog) addDiagnosticLog('INFO', 'System entering standby mode. Waiting for wake word.')
      }, 10000) // Standby after 10s of silence
    } else {
      setIsAwake(true)
    }
  }

  // CORE STATE ENGINE FOR TRANSCRIBED VOICE INPUTS
  const handleIncomingSpeech = (transcript) => {
    const isHindi = langRef.current.startsWith('hi')
    const cleanedText = transcript.trim()
    if (!cleanedText) return

    resetInactivityTimer()

    // 1. Evaluate Noise Gate
    // If the user hasn't made sound above the ambient gate in the last 4 seconds, ignore it
    const timeSinceLastSound = Date.now() - lastActiveSoundTimeRef.current
    if (timeSinceLastSound > 4000) {
      console.log("Noise gate suppressed transcript:", cleanedText)
      if (addDiagnosticLog) addDiagnosticLog('WARN', `Filtered background noise: "${cleanedText}"`)
      return
    }

    if (addDiagnosticLog) addDiagnosticLog('STT', `Recognized speech: "${cleanedText}"`)

    // 2. Wake Word Detection
    const match = cleanedText.match(wakeWordRegex)

    if (autoListenRef.current || isAwakeRef.current || match) {
      setIsAwake(true)
      
      if (match) {
        const matchedWord = match[0]
        const command = cleanedText.substring(cleanedText.indexOf(matchedWord) + matchedWord.length).trim()
        
        if (addDiagnosticLog) addDiagnosticLog('CORE', `Wake word matched: "${matchedWord}"`)
        
        if (command) {
          setJarvisResponse("")
          setCurrentSpeech(cleanedText)
          if (onNewMessage) onNewMessage('user', cleanedText)
          takeCommand(command)
        } else {
          // Wake word only
          setJarvisResponse("")
          setCurrentSpeech(cleanedText)
          if (onNewMessage) onNewMessage('user', cleanedText)
          respond(isHindi ? "जी बोलिए, मैं सुन रहा हूँ।" : "Yes, I am listening. How can I help?")
        }
      } else {
        // Continuous listening or already awake, treat entire text as command
        setJarvisResponse("")
        setCurrentSpeech(cleanedText)
        if (onNewMessage) onNewMessage('user', cleanedText)
        takeCommand(cleanedText)
      }
    } else {
      console.log("Speech ignored (standby mode, no wake word):", cleanedText)
    }
  }

  // SPEECH SYNTHESIS (TTS) FUNCTION WITH RECOVERY AND CONCURRENCY RESILIENCE
  const speak = (text) => {
    if (!window.speechSynthesis) {
      if (addDiagnosticLog) addDiagnosticLog('WARN', 'Text-to-Speech is not supported in this browser.')
      return
    }

    // Cancel any ongoing speaking immediately
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    const activeLang = langRef.current
    utterance.lang = activeLang
    utterance.rate = 1.05 // Slightly faster for responsiveness
    utterance.pitch = 0.95 // Sleek assistant tone
    utterance.volume = 1.0
    
    // Attempt to select native speech synthesis voices
    const voices = window.speechSynthesis.getVoices()
    const voice = voices.find(v => v.lang.toLowerCase().startsWith(activeLang.split('-')[0].toLowerCase()))
    if (voice) {
      utterance.voice = voice
    }

    // Retain object reference to bypass V8 garbage collection bug in Chrome
    activeUtterancesRef.current.push(utterance)
    
    let safetyTimeout = null
    const textLength = text.length
    // Generous duration estimation: ~12 chars per sec + 4s buffer
    const estimatedDuration = (textLength / 12) * 1000 + 4000 

    const cleanupSpeech = () => {
      if (safetyTimeout) {
        clearTimeout(safetyTimeout)
        safetyTimeout = null
      }
      isSpeakingRef.current = false
      activeUtterancesRef.current = activeUtterancesRef.current.filter(u => u !== utterance)
      
      // Resume listening
      setTimeout(() => {
        if (activeRef.current && !isSpeakingRef.current && recognitionRef.current && !recognitionRunningRef.current) {
          try {
            recognitionRef.current.start()
          } catch (e) {
            console.log("Error resuming recognition after TTS:", e)
          }
        }
      }, 150)
    }

    utterance.onstart = () => {
      isSpeakingRef.current = true
      lastSpeakStartTimeRef.current = Date.now()
      if (addDiagnosticLog) addDiagnosticLog('TTS', 'Speaking response...')
      
      // Stop speech recognition when speaking to prevent self-trigger loop
      if (recognitionRef.current && recognitionRunningRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
          console.log("Error stopping recognition on speech start:", e)
        }
      }
      
      // Watchdog timeout to prevent voice synthesis freezing states
      safetyTimeout = setTimeout(() => {
        if (isSpeakingRef.current) {
          console.warn("SpeechSynthesis onend failed. Watchdog forced cleanup.")
          cleanupSpeech()
        }
      }, estimatedDuration)
    }

    utterance.onend = () => {
      cleanupSpeech()
    }

    utterance.onerror = (e) => {
      console.warn("SpeechSynthesis error:", e)
      cleanupSpeech()
    }
    
    window.speechSynthesis.speak(utterance)
  }

  const respond = (text) => {
    setJarvisResponse(text)
    speak(text)
    if (onNewMessage) onNewMessage('jarvis', text)
  }

  // EXECUTE ACTIONS & CORE AI COGNITIVE PIPELINE
  const takeCommand = async (message) => {
    const activeLang = langRef.current
    const isHindi = activeLang.startsWith('hi')
    const lowerMsg = message.toLowerCase()

    if (addDiagnosticLog) addDiagnosticLog('CORE', `Executing command: "${message}"`)

    // Local commands check
    if (isHindi) {
      if (lowerMsg.includes("गूगल खोलो") || lowerMsg.includes("गूगल खोलें") || lowerMsg.includes("गूगल खोलिए")) {
        respond("गूगल खोल रहा हूँ")
        window.open("https://google.com", "_blank")
        return
      }
      else if (lowerMsg.includes("यूट्यूब खोलो") || lowerMsg.includes("यूट्यूब खोलें") || lowerMsg.includes("यूट्यूब खोलिए")) {
        respond("यूट्यूब खोल रहा हूँ")
        window.open("https://youtube.com", "_blank")
        return
      }
      else if (lowerMsg.includes("समय") || lowerMsg.includes("टाइम")) {
        const time = new Date().toLocaleTimeString()
        respond(`अभी का समय है ${time}`)
        return
      }
    } else {
      if (lowerMsg.includes("open google")) {
        respond("Opening Google")
        window.open("https://google.com", "_blank")
        return
      }
      else if (lowerMsg.includes("open youtube")) {
        respond("Opening Youtube")
        window.open("https://youtube.com", "_blank")
        return
      }
      else if (lowerMsg.includes("time")) {
        const time = new Date().toLocaleTimeString()
        respond(`Current time is ${time}`)
        return
      }
    }

    // Call LLM Brain
    await callAIBrain(message)
  }

  const handleClientCommand = (command) => {
    if (command.type === 'OPEN_WEB') {
      if (addDiagnosticLog) addDiagnosticLog('SYSTEM', `Opening web URL: ${command.url}`)
      window.open(command.url, "_blank")
    } else if (command.type === 'WHATSAPP') {
      const phone = command.phone || ""
      const text = command.message || command.raw || ""
      const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`
      if (addDiagnosticLog) addDiagnosticLog('SYSTEM', `Launching WhatsApp message to ${phone}`)
      window.open(url, "_blank")
    }
  }

  // SEND PROMPT TO LLM Brain (GEMINI / GROQ)
  const callAIBrain = async (prompt) => {
    const isHindi = langRef.current.startsWith('hi')
    const activeProvider = providerRef.current

    setJarvisResponse(isHindi ? "सिस्टम प्रतिक्रिया लोड हो रही है..." : "Synchronizing synaptic response...")

    try {
      if (addDiagnosticLog) {
        addDiagnosticLog('AI', `Contacting AI Neural Brain (${activeProvider.toUpperCase()})...`)
      }

      const response = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-groq-key": groqKeyRef.current,
          "x-gemini-key": geminiKeyRef.current
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          provider: activeProvider
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

      if (fullText) {
        speak(fullText)
      }

      if (command) {
        handleClientCommand(command)
      }

    } catch (err) {
      console.error("AI Brain error:", err)
      if (addDiagnosticLog) addDiagnosticLog('WARN', `AI Brain failed: ${err.message}`)
      
      const errorMsg = isHindi
        ? "माफ़ कीजिए, कनेक्टिविटी समस्या के कारण मैं अभी जवाब नहीं दे पा रहा हूँ।"
        : "I apologize, but connection latency is preventing a synaptic response at this moment."
      setJarvisResponse(errorMsg)
      speak(errorMsg)
      if (onNewMessage) onNewMessage('jarvis', errorMsg)
    }
  }

  // WAKE UP / INITIALIZE AUDIO DRIVERS AND STT ENGINES
  const handleActivate = async () => {
    // If speaking, click acts as an interrupt (mute)
    if (isSpeakingRef.current) {
      if (addDiagnosticLog) addDiagnosticLog('INFO', 'Vocal interrupt triggered via visual core tap.')
      window.speechSynthesis.cancel()
      cleanupSpeech()
      return
    }

    if (active) return

    if (addDiagnosticLog) addDiagnosticLog('INFO', 'Initializing primary microphone capture...')

    // 1. Setup Audio Input media device
    try {
      const constraints = audioDeviceId 
        ? { audio: { deviceId: { exact: audioDeviceId } } } 
        : { audio: true }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (addDiagnosticLog) addDiagnosticLog('SECURE', 'Microphone audio stream captured successfully.')

      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      // Audio frequency monitoring loop
      const updateVolume = () => {
        if (!audioContextRef.current) return
        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        volumeRef.current = average

        // Record calibration values
        if (isCalibratingRef.current) {
          calibrationSamplesRef.current.push(average)
        }

        // Noise gate tracking
        if (average > noiseThresholdRef.current) {
          lastActiveSoundTimeRef.current = Date.now()
        }

        // Real-time voice interruption (barge-in)
        // If JARVIS is speaking and user speaks loud enough (above gate + buffer), stop TTS
        if (isSpeakingRef.current && average > noiseThresholdRef.current + 25 && (Date.now() - lastSpeakStartTimeRef.current) > 800) {
          console.log("Vocal interruption threshold triggered:", average)
          if (addDiagnosticLog) addDiagnosticLog('VOICE', 'Barge-in detected: User vocal command interrupted speech.')
          window.speechSynthesis.cancel()
          cleanupSpeech()
        }

        // Direct DOM volume meter rendering for ultra low CPU usage
        const fillBar = document.getElementById('volume-meter-fill')
        if (fillBar) {
          const percent = Math.min(100, (average / 80) * 100)
          fillBar.style.width = `${percent}%`
          if (percent < 30) fillBar.style.backgroundColor = '#10b981' // Green
          else if (percent < 75) fillBar.style.backgroundColor = '#f59e0b' // Yellow
          else fillBar.style.backgroundColor = '#ef4444' // Red
        }

        requestAnimationFrame(updateVolume)
      }
      updateVolume()
    } catch (err) {
      console.error("Microphone hardware setup failed:", err)
      setMicError("Microphone access failed. Ensure mic is connected and allowed in browser.")
      if (addDiagnosticLog) addDiagnosticLog('WARN', 'Mic device connection failed. Blocked or absent.')
      return
    }

    // 2. Setup Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setMicError("Speech Recognition is not supported by this browser. Use Chrome or Edge.")
      if (addDiagnosticLog) addDiagnosticLog('WARN', 'Critical: SpeechRecognition interface not found.')
      return
    }

    setMicError("")
    if (addDiagnosticLog) addDiagnosticLog('INFO', 'Initializing Web Speech Recognition engine...')

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      // Support Hinglish
      recognition.lang = langRef.current === 'en-IN' ? 'hi-IN' : langRef.current
      recognition.interimResults = false

      recognition.onstart = () => {
        setListening(true)
        recognitionRunningRef.current = true
        setMicError("")
        if (addDiagnosticLog) addDiagnosticLog('SECURE', `Speech recognition pipeline online [${recognition.lang}]`)
      }

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error)
        recognitionRunningRef.current = false
        
        if (event.error === 'not-allowed') {
          setMicError("Mic access blocked. Check browser address bar permissions.")
          if (addDiagnosticLog) addDiagnosticLog('WARN', 'STT failed: not-allowed permission.')
          recognitionRef.current = null
          setListening(false)
        } else if (event.error === 'service-not-allowed') {
          setMicError("STT service not allowed.")
          if (addDiagnosticLog) addDiagnosticLog('WARN', 'STT failed: service-not-allowed.')
          recognitionRef.current = null
          setListening(false)
        } else if (event.error === 'network') {
          if (addDiagnosticLog) addDiagnosticLog('WARN', 'STT failed: network disconnect.')
        } else if (event.error !== 'no-speech') {
          if (addDiagnosticLog) addDiagnosticLog('WARN', `STT engine error: ${event.error}`)
        }
      }

      recognition.onend = () => {
        recognitionRunningRef.current = false
        // Auto restart if active and assistant is not speaking
        if (activeRef.current && !isSpeakingRef.current && recognitionRef.current) {
          setTimeout(() => {
            if (activeRef.current && !isSpeakingRef.current && !recognitionRunningRef.current) {
              try {
                recognitionRef.current.start()
              } catch (e) {
                console.log("Recognition restart deferred:", e)
              }
            }
          }, 200)
        }
      }

      recognition.onresult = (event) => {
        const results = event.results
        const transcript = results[results.length - 1][0].transcript
        handleIncomingSpeech(transcript)
      }

      recognition.start()
      recognitionRef.current = recognition
    } catch (err) {
      console.error("Speech recognition activation failed:", err)
      setMicError(`Speech recognition start failed: ${err.message}`)
      if (addDiagnosticLog) addDiagnosticLog('WARN', `STT initialization error: ${err.message}`)
    }

    setActive(true)
    setIsAwake(true)
    resetInactivityTimer()
    
    setTimeout(() => {
      const isHindi = langRef.current.startsWith('hi')
      respond(isHindi ? "जार्विस न्यूरल विज़ुअलाइज़र सक्रिय। मैं सुन रहा हूँ।" : "Jarvis neural visualizer loaded. Ready for input.")
    }, 400)
  }

  // 3. Canvas Simulation Loop (Organic glowing synapses pulse)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    
    canvas.width = 400
    canvas.height = 400

    const particleCount = 145
    const particles = []
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        angle: (i / particleCount) * Math.PI * 2,
        relativeRadius: 1.0 + (Math.random() * 0.08 - 0.04),
        speed: (Math.random() * 0.002 + 0.001) * (Math.random() < 0.5 ? 1 : -1),
        size: Math.random() * 1.6 + 1.0
      })
    }

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
      
      const volume = isAwakeRef.current ? (rawVolume * intensityRef.current) : (rawVolume * intensityRef.current * 0.12)
      const baseOscillation = isAwakeRef.current ? 0 : Math.sin(time * 0.02) * 6
      const currentSize = sizeRef.current + baseOscillation
      
      time += 1.2

      ctx.clearRect(0, 0, width, height)

      const centerX = width / 2
      const centerY = height / 2
      const theme = getColorTheme(colorRef.current)

      // 1. Constellation background
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

      // 2. Grids
      ctx.strokeStyle = theme.mesh
      ctx.lineWidth = 0.4
      
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

      // 3. Central Gradient Glow
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

      // 4. Organic Bezier Fibers
      const positions = []
      particles.forEach(p => {
        const currentSpeed = p.speed * (1 + volume * 0.06)
        p.angle += currentSpeed

        const wave = Math.sin(p.angle * 6 + time * 0.015) * 6
        const currentRadius = (currentSize * p.relativeRadius) + wave + (volume * 1.05)

        const x = centerX + Math.cos(p.angle) * currentRadius
        const y = centerY + Math.sin(p.angle) * currentRadius
        positions.push({ x, y, size: p.size, angle: p.angle })

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

      // 5. Synaptic Glowing Nodes
      positions.forEach(pos => {
        ctx.fillStyle = theme.node
        ctx.shadowBlur = 5 + (volume * 0.12)
        ctx.shadowColor = theme.glow
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, pos.size + (volume * 0.008), 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.shadowBlur = 0

      // 6. Neural Connections
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

      // 7. Rotating Guide Rings
      ctx.strokeStyle = theme.ring
      ctx.lineWidth = 0.8
      ctx.setLineDash([5, 8])
      ctx.beginPath()
      ctx.arc(centerX, centerY, currentSize - 15 + volume * 0.3, time * 0.005, time * 0.005 + Math.PI * 2)
      ctx.stroke()
      
      ctx.strokeStyle = `rgba(139, 92, 246, 0.22)`
      ctx.setLineDash([3, 10])
      ctx.beginPath()
      ctx.arc(centerX, centerY, currentSize + 28 + volume * 0.15, -time * 0.003, -time * 0.003 + Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // 8. Central Node
      ctx.fillStyle = '#ffffff'
      ctx.shadowBlur = 10
      ctx.shadowColor = '#ffffff'
      ctx.beginPath()
      ctx.arc(centerX, centerY, 4.5 + volume * 0.05, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      animationFrameIdRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
    }
  }, [])

  // AUTO HEALING WATCHDOG: Restarts recognition if it hangs/dies in background
  useEffect(() => {
    const watchdog = setInterval(() => {
      if (activeRef.current && !isSpeakingRef.current && !recognitionRunningRef.current && recognitionRef.current) {
        console.log("Watchdog: Speech recognition was offline. Restoring...")
        if (addDiagnosticLog) addDiagnosticLog('WARN', 'Voice engine stalled. Performing auto-recovery restart...')
        try {
          recognitionRef.current.start()
        } catch (e) {
          console.error("Watchdog restart failed:", e)
        }
      }
    }, 2500)
    
    return () => clearInterval(watchdog)
  }, [])

  // Restart Speech Recognition if device/language changes while active
  useEffect(() => {
    if (active && recognitionRef.current) {
      console.log("Settings changed (Device / Language). Rebuilding recognition...")
      if (addDiagnosticLog) addDiagnosticLog('INFO', `Speech settings changed. Rebuilding recognition engine...`)
      
      const oldRec = recognitionRef.current
      recognitionRef.current = null
      oldRec.onend = null
      try {
        oldRec.stop()
      } catch (e) {}

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition()
          recognition.continuous = true
          recognition.lang = lang === 'en-IN' ? 'hi-IN' : lang
          recognition.interimResults = false
          
          recognition.onstart = () => {
            setListening(true)
            recognitionRunningRef.current = true
            if (addDiagnosticLog) addDiagnosticLog('SECURE', `Speech recognition rebuilt [${recognition.lang}]`)
          }
          
          recognition.onerror = (event) => {
            console.error("Rebuilt recognition error:", event.error)
            recognitionRunningRef.current = false
          }
          
          recognition.onend = () => {
            recognitionRunningRef.current = false
            if (activeRef.current && !isSpeakingRef.current && recognitionRef.current) {
              setTimeout(() => {
                if (activeRef.current && !isSpeakingRef.current && !recognitionRunningRef.current) {
                  try {
                    recognitionRef.current.start()
                  } catch (e) {}
                }
              }, 200)
            }
          }
          
          recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript
            handleIncomingSpeech(transcript)
          }
          
          recognition.start()
          recognitionRef.current = recognition
        } catch (err) {
          console.error("Speech recognition rebuild failed:", err)
        }
      }
    }
  }, [lang, active, audioDeviceId])

  // Connection & Offline Handlers
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
            cursor: "pointer",
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

      <h1 style={{ ...styles.title, color: getColorTheme(color).core }}>JARVIS</h1>

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
              <span style={{ ...styles.terminalPromptJarvis, color: getColorTheme(color).core }}>&gt; JARVIS:</span>
              <span style={{ ...styles.terminalTextGlow, color: getColorTheme(color).core, textShadow: `0 0 8px ${getColorTheme(color).radial}` }}> {jarvisResponse}</span>
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
    fontWeight: "700",
    marginRight: "8px",
    flexShrink: 0
  },

  terminalText: {
    color: "rgba(255, 255, 255, 0.8)"
  },

  terminalTextGlow: {}
}

export default JarvisBlob