import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import Nabbar from './components/Nabbar'
import JarvisBlob from './components/blob'

function App() {
  const [activeTab, setActiveTab] = useState('core')
  
  // Real-time simulated system stats
  const [stats, setStats] = useState({
    cpu: 24,
    ram: 45,
    temp: 38,
    ping: 12
  })

  // Diagnostic log messages
  const [logs, setLogs] = useState([
    { time: new Date().toLocaleTimeString(), type: 'INFO', msg: 'Core system initialization sequence complete.' },
    { time: new Date().toLocaleTimeString(), type: 'SECURE', msg: 'Firewall protocols active. All ports secured.' },
    { time: new Date().toLocaleTimeString(), type: 'CORE', msg: 'Acoustic feedback loops calibrated.' }
  ])

  const addLog = (type, msg) => {
    const time = new Date().toLocaleTimeString()
    setLogs(prev => [
      { time, type, msg },
      ...prev.slice(0, 30) // Keep last 30 logs
    ])
  }

  // API Keys
  const [groqKey, setGroqKey] = useState(() => localStorage.getItem('groq_api_key') || '')
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '')
  const [activeProvider, setActiveProvider] = useState(() => localStorage.getItem('active_provider') || 'gemini')

  // Mic Selection & Calibration
  const [audioDevices, setAudioDevices] = useState([])
  const [selectedAudioDevice, setSelectedAudioDevice] = useState(() => localStorage.getItem('selected_audio_device') || '')
  const [isCalibrating, setIsCalibrating] = useState(false)

  // Document Picture-in-Picture State
  const [isPipActive, setIsPipActive] = useState(false)
  const pipWindowRef = useRef(null)

  // Interactive settings state
  const [voiceVol, setVoiceVol] = useState(80)
  const [autoListen, setAutoListen] = useState(true)
  const [blobColor, setBlobColor] = useState('cyan')
  const [blinkIntensity, setBlinkIntensity] = useState(1.5)
  const [blobSize, setBlobSize] = useState(105)
  const [speechLang, setSpeechLang] = useState('en-US')
  const [chatHistory, setChatHistory] = useState([
    { sender: 'jarvis', text: 'Core system active. Neural links online.', time: new Date().toLocaleTimeString() }
  ])
  const [typedMessage, setTypedMessage] = useState('')
  const blobRef = useRef(null)
  const chatMessagesEndRef = useRef(null)

  // WebSocket State
  const [wsConnected, setWsConnected] = useState(false)
  const [pendingApproval, setPendingApproval] = useState(null)
  const [agentStates, setAgentStates] = useState({ PLANNING: 'idle', SYSTEM: 'idle', COORDINATOR: 'idle' })
  const wsRef = useRef(null)

  // Memory panel state
  const [memQuery, setMemQuery] = useState('')
  const [memResults, setMemResults] = useState([])
  const [docPath, setDocPath] = useState('')
  const [isIndexingDoc, setIsIndexingDoc] = useState(false)
  const [activePlan, setActivePlan] = useState(null)
  const [factsList, setFactsList] = useState([])

  const handleNewMessage = (sender, text) => {
    setChatHistory(prev => [...prev, { sender, text, time: new Date().toLocaleTimeString() }])
  }

  // Connect to backend WebSocket Event Bus
  useEffect(() => {
    const connectWS = () => {
      console.log('Connecting to JARVIS WebSocket server...')
      const ws = new WebSocket('ws://localhost:5000')
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
        addLog('SECURE', 'Neural Link established with backend Event Bus.')
      }

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          const { event: eventName, data } = payload
          console.log(`[WS Event] ${eventName}`, data)

          switch (eventName) {
            case 'state_changed':
              break;
            case 'diagnostic_log':
              addLog(data.type, data.msg)
              break;
            case 'agent_activity':
              setAgentStates(prev => ({ ...prev, [data.agent]: data.status }))
              break;
            case 'agent_result':
              if (data.success) {
                addLog('INFO', `Agent ${data.agent} completed action.`)
                if (data.agent === 'MEMORY') {
                  setIsIndexingDoc(false)
                  if (Array.isArray(data.result)) {
                    const isSearch = data.result.length > 0 && 'distance' in data.result[0];
                    if (isSearch) {
                      setMemResults(data.result)
                    } else {
                      setFactsList(data.result)
                    }
                  } else {
                    addLog('INFO', 'Document parsed successfully.')
                    setDocPath('')
                    refreshFacts()
                  }
                }
              } else {
                addLog('WARN', `Agent ${data.agent} execution failed: ${data.error}`)
                if (data.agent === 'MEMORY') {
                  setIsIndexingDoc(false)
                }
              }
              break;
            case 'speak_response':
              handleNewMessage('jarvis', data.text)
              break;
            case 'approval_required':
              setPendingApproval({
                actionType: data.actionType,
                payload: data.payload,
                replyChannel: data.replyChannel
              })
              break;
            case 'plan_generated':
              setActivePlan(data.steps)
              addLog('CORE', `New task plan generated with ${data.steps.length} steps.`)
              break;
            case 'step_status_changed':
              setActivePlan(prev => {
                if (!prev) return null;
                return prev.map(s => s.id === data.stepId ? { ...s, status: data.status, result: data.result, error: data.error } : s)
              })
              break;
            default:
              break;
          }
        } catch (e) {
          console.error('WebSocket message parsing failed:', e)
        }
      }

      ws.onclose = () => {
        setWsConnected(false)
        console.log('WebSocket disconnected. Retrying in 3s...')
        setTimeout(connectWS, 3000)
      }

      ws.onerror = (err) => {
        console.error('WebSocket connection error:', err)
      }
    }

    connectWS()
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  const handleSendMessage = () => {
    if (!typedMessage.trim()) return
    handleNewMessage('user', typedMessage)
    
    // Check if WS is connected to route prompt, else fallback to voice blob handler
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: 'text_command',
        data: { text: typedMessage }
      }))
    } else if (blobRef.current) {
      blobRef.current.sendTextMessage(typedMessage)
    }
    setTypedMessage('')
  }

  const handleApprovalResponse = (approved) => {
    if (!pendingApproval || !wsRef.current) return
    wsRef.current.send(JSON.stringify({
      event: 'permission_response',
      data: {
        approved,
        replyChannel: pendingApproval.replyChannel
      }
    }))
    setPendingApproval(null)
  }

  const handleMemorySearch = () => {
    if (!memQuery.trim() || !wsRef.current) return
    wsRef.current.send(JSON.stringify({
      event: 'text_command',
      data: { text: `search notes for ${memQuery}` }
    }))
  }

  const handleLearnDoc = () => {
    if (!docPath.trim() || !wsRef.current) return
    setIsIndexingDoc(true)
    wsRef.current.send(JSON.stringify({
      event: 'text_command',
      data: { text: `learn document ${docPath}` }
    }))
  }

  const refreshFacts = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: 'text_command',
        data: { text: 'list memories' }
      }))
    }
  }

  useEffect(() => {
    if (activeTab === 'memory') {
      refreshFacts()
    }
  }, [activeTab, wsConnected])

  const canvasRef = useRef(null)
  useEffect(() => {
    let animationFrameId;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const state = wsConnected 
        ? (pendingApproval 
            ? 'sec' 
            : (agentStates.COORDINATOR === 'busy' || agentStates.PLANNING === 'busy' 
                ? 'think' 
                : (logs[0]?.msg?.includes('speaking') || chatHistory[chatHistory.length - 1]?.sender === 'jarvis' && agentStates.COORDINATOR === 'busy' 
                    ? 'speak' 
                    : 'idle'))) 
        : 'offline';
      
      ctx.lineWidth = 2.5;
      
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      const gradient2 = ctx.createLinearGradient(0, 0, canvas.width, 0);
      if (blobColor === 'cyan') {
        gradient.addColorStop(0, 'rgba(0, 245, 255, 0.1)');
        gradient.addColorStop(0.5, 'rgba(0, 245, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(0, 245, 255, 0.1)');
        
        gradient2.addColorStop(0, 'rgba(0, 245, 255, 0.03)');
        gradient2.addColorStop(0.5, 'rgba(0, 245, 255, 0.25)');
        gradient2.addColorStop(1, 'rgba(0, 245, 255, 0.03)');
      } else if (blobColor === 'purple') {
        gradient.addColorStop(0, 'rgba(168, 85, 247, 0.1)');
        gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.8)');
        gradient.addColorStop(1, 'rgba(168, 85, 247, 0.1)');
        
        gradient2.addColorStop(0, 'rgba(168, 85, 247, 0.03)');
        gradient2.addColorStop(0.5, 'rgba(168, 85, 247, 0.25)');
        gradient2.addColorStop(1, 'rgba(168, 85, 247, 0.03)');
      } else if (blobColor === 'green') {
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.1)');
        gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.8)');
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0.1)');
        
        gradient2.addColorStop(0, 'rgba(34, 197, 94, 0.03)');
        gradient2.addColorStop(0.5, 'rgba(34, 197, 94, 0.25)');
        gradient2.addColorStop(1, 'rgba(34, 197, 94, 0.03)');
      } else {
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.1)');
        gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.8)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.1)');
        
        gradient2.addColorStop(0, 'rgba(239, 68, 68, 0.03)');
        gradient2.addColorStop(0.5, 'rgba(239, 68, 68, 0.25)');
        gradient2.addColorStop(1, 'rgba(239, 68, 68, 0.03)');
      }
      ctx.strokeStyle = state === 'sec' ? '#f59e0b' : gradient;
      
      ctx.beginPath();
      const width = canvas.width;
      const height = canvas.height;
      const midY = height / 2;
      
      let amplitude = 4;
      let frequency = 0.02;
      let speed = 0.05;
      
      if (state === 'speak') {
        amplitude = 18 + Math.sin(phase * 1.5) * 6;
        frequency = 0.035;
        speed = 0.18;
      } else if (state === 'think') {
        amplitude = 8;
        frequency = 0.08;
        speed = 0.12;
      } else if (state === 'sec') {
        amplitude = 12;
        frequency = 0.01;
        speed = 0.02;
        ctx.strokeStyle = '#f59e0b';
      } else if (state === 'offline') {
        amplitude = 0.5;
        frequency = 0.005;
        speed = 0.002;
      } else {
        amplitude = 3 + Math.sin(phase * 0.5) * 1.5;
        frequency = 0.015;
        speed = 0.03;
      }

      for (let x = 0; x < width; x++) {
        const y = midY + Math.sin(x * frequency + phase) * amplitude * Math.sin(x * Math.PI / width);
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = state === 'sec' ? 'rgba(245, 158, 11, 0.25)' : gradient2;
      for (let x = 0; x < width; x++) {
        const y = midY + Math.sin(x * (frequency * 1.2) - phase + Math.PI) * (amplitude * 0.7) * Math.sin(x * Math.PI / width);
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      phase += speed;
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [wsConnected, agentStates, logs, chatHistory, blobColor, pendingApproval])

  // Get audio input devices list
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        let audioInputs = devices.filter(d => d.kind === 'audioinput')
        
        // If labels are empty, try to request permission and re-enumerate
        if (audioInputs.length > 0 && !audioInputs[0].label) {
          try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
            tempStream.getTracks().forEach(track => track.stop())
            const reEnumerated = await navigator.mediaDevices.enumerateDevices()
            audioInputs = reEnumerated.filter(d => d.kind === 'audioinput')
          } catch (err) {
            console.warn("User blocked mic or no mic connected:", err)
            addLog('WARN', 'Microphone permission denied or device blocked.')
          }
        }
        
        setAudioDevices(audioInputs)
        if (audioInputs.length > 0 && !selectedAudioDevice) {
          const defaultDev = audioInputs[0].deviceId
          setSelectedAudioDevice(defaultDev)
          localStorage.setItem('selected_audio_device', defaultDev)
        }
      } catch (e) {
        console.error("Failed to enumerate audio devices:", e)
        addLog('WARN', 'Error scanning microphone devices.')
      }
    }

    getDevices()

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', getDevices)
      return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices)
    }
  }, [selectedAudioDevice])

  // Save settings when changed
  useEffect(() => {
    localStorage.setItem('groq_api_key', groqKey)
  }, [groqKey])

  useEffect(() => {
    localStorage.setItem('gemini_api_key', geminiKey)
  }, [geminiKey])

  useEffect(() => {
    localStorage.setItem('active_provider', activeProvider)
  }, [activeProvider])

  useEffect(() => {
    if (selectedAudioDevice) {
      localStorage.setItem('selected_audio_device', selectedAudioDevice)
    }
  }, [selectedAudioDevice])

  // Sync settings with backend when keys or connection state change
  useEffect(() => {
    if (wsRef.current && wsConnected && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: 'sync_settings',
        data: {
          groqKey,
          geminiKey,
          activeProvider
        }
      }))
    }
  }, [groqKey, geminiKey, activeProvider, wsConnected])

  // Picture in Picture Toggle
  const togglePip = async () => {
    if (isPipActive) {
      if (pipWindowRef.current) {
        pipWindowRef.current.close()
      }
      return
    }

    if (!('documentPictureInPicture' in window)) {
      addLog('WARN', 'Document Picture-in-Picture API not supported by this browser.')
      alert('Document Picture-in-Picture is not supported in this browser. Please use Chrome or Edge.')
      return
    }

    try {
      addLog('INFO', 'Opening Siri-like floating overlay...')
      
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 300,
        height: 350,
      })
      
      pipWindowRef.current = pipWindow
      setIsPipActive(true)

      // Copy all stylesheets from main window to PiP window
      const allStyles = [...document.styleSheets]
      allStyles.forEach(styleSheet => {
        try {
          const cssRules = [...styleSheet.cssRules].map(r => r.cssText).join('')
          const style = pipWindow.document.createElement('style')
          style.textContent = cssRules
          pipWindow.document.head.appendChild(style)
        } catch (e) {
          const link = pipWindow.document.createElement('link')
          link.rel = 'stylesheet'
          link.href = styleSheet.href
          pipWindow.document.head.appendChild(link)
        }
      })

      // Apply cyberpunk floating theme to PiP window body
      pipWindow.document.body.style.background = 'radial-gradient(circle at center, #0f172a, #020617)'
      pipWindow.document.body.style.margin = '0'
      pipWindow.document.body.style.overflow = 'hidden'
      pipWindow.document.body.style.display = 'flex'
      pipWindow.document.body.style.justifyContent = 'center'
      pipWindow.document.body.style.alignItems = 'center'
      pipWindow.document.body.style.height = '100vh'
      pipWindow.document.body.style.position = 'relative'

      // Copy scanlines styling
      const scanlines = pipWindow.document.createElement('div')
      scanlines.style.position = 'absolute'
      scanlines.style.inset = '0'
      scanlines.style.background = 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.18) 50%)'
      scanlines.style.backgroundSize = '100% 4px'
      scanlines.style.pointerEvents = 'none'
      scanlines.style.zIndex = '999'
      scanlines.style.opacity = '0.4'
      pipWindow.document.body.appendChild(scanlines)

      // Create container
      const container = pipWindow.document.createElement('div')
      container.id = 'pip-root'
      container.style.width = '100%'
      container.style.height = '100%'
      container.style.display = 'flex'
      container.style.flexDirection = 'column'
      container.style.justifyContent = 'center'
      container.style.alignItems = 'center'
      pipWindow.document.body.appendChild(container)

      // Handle closing event
      pipWindow.addEventListener('pagehide', () => {
        setIsPipActive(false)
        pipWindowRef.current = null
        addLog('INFO', 'Floating overlay closed. Restoring JARVIS to main interface.')
      })

    } catch (err) {
      console.error('Failed to open PiP window:', err)
      addLog('WARN', `Failed to open floating overlay: ${err.message}`)
    }
  }

  // Trigger microphone calibration
  const handleCalibrate = () => {
    if (isCalibrating) return
    setIsCalibrating(true)
    addLog('INFO', 'Microphone calibration initiated. Please remain silent for 2 seconds...')
  }

  useEffect(() => {
    if (activeTab === 'chat' && chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatHistory, activeTab])

  // Simulate telemetry stats
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prev => ({
        cpu: Math.max(10, Math.min(95, prev.cpu + Math.floor(Math.random() * 11) - 5)),
        ram: Math.max(30, Math.min(85, prev.ram + Math.floor(Math.random() * 3) - 1)),
        temp: Math.max(30, Math.min(75, prev.temp + Math.floor(Math.random() * 5) - 2)),
        ping: Math.max(5, Math.min(45, prev.ping + Math.floor(Math.random() * 7) - 3))
      }))
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  // Content for the assistant (Voice Blob, Transcription, Status)
  const assistantPanelContent = (
    <JarvisBlob 
      ref={blobRef}
      color={blobColor} 
      intensity={blinkIntensity} 
      size={isPipActive ? 75 : blobSize} // shrink slightly in floating mode
      lang={speechLang} 
      autoListen={autoListen}
      onNewMessage={handleNewMessage}
      groqKey={groqKey}
      geminiKey={geminiKey}
      provider={activeProvider}
      addDiagnosticLog={addLog}
      audioDeviceId={selectedAudioDevice}
      isCalibrating={isCalibrating}
      onCalibrationComplete={() => {
        setIsCalibrating(false)
      }}
    />
  )

  return (
    <div className="app-layout">
      {/* Liquid Glass Navbar */}
      <Nabbar activeTab={activeTab} setActiveTab={setActiveTab} onFloatClick={togglePip} />

      {/* Main Content Area */}
      <main className="content-container">
        
        {/* Left Side: Jarvis Voice Blob or portal placeholder */}
        <div className="assistant-panel">
          {isPipActive ? (
            <div className="pip-placeholder">
              <div className="pip-placeholder-glow"></div>
              <p className="pip-placeholder-title">JARVIS FLOATING ACTIVE</p>
              <p className="pip-placeholder-text">Siri Overlay Mode is running in a separate always-on-top window.</p>
              <button className="pip-restore-btn" onClick={() => pipWindowRef.current?.close()}>
                RESTORE WIDGET
              </button>
            </div>
          ) : (
            <>
              {assistantPanelContent}
              <canvas 
                ref={canvasRef} 
                className="waveform-canvas" 
                width="360" 
                height="80"
              />
              
              {activePlan && activePlan.length > 0 && (
                <div className="planner-timeline-card glass-panel fade-in">
                  <div className="planner-header">
                    <span className="planner-title">AUTONOMOUS MISSION LOG</span>
                    <button className="planner-clear-btn" onClick={() => setActivePlan(null)}>DISMISS</button>
                  </div>
                  <div className="planner-steps">
                    {activePlan.map((step) => (
                      <div key={step.id} className={`planner-step-row ${step.status}`}>
                        <div className="step-bullet"></div>
                        <div className="step-info">
                          <span className="step-agent-badge">{step.agent}</span>
                          <span className="step-action-desc">{step.action.replace(/_/g, ' ')}</span>
                          {step.params && step.params.query && <span className="step-param">("{step.params.query}")</span>}
                        </div>
                        <div className="step-status-indicator">
                          {step.status === 'completed' && <span className="status-tag success">✓</span>}
                          {step.status === 'in_progress' && <span className="status-tag loading">⟳</span>}
                          {step.status === 'failed' && <span className="status-tag failed">✗</span>}
                          {step.status === 'pending' && <span className="status-tag pending">⋯</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Portal injection into the PiP window if active */}
        {isPipActive && pipWindowRef.current && 
          createPortal(
            <div style={{ transform: 'scale(0.85)', transformOrigin: 'center center' }}>
              {assistantPanelContent}
            </div>,
            pipWindowRef.current.document.getElementById('pip-root')
          )
        }

        {/* Right Side: Tab details */}
        <div className="details-panel fade-in">
          {activeTab === 'chat' && (
            <div className="tab-content">
              <h2 className="section-title">CHAT TERMINAL</h2>
              <div className="chat-container">
                <div className="chat-messages">
                  {chatHistory.map((msg, index) => (
                    <div key={index} className={`chat-message ${msg.sender}`}>
                      <div className="message-text">{msg.text}</div>
                      <span className="message-time">{msg.time}</span>
                    </div>
                  ))}
                  <div ref={chatMessagesEndRef} />
                </div>
                <div className="chat-input-container">
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Type system instruction..."
                    value={typedMessage}
                    onChange={(e) => setTypedMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendMessage()
                    }}
                  />
                  <button className="chat-send-btn" onClick={handleSendMessage}>
                    SEND
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'core' && (
            <div className="tab-content">
              <h2 className="section-title">SYSTEM MONITOR</h2>
              <div className="dashboard-grid">
                <div className="stat-card circular">
                  <div className="circle-chart-container">
                    <svg viewBox="0 0 36 36" className="circular-chart accent">
                      <path className="circle-bg"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path className="circle"
                        strokeDasharray={`${stats.cpu}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <text x="18" y="20.35" className="percentage">{stats.cpu}%</text>
                    </svg>
                  </div>
                  <div className="stat-info">
                    <h3 className="stat-label">CPU LOAD</h3>
                    <span className="stat-detail">Nominal Usage</span>
                  </div>
                </div>

                <div className="stat-card circular">
                  <div className="circle-chart-container">
                    <svg viewBox="0 0 36 36" className="circular-chart purple-ring">
                      <path className="circle-bg"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path className="circle"
                        strokeDasharray={`${stats.ram}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <text x="18" y="20.35" className="percentage">{stats.ram}%</text>
                    </svg>
                  </div>
                  <div className="stat-info">
                    <h3 className="stat-label">RAM UTILS</h3>
                    <span className="stat-detail">Active Session Cache</span>
                  </div>
                </div>

                <div className="stat-card circular">
                  <div className="circle-chart-container">
                    <svg viewBox="0 0 36 36" className="circular-chart temp-ring">
                      <path className="circle-bg"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path className="circle"
                        strokeDasharray={`${stats.temp}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <text x="18" y="20.35" className="percentage">{stats.temp}°C</text>
                    </svg>
                  </div>
                  <div className="stat-info">
                    <h3 className="stat-label">CORE TEMP</h3>
                    <span className="stat-detail">Nominal Range</span>
                  </div>
                </div>

                <div className="stat-card circular">
                  <div className="circle-chart-container">
                    <svg viewBox="0 0 36 36" className="circular-chart green-ring">
                      <path className="circle-bg"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path className="circle"
                        strokeDasharray={`${Math.min(100, stats.ping * 2.5)}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <text x="18" y="20.35" className="percentage">{stats.ping}ms</text>
                    </svg>
                  </div>
                  <div className="stat-info">
                    <h3 className="stat-label">LATENCY</h3>
                    <span className="stat-detail">Secure LLM Uplink</span>
                  </div>
                </div>
              </div>

              {/* Futuristic Radar Widget */}
              <div className="radar-widget-card">
                <div className="radar-grid-container">
                  <div className="radar-scanner"></div>
                  <div className="radar-circle rc-1"></div>
                  <div className="radar-circle rc-2"></div>
                  <div className="radar-circle rc-3"></div>
                  <div className="radar-crosshair-h"></div>
                  <div className="radar-crosshair-v"></div>
                  <div className="radar-ping p-1"></div>
                  <div className="radar-ping p-2"></div>
                </div>
                <div className="radar-stats">
                  <div className="radar-title">NEURAL SCAN RADAR</div>
                  <div className="radar-subtitle">Scanning audio synapses...</div>
                  <div className="radar-log-item">&gt; TARGET: USER_VOICE</div>
                  <div className="radar-log-item">&gt; HZ RANGE: 100 - 8000Hz</div>
                  <div className="radar-log-item">&gt; STATUS: LOCK_ACTIVE</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'assistant' && (
            <div className="tab-content">
              <h2 className="section-title">JARVIS STATUS</h2>
              <div className="console-card-mini">
                <p className="console-welcome-mini">
                  Voice engine is operational. Say <strong>"Jarvis"</strong> or <strong>"Hey Jarvis"</strong> followed by a request, or use the Chat tab.
                </p>
                <div className="console-details">
                  <div className="detail-row">
                    <span>Neural Link:</span>
                    <span className={wsConnected ? "text-glow-green" : "text-glow-red"} style={{ color: wsConnected ? '#10b981' : '#ef4444' }}>
                      {wsConnected ? 'SECURE LINK' : 'OFFLINE'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span>AI Brain Provider:</span>
                    <span style={{ textTransform: 'uppercase', color: '#00f5ff' }}>{activeProvider}</span>
                  </div>
                  <div className="detail-row">
                    <span>Speech Input:</span>
                    <span>{speechLang === 'en-US' ? 'English (US)' : speechLang === 'hi-IN' ? 'हिन्दी (भारत)' : 'Hinglish (Mixed)'}</span>
                  </div>
                  <div className="detail-row">
                    <span>Floating Siri Mode:</span>
                    <span>{isPipActive ? 'ACTIVE' : 'STANDBY'}</span>
                  </div>
                </div>

                <div className="settings-section-title" style={{ marginTop: '20px' }}>AGENT TELEMETRY</div>
                <div className="agent-telemetry-panel">
                  <div className="agent-badge-row">
                    <span>COORDINATOR:</span>
                    <span className={`badge-status ${agentStates.COORDINATOR || 'idle'}`}>{agentStates.COORDINATOR?.toUpperCase() || 'IDLE'}</span>
                  </div>
                  <div className="agent-badge-row">
                    <span>PLANNER:</span>
                    <span className={`badge-status ${agentStates.PLANNING || 'idle'}`}>{agentStates.PLANNING?.toUpperCase() || 'IDLE'}</span>
                  </div>
                  <div className="agent-badge-row">
                    <span>SYSTEM:</span>
                    <span className={`badge-status ${agentStates.SYSTEM || 'idle'}`}>{agentStates.SYSTEM?.toUpperCase() || 'IDLE'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="tab-content">
              <h2 className="section-title">LONG-TERM MEMORY</h2>
              
              {/* Document ingestion form */}
              <div className="console-card-mini" style={{ marginBottom: '8px' }}>
                <div className="settings-section-title" style={{ marginTop: '0' }}>LEARN DOCUMENT (RAG)</div>
                <p className="console-welcome-mini" style={{ fontSize: '12px', marginBottom: '10px' }}>
                  Index a PDF, TXT, or MD file to chunk it and feed it into local ChromaDB memory.
                </p>
                <div className="chat-input-container" style={{ padding: '0', background: 'transparent', borderTop: 'none', gap: '8px' }}>
                  <input
                    type="text"
                    className="cyber-input"
                    placeholder="Absolute file path (e.g. C:/report.pdf)..."
                    value={docPath}
                    onChange={(e) => setDocPath(e.target.value)}
                    style={{ flexGrow: 1 }}
                  />
                  <button 
                    className="chat-send-btn" 
                    onClick={handleLearnDoc}
                    disabled={isIndexingDoc || !docPath.trim()}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {isIndexingDoc ? 'LEARNING...' : 'LEARN'}
                  </button>
                </div>
              </div>

              {/* Semantic Query Search Box */}
              <div className="console-card-mini" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="settings-section-title" style={{ marginTop: '0' }}>SEARCH NOTES & DOCUMENTS</div>
                <div className="chat-input-container" style={{ padding: '0', background: 'transparent', borderTop: 'none', gap: '8px' }}>
                  <input
                    type="text"
                    className="cyber-input"
                    placeholder="Search query (e.g. Manish project)..."
                    value={memQuery}
                    onChange={(e) => setMemQuery(e.target.value)}
                    style={{ flexGrow: 1 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleMemorySearch()
                    }}
                  />
                  <button 
                    className="chat-send-btn" 
                    onClick={handleMemorySearch}
                    disabled={!memQuery.trim()}
                  >
                    SEARCH
                  </button>
                </div>

                {/* Query Results */}
                {memResults.length > 0 && (
                  <div className="settings-section-title" style={{ marginTop: '10px', marginBottom: '4px' }}>SEARCH RESULTS</div>
                )}
                <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {memResults.map((result, idx) => (
                    <div key={idx} style={{ 
                      background: 'rgba(255, 255, 255, 0.02)', 
                      border: '1px solid rgba(255, 255, 255, 0.05)', 
                      borderRadius: '10px', 
                      padding: '10px 12px',
                      fontSize: '13px',
                      fontFamily: 'Rajdhani, sans-serif'
                    }}>
                      <div style={{ color: '#00f5ff', fontWeight: 'bold', fontSize: '10px', fontFamily: 'Orbitron, sans-serif', display: 'flex', justifyContent: 'space-between' }}>
                        <span>MATCH #{idx + 1}</span>
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>L2 DIST: {result.distance.toFixed(3)}</span>
                      </div>
                      <p style={{ margin: '6px 0 0 0', color: 'rgba(255, 255, 255, 0.85)', lineHeight: '135%' }}>{result.content}</p>
                      {result.metadata && result.metadata.source && (
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '6px', fontFamily: 'Share Tech Mono, monospace' }}>
                          Source: {result.metadata.source}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Stored Knowledgebase inspector */}
              <div className="console-card-mini" style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div className="settings-section-title" style={{ marginTop: '0', marginBottom: '0' }}>STORED KNOWLEDGEBASE</div>
                  <button className="cyber-btn" onClick={refreshFacts} style={{ fontSize: '10px', padding: '2px 8px' }}>REFRESH</button>
                </div>
                {factsList.length === 0 ? (
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', margin: '0' }}>No local facts recorded in memory yet.</p>
                ) : (
                  <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {factsList.map((fact) => (
                      <div key={fact.id} style={{ 
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderLeft: '2px solid var(--accent)',
                        borderRadius: '4px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div style={{ flexGrow: 1, marginRight: '10px', color: 'rgba(255, 255, 255, 0.85)' }}>
                          {fact.content}
                        </div>
                        <button 
                          onClick={() => {
                            if (wsRef.current) {
                              wsRef.current.send(JSON.stringify({
                                event: 'text_command',
                                data: { text: `delete memory id ${fact.id}` }
                              }))
                              setFactsList(prev => prev.filter(f => f.id !== fact.id))
                            }
                          }} 
                          style={{ 
                            background: 'transparent', 
                            border: 'none', 
                            color: '#ef4444', 
                            cursor: 'pointer',
                            fontSize: '11px' 
                          }}
                        >
                          DELETE
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div className="tab-content">
              <h2 className="section-title">DIAGNOSTICS LOGS</h2>
              <div className="terminal-container-mini">
                <div className="terminal-body-mini">
                  {logs.map((log, index) => (
                    <div key={index} className="terminal-line-mini">
                      <span className="log-time">[{log.time}]</span>
                      <span className={`log-type type-${log.type.toLowerCase()}`}>{log.type}</span>
                      <span className="log-msg">{log.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="tab-content">
              <h2 className="section-title">SYSTEM SETTINGS</h2>
              <div className="settings-container-mini" style={{ overflowY: 'auto', maxHeight: '420px', paddingRight: '6px' }}>
                
                {/* AI Keys & Provider Selection */}
                <div className="settings-section-title">AI BRAIN CONFIG</div>
                
                <div className="settings-item-col">
                  <span className="settings-label">AI Brain Provider</span>
                  <select 
                    value={activeProvider} 
                    onChange={(e) => setActiveProvider(e.target.value)}
                    className="cyber-select"
                  >
                    <option value="gemini">Google Gemini (Accurate & Smart)</option>
                    <option value="groq">Groq Llama 3 (Ultra Fast)</option>
                  </select>
                </div>

                <div className="settings-item-col">
                  <span className="settings-label">Google Gemini API Key</span>
                  <input 
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="Enter Gemini API key..."
                    className="cyber-input"
                  />
                </div>

                <div className="settings-item-col">
                  <span className="settings-label">Groq API Key</span>
                  <input 
                    type="password"
                    value={groqKey}
                    onChange={(e) => setGroqKey(e.target.value)}
                    placeholder="Enter Groq API key..."
                    className="cyber-input"
                  />
                </div>

                {/* Voice Pipeline Configurations */}
                <div className="settings-section-title" style={{ marginTop: '12px' }}>AURAL INTERFACE</div>

                <div className="settings-item">
                  <span className="settings-label">Continuous Listening</span>
                  <button 
                    className={`settings-toggle ${autoListen ? 'active' : ''}`}
                    onClick={() => setAutoListen(!autoListen)}
                  >
                    <span className="toggle-slider"></span>
                  </button>
                </div>

                <div className="settings-item-col">
                  <span className="settings-label">Microphone Input Device</span>
                  <select 
                    value={selectedAudioDevice} 
                    onChange={(e) => setSelectedAudioDevice(e.target.value)}
                    className="cyber-select"
                  >
                    {audioDevices.length === 0 ? (
                      <option value="">Default Microphone</option>
                    ) : (
                      audioDevices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone (${d.deviceId.slice(0, 5)}...)`}</option>
                      ))
                    )}
                  </select>
                </div>

                <div className="settings-item-col">
                  <span className="settings-label">Real-Time Volume Monitor</span>
                  <div className="volume-meter-container">
                    <div id="volume-meter-fill" className="volume-meter-fill" style={{ width: '0%' }}></div>
                  </div>
                </div>

                <div className="settings-item" style={{ padding: '8px 0' }}>
                  <span className="settings-label">Noise Gate Calibration</span>
                  <button 
                    onClick={handleCalibrate} 
                    className="cyber-btn"
                    disabled={isCalibrating}
                  >
                    {isCalibrating ? 'CALIBRATING...' : 'CALIBRATE MIC'}
                  </button>
                </div>

                <div className="settings-item-slider">
                  <div className="slider-label-row">
                    <span className="settings-label">Speech Synthesis Volume</span>
                    <span className="slider-val">{voiceVol}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={voiceVol}
                    onChange={(e) => setVoiceVol(e.target.value)}
                    className="settings-slider"
                  />
                </div>

                <div className="settings-item-col">
                  <span className="settings-label">Voice Accent / Language</span>
                  <select 
                    value={speechLang} 
                    onChange={(e) => setSpeechLang(e.target.value)}
                    className="cyber-select"
                  >
                    <option value="en-US">English (US)</option>
                    <option value="en-IN">Hinglish / Indian English</option>
                    <option value="hi-IN">हिन्दी (भारत)</option>
                  </select>
                </div>

                {/* Aesthetics */}
                <div className="settings-section-title" style={{ marginTop: '12px' }}>AESTHETICS</div>

                <div className="settings-item">
                  <span className="settings-label">Pulse Sphere Accent</span>
                  <div className="theme-selectors">
                    {['cyan', 'purple', 'green', 'red'].map(color => (
                      <button
                        key={color}
                        className={`theme-dot color-${color} ${blobColor === color ? 'active' : ''}`}
                        onClick={() => {
                          setBlobColor(color)
                          document.documentElement.style.setProperty('--accent', color === 'cyan' ? '#00f5ff' : color === 'purple' ? '#a855f7' : color === 'green' ? '#22c55e' : '#ef4444')
                        }}
                      ></button>
                    ))}
                  </div>
                </div>

                <div className="settings-item-slider">
                  <div className="slider-label-row">
                    <span className="settings-label">Blink Response Intensity</span>
                    <span className="slider-val">{blinkIntensity.toFixed(1)}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.2" 
                    max="3.0" 
                    step="0.1"
                    value={blinkIntensity}
                    onChange={(e) => setBlinkIntensity(parseFloat(e.target.value))}
                    className="settings-slider"
                  />
                </div>

                <div className="settings-item-slider">
                  <div className="slider-label-row">
                    <span className="settings-label">Sphere Base Diameter</span>
                    <span className="slider-val">{blobSize}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="60" 
                    max="140" 
                    step="5"
                    value={blobSize}
                    onChange={(e) => setBlobSize(parseInt(e.target.value))}
                    className="settings-slider"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {pendingApproval && (
        <div className="security-approval-overlay">
          <div className="security-approval-modal">
            <div className="security-approval-header">
              <svg className="security-icon" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h2>SECURITY AUTHORIZATION REQUIRED</h2>
            </div>
            <div className="security-approval-body">
              <p>An autonomous agent is attempting to execute a restricted action:</p>
              <div className="action-details">
                <strong>Action:</strong> <span>{pendingApproval.actionType}</span>
                {pendingApproval.payload && Object.keys(pendingApproval.payload).length > 0 && (
                  <>
                    <br />
                    <strong>Parameters:</strong> <pre>{JSON.stringify(pendingApproval.payload, null, 2)}</pre>
                  </>
                )}
              </div>
              <p className="warning-text">Warning: Destructive actions cannot be undone. Do you authorize this transaction?</p>
            </div>
            <div className="security-approval-footer">
              <button className="approve-btn" onClick={() => handleApprovalResponse(true)}>AUTHORIZE</button>
              <button className="deny-btn" onClick={() => handleApprovalResponse(false)}>DENY</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
