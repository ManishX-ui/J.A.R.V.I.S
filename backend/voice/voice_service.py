import os
import sys
import time
import json
import asyncio
import threading
import queue
import numpy as np
import sounddevice as sd
import websockets
import pyttsx3

# Configuration variables
WS_URI = "ws://localhost:5000"
CHUNK_SIZE = 1024
CHANNELS = 1
RATE = 16000

# Wake words matching
WAKE_WORDS = ["jarvis", "hey jarvis", "okay jarvis", "ok jarvis", "hello jarvis", "जार्विस"]

class JarvisVoiceService:
  def __init__(self):
    self.running = True
    self.ws = None
    self.audio_queue = queue.Queue()
    self.is_speaking = False
    
    # Initialize pyttsx3 SAPI5 Speech Engine
    self.engine = pyttsx3.init()
    self.engine.setProperty('rate', 170)  # slightly faster for slick assistant tone
    self.engine.setProperty('volume', 1.0)
    
    # Set default noise gate threshold
    self.noise_threshold = 15.0
    self.is_calibrating = True

  async def connect_websocket(self):
    while self.running:
      try:
        print(f"[VOICE] Connecting to J.A.R.V.I.S. Core at {WS_URI}...")
        self.ws = await websockets.connect(WS_URI)
        print("[VOICE] Connected successfully to event bus!")
        
        # Start reading incoming events from server (like speaking requests)
        asyncio.create_task(self.read_websocket_events())
        break
      except Exception as e:
        print(f"[VOICE] Connection failed: {e}. Retrying in 3 seconds...")
        await asyncio.sleep(3)

  async def read_websocket_events(self):
    try:
      async for message in self.ws:
        payload = json.loads(message)
        event = payload.get("event")
        data = payload.get("data", {})
        
        if event == "speak_response":
          text = data.get("text", "")
          if text:
            self.speak_local(text)
    except websockets.exceptions.ConnectionClosed:
      print("[VOICE] Websocket connection closed. Reconnecting...")
      await self.connect_websocket()
    except Exception as e:
      print(f"[VOICE] Error in websocket listener: {e}")

  def speak_local(self, text):
    if self.is_speaking:
      self.engine.stop()
    
    self.is_speaking = True
    
    def run_tts():
      try:
        asyncio.run_coroutine_threadsafe(self.send_event("speech_start", {}), asyncio.get_event_loop())
        self.engine.say(text)
        self.engine.runAndWait()
      except Exception as e:
        print(f"[VOICE] TTS Error: {e}")
      finally:
        self.is_speaking = False
        asyncio.run_coroutine_threadsafe(self.send_event("speech_end", {}), asyncio.get_event_loop())

    threading.Thread(target=run_tts, daemon=True).start()

  async def send_event(self, event, data):
    if self.ws and self.ws.open:
      try:
        await self.ws.send(json.dumps({"event": event, "data": data}))
      except Exception as e:
        print(f"[VOICE] Failed to send websocket event: {e}")

  def calibrate_ambient_noise(self):
    print("[VOICE] Calibrating microphone. Please remain silent for 2 seconds...")
    duration = 2.0
    rec = sd.rec(int(duration * RATE), samplerate=RATE, channels=CHANNELS, dtype='int16')
    sd.wait()
    
    samples = []
    for i in range(0, len(rec), CHUNK_SIZE):
      chunk = rec[i:i+CHUNK_SIZE]
      if len(chunk) > 0:
        rms = np.sqrt(np.mean(chunk.astype(np.float64)**2))
        samples.append(rms)
        
    self.noise_threshold = max(10.0, np.mean(samples) + 8.0)
    print(f"[VOICE] Calibration complete! Gate set to: {self.noise_threshold:.2f} RMS")
    self.is_calibrating = False

  def record_loop(self):
    self.calibrate_ambient_noise()

    speaking_buffer = []
    silence_count = 0
    max_silence = int(RATE / CHUNK_SIZE * 1.5)  # 1.5s silence
    is_recording = False

    def callback(indata, frames, time_info, status):
      nonlocal speaking_buffer, silence_count, is_recording
      if status:
        print(f"[VOICE] Stream Status: {status}")
      
      audio_data = indata.flatten()
      rms = np.sqrt(np.mean(audio_data.astype(np.float64)**2))

      # Barge-in checks
      if self.is_speaking and rms > (self.noise_threshold + 30.0):
        print("[VOICE] Barge-in! Stopping TTS.")
        self.engine.stop()
        self.is_speaking = False

      if rms > self.noise_threshold:
        silence_count = 0
        if not is_recording:
          print("[VOICE] VAD: Speech Started...")
          is_recording = True
        speaking_buffer.append(audio_data.tobytes())
      elif is_recording:
        silence_count += 1
        speaking_buffer.append(audio_data.tobytes())
        if silence_count > max_silence:
          print("[VOICE] VAD: Phrase Ended. Enqueuing audio...")
          phrase_data = b"".join(speaking_buffer)
          self.audio_queue.put(phrase_data)
          is_recording = False
          speaking_buffer = []
          silence_count = 0

    print("[VOICE] Starting InputStream...")
    with sd.InputStream(samplerate=RATE, channels=CHANNELS, dtype='int16', callback=callback, blocksize=CHUNK_SIZE):
      while self.running:
        sd.sleep(100)

  async def process_audio_queue(self):
    while self.running:
      if not self.audio_queue.empty():
        audio_bytes = self.audio_queue.get()
        transcription = await self.transcribe_audio(audio_bytes)
        
        if transcription:
          print(f"[VOICE] Transcribed: \"{transcription}\"")
          cleaned = transcription.lower().strip()
          is_wake = any(w in cleaned for w in WAKE_WORDS)
          
          if is_wake:
            # Clean wake words from statement
            for w in WAKE_WORDS:
              if cleaned.startswith(w):
                transcription = transcription[len(w):].strip(", ").strip()
                break
            
            print(f"[VOICE] Wake word matched! Route text command: \"{transcription}\"")
            await self.send_event("voice_transcript", {"text": transcription, "lang": "en-US"})
          else:
            print(f"[VOICE] Wake word absent in phrase.")
      
      await asyncio.sleep(0.1)

  async def transcribe_audio(self, audio_bytes):
    try:
      import speech_recognition as sr
      import io
      import wave
      
      wav_io = io.BytesIO()
      with wave.open(wav_io, 'wb') as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(2) # 16-bit
        wav_file.setframerate(RATE)
        wav_file.writeframes(audio_bytes)
      
      wav_io.seek(0)
      r = sr.Recognizer()
      with sr.AudioFile(wav_io) as source:
        audio = r.record(source)
      
      try:
        # standard fallback online endpoint
        return r.recognize_google(audio)
      except Exception:
        return None
    except Exception as e:
      print(f"[VOICE] Transcription exception: {e}")
      return None

  async def main(self):
    await self.connect_websocket()
    threading.Thread(target=self.record_loop, daemon=True).start()
    await self.process_audio_queue()

if __name__ == "__main__":
  service = JarvisVoiceService()
  try:
    asyncio.run(service.main())
  except KeyboardInterrupt:
    print("[VOICE] Shutting down.")
    service.running = False
