import BaseAgent from './base_agent.js';
import permissionsManager from '../core/permissions.js';
import eventBus from '../core/event_bus.js';
import fs from 'fs/promises';
import path from 'path';

class CodingAgent extends BaseAgent {
  constructor() {
    super('CODING');
    this.workspaceRoot = 'c:/Users/Manish/OneDrive/Desktop/JARVIS';
  }

  async execute(action, params, rawText) {
    console.log(`[CODING_AGENT] Executing action: ${action}`, params);

    switch (action) {
      case 'CREATE_FILE':
        return this.createFile(params.filePath, params.content);
      case 'READ_FILE':
        return this.readFile(params.filePath);
      case 'APPEND_FILE':
        return this.appendFile(params.filePath, params.content);
      case 'DELETE_FILE':
        return this.deleteFile(params.filePath);
      default:
        throw new Error(`Unsupported coding action "${action}"`);
    }
  }

  resolvePath(file) {
    if (path.isAbsolute(file)) {
      return file;
    }
    return path.join(this.workspaceRoot, file);
  }

  async createFile(filePath, content) {
    const targetPath = this.resolvePath(filePath);
    console.log(`[CODING_AGENT] Creating file at: ${targetPath}`);

    const approved = await permissionsManager.requestExecutionPermission('WRITE_FILE', { filePath: targetPath, size: content.length });
    if (!approved) throw new Error(`Permission to write file ${filePath} was denied.`);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, 'utf8');

    eventBus.publish('speak_response', { text: `Successfully created file ${path.basename(filePath)}.` });
    return { status: 'success', filePath: targetPath, bytes: content.length };
  }

  async readFile(filePath) {
    const targetPath = this.resolvePath(filePath);
    console.log(`[CODING_AGENT] Reading file from: ${targetPath}`);

    const data = await fs.readFile(targetPath, 'utf8');
    return { status: 'success', content: data };
  }

  async appendFile(filePath, content) {
    const targetPath = this.resolvePath(filePath);
    console.log(`[CODING_AGENT] Appending to file: ${targetPath}`);

    const approved = await permissionsManager.requestExecutionPermission('WRITE_FILE', { filePath: targetPath, action: 'append' });
    if (!approved) throw new Error(`Permission to append file ${filePath} was denied.`);

    await fs.appendFile(targetPath, content, 'utf8');
    return { status: 'success', filePath: targetPath };
  }

  async deleteFile(filePath) {
    const targetPath = this.resolvePath(filePath);
    console.log(`[CODING_AGENT] Deleting file: ${targetPath}`);

    const approved = await permissionsManager.requestExecutionPermission('DELETE_FILE', { filePath: targetPath });
    if (!approved) throw new Error(`Permission to delete file ${filePath} was denied.`);

    await fs.unlink(targetPath);
    return { status: 'success', msg: `File ${path.basename(filePath)} deleted.` };
  }
}

const codingAgent = new CodingAgent();
export default codingAgent;
export { codingAgent };
