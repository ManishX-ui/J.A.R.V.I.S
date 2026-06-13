# J.A.R.V.I.S. (Just A Rather Very Intelligent System) 🤖✨

A futuristic, highly responsive, voice-activated virtual assistant interface built with a modern React frontend and an Express backend. JARVIS integrates real-time web speech recognition, local storage API key configuration, a sleek neon/glassmorphism design, custom visualizations, and real-time diagnostic consoles.

---

## 🌟 Key Features

*   🎙️ **Interactive Voice Agent**: Seamless voice recognition (English/Hindi support) utilizing browser speech recognition and integration with LLM intelligence.
*   🔮 **Synaptic Pulse Blob Visualizer**: A beautiful, glowing SVG-based micro-animation sphere that pulses dynamically in sync with speech recognition states and microphone input.
*   📡 **Neural Scan Radar**: A futuristic, radar-style tracking widget simulating microphone signal scans.
*   📊 **System Health Monitor**: A dashboard showcasing real-time simulated telemetry for CPU, RAM utility, core temperatures, and network ping.
*   🛠️ **Futuristic Diagnostic Logs**: A scrolling live console outputting real-time security logs, system diagnostics, and communication logs.
*   🎨 **Customization Settings**:
    *   Dynamic accent color themes (Cyan, Purple, Green, Red).
    *   Blink response intensity & core sphere size adjustments.
    *   Feedback volume controller.
    *   Safe input field to save/update Groq API key locally in your browser storage.

---

## 🛠️ Technology Stack

*   **Frontend**: React (Vite-powered), Vanilla CSS (Custom neon themes & keyframe animations), HTML5.
*   **Backend**: Node.js, Express.js, CORS.

---

## 🚀 Setup & Installation

### Prerequisites

*   Node.js (v18 or higher recommended)
*   NPM (v9 or higher)

### 1. Clone & Navigate
```bash
git clone https://github.com/ManishX-ui/J.A.R.V.I.S.git
cd J.A.R.V.I.S
```

### ⚡ Quick Start (Windows)
To automatically launch the Frontend, Backend, and Voice Daemon concurrently, simply double-click the `start_jarvis.bat` script at the root directory of the project.

Alternatively, follow the manual steps below:

### 2. Backend Setup
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the backend server:
   ```bash
   npm start
   ```
   *(Running at `http://localhost:5000`)*

### 3. Frontend Setup
1. Navigate to the `frontend/` directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run in development mode:
   ```bash
   npm run dev
   ```
   *(Usually runs at `http://localhost:5173`)*

---

## 🔑 Configuration & Usage

1. Open the web interface in your browser (Chrome or Edge are highly recommended for SpeechRecognition).
2. Go to the **Settings** tab on the dashboard.
3. Paste your custom **Groq API Key** and click **Save**. *(Note: Keys are saved securely in your local browser storage and never sent to any server other than directly to the Groq API).*
4. Tap the central glowing sphere to wake JARVIS, say "Hello", and enjoy talking to your custom virtual assistant!

---

## 📁 Project Structure

```
JARVIS/
├── backend/
│   ├── server.js            # Express server configuration
│   ├── package.json         # Backend dependencies
│   └── node_modules/
└── frontend/
    ├── src/
    │   ├── App.js           # Core layout and state controller
    │   ├── App.css          # Neon styling, dashboards & settings UI
    │   ├── index.js         # Entry point
    │   └── components/
    │       ├── Nabbar.js    # Futuristic navigation tab layout
    │       ├── Nabbar.css   # Liquid glass navbar styling
    │       └── blob.js      # Synaptic Voice Pulse Blob engine & Speech API
    ├── vite.config.js       # Vite configuration
    └── package.json         # Frontend dependencies
```

---

## 📜 License

This project is licensed under the MIT License. Created by [ManishX-ui](https://github.com/ManishX-ui).
