import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs/promises';

class BrowserController {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.screenshotDir = 'c:/Users/Manish/OneDrive/Desktop/JARVIS/logs';
  }

  async getPage() {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    console.log('[BROWSER] Launching Chromium instance...');
    this.browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    this.page = await this.context.newPage();
    return this.page;
  }

  async close() {
    if (this.browser) {
      console.log('[BROWSER] Closing Chromium instance.');
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  async execute(action, params) {
    const page = await this.getPage();

    switch (action) {
      case 'BROWSER_NAVIGATE':
        console.log(`[BROWSER] Navigating to: ${params.url}`);
        await page.goto(params.url, { waitUntil: 'load', timeout: 30000 });
        return { status: 'success', title: await page.title(), url: page.url() };

      case 'BROWSER_CLICK':
        console.log(`[BROWSER] Clicking element: ${params.selector}`);
        await page.waitForSelector(params.selector, { timeout: 10000 });
        await page.click(params.selector);
        return { status: 'success' };

      case 'BROWSER_TYPE':
        console.log(`[BROWSER] Filling element ${params.selector} with: "${params.text}"`);
        await page.waitForSelector(params.selector, { timeout: 10000 });
        await page.fill(params.selector, params.text);
        return { status: 'success' };

      case 'BROWSER_SCREENSHOT':
        await fs.mkdir(this.screenshotDir, { recursive: true });
        const filename = params.fileName || `browser_shot_${Date.now()}.png`;
        const shotPath = path.join(this.screenshotDir, filename);
        console.log(`[BROWSER] Capture screenshot to: ${shotPath}`);
        await page.screenshot({ path: shotPath });
        return { status: 'success', filePath: shotPath };

      default:
        throw new Error(`Unknown browser action: ${action}`);
    }
  }
}

const browserController = new BrowserController();
export default browserController;
export { browserController };
