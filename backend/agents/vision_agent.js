import BaseAgent from './base_agent.js';
import eventBus from '../core/event_bus.js';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class VisionAgent extends BaseAgent {
  constructor() {
    super('VISION');
    this.logsDir = 'c:/Users/Manish/OneDrive/Desktop/JARVIS/logs';
  }

  async execute(action, params, rawText) {
    console.log(`[VISION_AGENT] Executing action: ${action}`, params);

    switch (action) {
      case 'EXPLAIN_SCREEN':
        return this.explainScreen(rawText);
      case 'CAPTURE_WEBCAM':
        return this.explainWebcam(rawText);
      default:
        throw new Error(`Unsupported vision action "${action}"`);
    }
  }

  async explainScreen(promptText) {
    eventBus.publish('diagnostic_log', { type: 'INFO', msg: 'Capturing current system screen...' });
    try {
      const screenshotPath = await this.captureSystemScreenshot();
      
      eventBus.publish('diagnostic_log', { type: 'INFO', msg: 'Analyzing screen via Gemini Vision API...' });
      const analysis = await this.analyzeImageWithGemini(
        screenshotPath,
        'Describe in 1 or 2 sentences what is on my screen right now.'
      );

      eventBus.publish('speak_response', { text: analysis });
      return { status: 'success', analysis, imagePath: screenshotPath };
    } catch (err) {
      console.error('[VISION_AGENT] Screen explanation failed:', err.message);
      throw err;
    }
  }

  async explainWebcam(promptText) {
    eventBus.publish('diagnostic_log', { type: 'INFO', msg: 'Capturing frame from webcam...' });
    try {
      const webcamPath = await this.captureWebcamFrame();
      
      eventBus.publish('diagnostic_log', { type: 'INFO', msg: 'Analyzing webcam capture via Gemini Vision API...' });
      const analysis = await this.analyzeImageWithGemini(
        webcamPath,
        'Describe what you see in this webcam picture in 1-2 sentences.'
      );

      eventBus.publish('speak_response', { text: analysis });
      return { status: 'success', analysis, imagePath: webcamPath };
    } catch (err) {
      console.error('[VISION_AGENT] Webcam capture failed:', err.message);
      throw err;
    }
  }

  async captureSystemScreenshot() {
    await fs.mkdir(this.logsDir, { recursive: true });
    const fileLocation = path.join(this.logsDir, `screen_${Date.now()}.png`);
    
    // Replace backslashes for PowerShell command argument formatting
    const formattedPath = fileLocation.replace(/\\/g, '\\\\');

    const psCmd = `
      [Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null
      [Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
      $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bmp)
      $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
      $bmp.Save('${formattedPath}', [System.Drawing.Imaging.ImageFormat]::Png)
      $graphics.Dispose()
      $bmp.Dispose()
    `.replace(/\n/g, ' ');

    return new Promise((resolve, reject) => {
      exec(`powershell -Command "${psCmd}"`, (err) => {
        if (err) {
          reject(new Error(`Failed to capture system screenshot: ${err.message}`));
        } else {
          resolve(fileLocation);
        }
      });
    });
  }

  async captureWebcamFrame() {
    const scriptPath = path.join(__dirname, '../vision/capture_webcam.py');
    return new Promise((resolve, reject) => {
      exec(`python "${scriptPath}"`, (err, stdout) => {
        if (err) {
          reject(new Error(`Webcam capture failed: ${err.message}`));
        } else {
          try {
            const res = JSON.parse(stdout.trim());
            if (res.status === 'success') {
              resolve(res.filePath);
            } else {
              reject(new Error(res.error || 'Failed to capture webcam frame'));
            }
          } catch (e) {
            reject(new Error(`Failed parsing webcam script output: ${stdout}`));
          }
        }
      });
    });
  }

  async analyzeImageWithGemini(imagePath, promptText) {
    const geminiKey = process.env.GEMINI_API_KEY || '';
    if (!geminiKey) {
      console.warn('[VISION] Gemini API key is missing.');
      return 'I captured the picture, but I need a valid Gemini API Key configured in your settings to analyze it.';
    }

    try {
      const imgData = await fs.readFile(imagePath);
      const base64Image = imgData.toString('base64');
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Image
                  }
                }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: 150
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini Vision API error: status ${response.status}`);
      }

      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text || 'I see the image, but I could not formulate a description.';
    } catch (e) {
      console.error('[VISION] Gemini analysis error:', e.message);
      return `Failed to analyze screenshot: ${e.message}`;
    }
  }
}

const visionAgent = new VisionAgent();
export default visionAgent;
export { visionAgent };
