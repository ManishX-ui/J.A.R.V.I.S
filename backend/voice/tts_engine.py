import sys
import pyttsx3

def speak(text, rate=170, volume=1.0):
  try:
    engine = pyttsx3.init()
    engine.setProperty('rate', rate)
    engine.setProperty('volume', volume)
    print(f"[TTS] Speaking phrase: \"{text}\"")
    engine.say(text)
    engine.runAndWait()
  except Exception as e:
    print(f"[TTS] Error: {e}")

if __name__ == "__main__":
  if len(sys.argv) > 1:
    phrase = " ".join(sys.argv[1:])
    speak(phrase)
  else:
    speak("Text to speech engine ready.")
