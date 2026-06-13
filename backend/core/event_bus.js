import { EventEmitter } from 'events';

class JarvisEventBus extends EventEmitter {
  constructor() {
    super();
    // Set max listeners to prevent warning logs during complex multi-agent execution
    this.setMaxListeners(50);
  }

  // Publish helper to simplify event emitting with telemetry logs
  publish(event, data = {}) {
    console.log(`[EVENT_BUS] Publishing: ${event}`, JSON.stringify(data));
    this.emit(event, data);
  }

  // Subscribe helper (alias to on)
  subscribe(event, callback) {
    this.on(event, callback);
    return () => this.off(event, callback); // Returns unsubscribe function
  }
}

const eventBus = new JarvisEventBus();
export default eventBus;
