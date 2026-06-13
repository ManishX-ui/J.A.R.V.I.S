import eventBus from './event_bus.js';

// Action types categorized by danger level
export const ActionSafety = {
  SAFE: 'SAFE',
  DANGEROUS: 'DANGEROUS',
};

class JarvisPermissionsManager {
  constructor() {
    // Operations that require explicit verification
    this.dangerousCommands = [
      'SHUTDOWN',
      'RESTART',
      'DELETE_FILE',
      'DELETE_FOLDER',
      'EXECUTE_SHELL',
      'MODIFY_NETWORK',
      'WRITE_FILE', // bulk file operations can be dangerous
    ];
  }

  /**
   * Evaluates if an action is dangerous and requires user confirmation
   * @param {string} actionType - The type of command action (e.g. EXECUTE_SHELL)
   * @returns {string} ActionSafety classification
   */
  classifyAction(actionType) {
    if (this.dangerousCommands.includes(actionType.toUpperCase())) {
      return ActionSafety.DANGEROUS;
    }
    return ActionSafety.SAFE;
  }

  /**
   * Request permission for an action. If dangerous, publishes an approval request.
   * @param {string} actionType - The command action identifier
   * @param {object} payload - Metadata details about the action
   * @returns {Promise<boolean>} Resolves to true if approved/safe, false if rejected
   */
  async requestExecutionPermission(actionType, payload = {}) {
    const safety = this.classifyAction(actionType);
    
    if (safety === ActionSafety.SAFE) {
      console.log(`[PERMISSIONS] Action ${actionType} classified as SAFE. Executing...`);
      return true;
    }

    console.warn(`[PERMISSIONS] Action ${actionType} classified as DANGEROUS. Awaiting approval...`, payload);
    eventBus.publish('diagnostic_log', {
      type: 'SECURE',
      msg: `DANGEROUS Command Intercepted: "${actionType}". Awaiting user confirmation...`
    });

    // Publish approval request to frontend and event bus
    return new Promise((resolve) => {
      const approvalChannel = `permission_response_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      eventBus.publish('approval_required', {
        actionType,
        payload,
        replyChannel: approvalChannel
      });

      // Temporary listener for user response
      const unsubscribe = eventBus.subscribe(approvalChannel, (response) => {
        unsubscribe();
        if (response.approved) {
          console.log(`[PERMISSIONS] User APPROVED dangerous action: ${actionType}`);
          eventBus.publish('diagnostic_log', { type: 'SECURE', msg: `Command "${actionType}" APPROVED by user.` });
          resolve(true);
        } else {
          console.warn(`[PERMISSIONS] User REJECTED dangerous action: ${actionType}`);
          eventBus.publish('diagnostic_log', { type: 'WARN', msg: `Command "${actionType}" REJECTED/BLOCKED.` });
          resolve(false);
        }
      });

      // Safety timeout: auto-reject if no response after 30 seconds
      setTimeout(() => {
        unsubscribe();
        console.warn(`[PERMISSIONS] Permission request timed out for action: ${actionType}`);
        resolve(false);
      }, 30000);
    });
  }
}

const permissionsManager = new JarvisPermissionsManager();
export default permissionsManager;
