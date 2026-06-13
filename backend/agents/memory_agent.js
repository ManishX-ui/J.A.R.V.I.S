import BaseAgent from './base_agent.js';
import eventBus from '../core/event_bus.js';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MemoryAgent extends BaseAgent {
  constructor() {
    super('MEMORY');
    this.sessionCache = []; // short-term session memory
  }

  async execute(action, params, rawText) {
    console.log(`[MEMORY_AGENT] Action requested: ${action}`, params);

    switch (action) {
      case 'REMEMBER':
        return this.remember(params.collection || 'conversations', params.content, params.metadata);
      case 'SEARCH':
        return this.search(params.collection || 'conversations', params.queryText, params.limit);
      case 'LIST':
        return this.listMemory(params.collection || 'notes');
      case 'DELETE':
        return this.deleteMemory(params.collection || 'notes', params.id);
      case 'LEARN_DOCUMENT':
        return this.learnDocument(params.filePath);
      case 'CACHE_SESSION':
        this.sessionCache.push({ text: rawText, timestamp: Date.now() });
        return { status: 'success', msg: 'Added to short-term cache.' };
      default:
        throw new Error(`Unsupported memory action "${action}"`);
    }
  }

  // Wrapper for memory_manager.py --action add
  remember(collection, content, metadata = {}) {
    const scriptPath = path.join(__dirname, '../memory/memory_manager.py');
    const docId = `mem_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const metadataStr = JSON.stringify(metadata).replace(/"/g, '\\"');
    const escapedContent = content.replace(/"/g, '\\"').replace(/\n/g, ' ');

    const command = `python -u "${scriptPath}" --action add --collection "${collection}" --id "${docId}" --content "${escapedContent}" --metadata "${metadataStr}"`;
    
    return new Promise((resolve, reject) => {
      exec(command, (err, stdout) => {
        if (err) {
          reject(new Error(`Failed to store memory: ${err.message}`));
        } else {
          try {
            const result = JSON.parse(stdout.trim());
            if (result.error) {
              reject(new Error(result.error));
            } else {
              eventBus.publish('diagnostic_log', { type: 'INFO', msg: `Saved memory fact to local ChromaDB: "${content.slice(0, 40)}..."` });
              resolve(result);
            }
          } catch (e) {
            reject(new Error(`Failed to parse memory output: ${stdout}`));
          }
        }
      });
    });
  }

  // Wrapper for memory_manager.py --action query
  search(collection, queryText, limit = 3) {
    const scriptPath = path.join(__dirname, '../memory/memory_manager.py');
    const escapedQuery = queryText.replace(/"/g, '\\"');
    const command = `python -u "${scriptPath}" --action query --collection "${collection}" --content "${escapedQuery}" --limit ${limit}`;

    return new Promise((resolve, reject) => {
      exec(command, (err, stdout) => {
        if (err) {
          reject(new Error(`Failed to query memory: ${err.message}`));
        } else {
          try {
            const result = JSON.parse(stdout.trim());
            if (result.error) {
              reject(new Error(result.error));
            } else {
              resolve(result.results || []);
            }
          } catch (e) {
            reject(new Error(`Failed to parse query output: ${stdout}`));
          }
        }
      });
    });
  }

  // Wrapper for document_parser.py
  async learnDocument(filePath) {
    const parserScript = path.join(__dirname, '../memory/document_parser.py');
    const command = `python -u "${parserScript}" --file "${filePath}"`;

    eventBus.publish('diagnostic_log', { type: 'CORE', msg: `Ingesting document file: ${path.basename(filePath)}` });

    const chunks = await new Promise((resolve, reject) => {
      exec(command, (err, stdout) => {
        if (err) {
          reject(new Error(`Failed parsing document: ${err.message}`));
        } else {
          try {
            const result = JSON.parse(stdout.trim());
            if (result.error) {
              reject(new Error(result.error));
            } else {
              resolve(result.chunks || []);
            }
          } catch (e) {
            reject(new Error(`Failed parsing output: ${stdout}`));
          }
        }
      });
    });

    console.log(`[MEMORY_AGENT] Extracted ${chunks.length} chunks. Indexing...`);
    
    // Store chunks into ChromaDB index
    let count = 0;
    for (const chunk of chunks) {
      await this.remember('documents', chunk, { source: filePath, chunk_index: count });
      count++;
    }

    eventBus.publish('speak_response', { text: `Document ingested successfully. Analyzed and structured ${chunks.length} segments.` });
    return { status: 'success', chunks_indexed: chunks.length };
  }

  listMemory(collection) {
    const scriptPath = path.join(__dirname, '../memory/memory_manager.py');
    const command = `python -u "${scriptPath}" --action list --collection "${collection}"`;

    return new Promise((resolve, reject) => {
      exec(command, (err, stdout) => {
        if (err) {
          reject(new Error(`Failed to list memory: ${err.message}`));
        } else {
          try {
            const result = JSON.parse(stdout.trim());
            if (result.error) {
              reject(new Error(result.error));
            } else {
              resolve(result.results || []);
            }
          } catch (e) {
            reject(new Error(`Failed to parse list output: ${stdout}`));
          }
        }
      });
    });
  }

  deleteMemory(collection, docId) {
    const scriptPath = path.join(__dirname, '../memory/memory_manager.py');
    const command = `python -u "${scriptPath}" --action delete --collection "${collection}" --id "${docId}"`;

    return new Promise((resolve, reject) => {
      exec(command, (err, stdout) => {
        if (err) {
          reject(new Error(`Failed to delete memory: ${err.message}`));
        } else {
          try {
            const result = JSON.parse(stdout.trim());
            if (result.error) {
              reject(new Error(result.error));
            } else {
              eventBus.publish('diagnostic_log', { type: 'INFO', msg: `Deleted memory fact ID: ${docId}` });
              resolve(result);
            }
          } catch (e) {
            reject(new Error(`Failed to parse delete output: ${stdout}`));
          }
        }
      });
    });
  }
}

const memoryAgent = new MemoryAgent();
export default memoryAgent;
