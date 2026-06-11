import React, { useState, useEffect, useRef } from 'react'
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
    { time: '13:00:15', type: 'INFO', msg: 'Core system initialization sequence complete.' },
    { time: '13:00:16', type: 'SECURE', msg: 'Firewall protocols active. All ports secured.' },
    { time: '13:00:18', type: 'INFO', msg: 'Speech recognition engine listening...' },
    { time: '13:00:20', type: 'CORE', msg: 'Acoustic feedback loops calibrated.' }
  ])

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

  const handleNewMessage = (sender, text) => {
    setChatHistory(prev => [...prev, { sender, text, time: new Date().toLocaleTimeString() }])
  }

  const handleSendMessage = () => {
    if (!typedMessage.trim()) return
    if (blobRef.current) {
      blobRef.current.sendTextMessage(typedMessage)
      setTypedMessage('')
    }
  }

  useEffect(() => {
    if (activeTab === 'chat' && chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatHistory, activeTab])

  // Simulate updating stats
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

  // Simulate incoming logs in diagnostics
  useEffect(() => {
    if (activeTab !== 'diagnostics') return
    const logTypes = ['INFO', 'WARN', 'SECURE', 'CORE']
    const messages = [
      'Database connection verified.',
      'Syncing satellite uplink channels.',
      'Clearing memory cache buffers...',
      'Visual cortex node response: 200ms.',
      'Security patch 14.8.2 deployed successfully.',
      'CPU core load distributed evenly.'
    ]

    const interval = setInterval(() => {
      const type = logTypes[Math.floor(Math.random() * logTypes.length)]
      const msg = messages[Math.floor(Math.random() * messages.length)]
      const time = new Date().toLocaleTimeString()
      setLogs(prev => [
        { time, type, msg },
        ...prev.slice(0, 15) // Keep last 15 logs
      ])
    }, 3000)

    return () => clearInterval(interval)
  }, [activeTab])

  return (
    <div className="app-layout">
      {/* Liquid Glass Navbar */}
      <Nabbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area: Split layout */}
      <main className="content-container">
        
        {/* Left Side: Jarvis Voice Blob (Front Page Center) */}
        <div className="assistant-panel">
          <JarvisBlob 
            ref={blobRef}
            color={blobColor} 
            intensity={blinkIntensity} 
            size={blobSize} 
            lang={speechLang} 
            autoListen={autoListen}
            onNewMessage={handleNewMessage}
          />
        </div>

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
                    <span className="stat-detail">4 Cores Online</span>
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
                    <span className="stat-detail">14.4 GB / 32 GB</span>
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
                    <span className="stat-detail">Secure Uplink</span>
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
                  <div className="radar-log-item">&gt; HZ RANGE: 120 - 450Hz</div>
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
                  Speech engine is active. Try saying <strong>"hello"</strong>, <strong>"open google"</strong>, <strong>"open youtube"</strong>, or <strong>"time"</strong> to activate voice commands.
                </p>
                <div className="console-details">
                  <div className="detail-row">
                    <span>Uplink Status:</span>
                    <span className="text-glow-green">SECURE</span>
                  </div>
                  <div className="detail-row">
                    <span>Language:</span>
                    <span>English (US)</span>
                  </div>
                  <div className="detail-row">
                    <span>Active Protocol:</span>
                    <span>Acoustic Pulse V4</span>
                  </div>
                </div>
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
              <div className="settings-container-mini">
                <div className="settings-item">
                  <span className="settings-label">Auto-Listen Wakeup</span>
                  <button 
                    className={`settings-toggle ${autoListen ? 'active' : ''}`}
                    onClick={() => setAutoListen(!autoListen)}
                  >
                    <span className="toggle-slider"></span>
                  </button>
                </div>

                <div className="settings-item-slider">
                  <div className="slider-label-row">
                    <span className="settings-label">Feedback Volume</span>
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

                <div className="settings-item">
                  <span className="settings-label">Speech Recognition Language</span>
                  <select 
                    value={speechLang} 
                    onChange={(e) => setSpeechLang(e.target.value)}
                    style={{
                      background: 'rgba(10, 15, 26, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      padding: '6px 12px',
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: '14px',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="en-US">English (US)</option>
                    <option value="hi-IN">हिन्दी (भारत)</option>
                  </select>
                </div>

                <div className="settings-item">
                  <span className="settings-label">JARVIS Core Color</span>
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
                    <span className="settings-label">Core Sphere Base Size</span>
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
    </div>
  )
}

export default App
