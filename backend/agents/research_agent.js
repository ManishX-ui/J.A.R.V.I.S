import BaseAgent from './base_agent.js';
import eventBus from '../core/event_bus.js';

class ResearchAgent extends BaseAgent {
  constructor() {
    super('RESEARCH');
  }

  async execute(action, params, rawText) {
    console.log(`[RESEARCH_AGENT] Executing action: ${action}`, params);

    switch (action) {
      case 'WEB_SEARCH':
        return this.webSearch(params.query);
      case 'SCRAPE_URL':
        return this.scrapeUrl(params.url);
      default:
        throw new Error(`Unsupported research action "${action}"`);
    }
  }

  async webSearch(query) {
    if (!query) throw new Error('Search query is empty');
    eventBus.publish('diagnostic_log', { type: 'INFO', msg: `Searching the web for: "${query}"` });
    
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo responded with status ${response.status}`);
      }

      const html = await response.text();
      
      const snippets = [];
      const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      
      let match;
      const strippedSnippets = [];
      
      while ((match = snippetRegex.exec(html)) !== null && strippedSnippets.length < 5) {
        const text = match[1].replace(/<[^>]*>/g, '').trim();
        if (text) {
          strippedSnippets.push(text);
        }
      }

      if (strippedSnippets.length === 0) {
        // Fallback: search for any divs that might be snippets if classes change
        const genericRegex = /<div class="result__snippet">([\s\S]*?)<\/div>/g;
        while ((match = genericRegex.exec(html)) !== null && strippedSnippets.length < 5) {
          const text = match[1].replace(/<[^>]*>/g, '').trim();
          if (text) strippedSnippets.push(text);
        }
      }

      if (strippedSnippets.length === 0) {
        return `Web search executed for "${query}". No direct text snippets could be extracted automatically from the page.`;
      }

      const resultText = strippedSnippets.map((s, i) => `[Result ${i + 1}] ${s}`).join('\n\n');
      eventBus.publish('diagnostic_log', { type: 'INFO', msg: `Web search returned ${strippedSnippets.length} results.` });
      return resultText;
    } catch (err) {
      console.error('[RESEARCH_AGENT] Web search error:', err.message);
      return `Search failed for query "${query}": ${err.message}.`;
    }
  }

  async scrapeUrl(url) {
    if (!url) throw new Error('Scrape URL is empty');
    eventBus.publish('diagnostic_log', { type: 'INFO', msg: `Scraping web page: ${url}` });
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      
      const html = await response.text();
      let text = html
        .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
        .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
        
      return text.slice(0, 3000); // Return first 3000 chars
    } catch (err) {
      return `Failed to scrape page ${url}: ${err.message}`;
    }
  }
}

const researchAgent = new ResearchAgent();
export default researchAgent;
