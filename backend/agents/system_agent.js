import BaseAgent from './base_agent.js';
import permissionsManager from '../core/permissions.js';
import taskQueue from '../core/queue.js';
import eventBus from '../core/event_bus.js';
import { exec } from 'child_process';

class SystemAgent extends BaseAgent {
  constructor() {
    super('SYSTEM');
  }

  async execute(action, params, rawText) {
    console.log(`[SYSTEM_AGENT] Executing action: ${action}`, params);

    // Queue action to prevent concurrency locks
    return new Promise((resolve, reject) => {
      taskQueue.addTask(`System_${action}`, async () => {
        try {
          const result = await this.handleSystemAction(action, params);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async handleSystemAction(action, params) {
    // 1. Safety check
    const isApproved = await permissionsManager.requestExecutionPermission(action, params);
    if (!isApproved) {
      throw new Error(`Execution of command "${action}" was blocked by the security system.`);
    }

    // 2. Perform system operations
    switch (action) {
      case 'RUN_APP':
        return this.runApp(params.app);
      case 'VOLUME_CONTROL':
        return this.adjustVolume(params.direction, params.level);
      case 'LOCK_SCREEN':
        return this.lockWindowsScreen();
      case 'CAPTURE_SCREEN':
        return this.captureScreenshot();
      case 'SHUTDOWN':
        return this.shutdownOS();
      case 'RESTART':
        return this.restartOS();
      case 'BRIGHTNESS_CONTROL':
        return this.adjustBrightness(params.level);
      case 'MUTE_CONTROL':
        return this.toggleMute(params.mute);
      default:
        throw new Error(`Unsupported action type "${action}"`);
    }
  }

  runApp(app) {
    const allowed = ['notepad', 'calc', 'calculator', 'mspaint', 'paint', 'explorer', 'cmd', 'taskmgr'];
    const matched = allowed.find(a => app.toLowerCase().includes(a));
    if (!matched) {
      throw new Error(`Application "${app}" is not in the safe whitelist.`);
    }
    const executable = matched === 'calc' || matched === 'calculator' ? 'calc' : matched;
    
    return new Promise((resolve, reject) => {
      exec(`start ${executable}`, (err) => {
        if (err) {
          reject(new Error(`Failed to start application ${executable}: ${err.message}`));
        } else {
          eventBus.publish('speak_response', { text: `Opening ${executable}.` });
          resolve({ status: 'success', msg: `Launched ${executable}` });
        }
      });
    });
  }

  adjustVolume(direction, level) {
    // Volume adjustment via NirCmd or PowerShell Audio controls
    // Here we can use a quick PowerShell script to adjust sound volume
    let psCommand = '';
    if (direction === 'UP') {
      psCommand = '(New-Object -ComObject WScript.Shell).SendKeys([char]175)'; // Volume Up key
    } else if (direction === 'DOWN') {
      psCommand = '(New-Object -ComObject WScript.Shell).SendKeys([char]174)'; // Volume Down key
    } else {
      psCommand = '(New-Object -ComObject WScript.Shell).SendKeys([char]173)'; // Volume Mute key
    }

    return new Promise((resolve, reject) => {
      exec(`powershell -Command "${psCommand}"`, (err) => {
        if (err) {
          reject(new Error(`Failed to adjust volume: ${err.message}`));
        } else {
          eventBus.publish('speak_response', { text: `Adjusting system volume.` });
          resolve({ status: 'success', msg: 'Volume updated.' });
        }
      });
    });
  }

  lockWindowsScreen() {
    return new Promise((resolve, reject) => {
      exec('rundll32.exe user32.dll,LockWorkStation', (err) => {
        if (err) {
          reject(new Error(`Failed to lock workstation: ${err.message}`));
        } else {
          resolve({ status: 'success', msg: 'Workstation locked' });
        }
      });
    });
  }

  captureScreenshot() {
    // Quick powershell script to capture screenshot
    const fileLocation = `c:\\Users\\Manish\\OneDrive\\Desktop\\JARVIS\\logs\\screenshot_${Date.now()}.png`;
    const psCmd = `
      [Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null
      [Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
      $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bmp)
      $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
      $bmp.Save('${fileLocation}', [System.Drawing.Imaging.ImageFormat]::Png)
      $graphics.Dispose()
      $bmp.Dispose()
    `.replace(/\n/g, ' ');

    return new Promise((resolve, reject) => {
      exec(`powershell -Command "${psCmd}"`, (err) => {
        if (err) {
          reject(new Error(`Failed to capture screen: ${err.message}`));
        } else {
          eventBus.publish('speak_response', { text: 'Screenshot captured and saved to logs.' });
          resolve({ status: 'success', file: fileLocation });
        }
      });
    });
  }

  shutdownOS() {
    return new Promise((resolve, reject) => {
      exec('shutdown /s /t 60', (err) => { // 60 seconds delay to allow cancel if needed
        if (err) {
          reject(new Error(`Shutdown failed: ${err.message}`));
        } else {
          eventBus.publish('speak_response', { text: 'System shutdown scheduled in 60 seconds.' });
          resolve({ status: 'success', msg: 'Shutdown scheduled' });
        }
      });
    });
  }

  restartOS() {
    return new Promise((resolve, reject) => {
      exec('shutdown /r /t 60', (err) => {
        if (err) {
          reject(new Error(`Restart failed: ${err.message}`));
        } else {
          eventBus.publish('speak_response', { text: 'System restart scheduled in 60 seconds.' });
          resolve({ status: 'success', msg: 'Restart scheduled' });
        }
      });
    });
  }

  adjustBrightness(level) {
    const val = Math.max(0, Math.min(100, parseInt(level || 50)));
    const psCmd = `Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 0; Brightness = ${val} }`;
    
    return new Promise((resolve, reject) => {
      exec(`powershell -Command "${psCmd}"`, (err) => {
        if (err) {
          reject(new Error(`Failed to set system brightness: ${err.message}`));
        } else {
          eventBus.publish('speak_response', { text: `Setting brightness to ${val} percent.` });
          resolve({ status: 'success', level: val });
        }
      });
    });
  }

  toggleMute(mute) {
    const psCommand = '(New-Object -ComObject WScript.Shell).SendKeys([char]173)';
    return new Promise((resolve, reject) => {
      exec(`powershell -Command "${psCommand}"`, (err) => {
        if (err) {
          reject(new Error(`Failed to toggle system mute: ${err.message}`));
        } else {
          const actionText = mute ? 'Muting' : 'Toggling mute';
          eventBus.publish('speak_response', { text: `${actionText} system volume.` });
          resolve({ status: 'success', msg: 'Mute toggled' });
        }
      });
    });
  }
}

const systemAgent = new SystemAgent();
export default systemAgent;
