class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(name, listener) {
    if (typeof listener !== 'function') throw new TypeError('事件监听器必须是函数');
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
    return () => this.off(name, listener);
  }

  once(name, listener) {
    const unsubscribe = this.on(name, (...args) => {
      unsubscribe();
      listener(...args);
    });
    return unsubscribe;
  }

  off(name, listener) {
    const listeners = this.listeners.get(name);
    if (!listeners) return;
    listeners.delete(listener);
    if (!listeners.size) this.listeners.delete(name);
  }

  emit(name, ...args) {
    const listeners = this.listeners.get(name);
    if (listeners) [...listeners].forEach((listener) => listener(...args));
  }

  clear() {
    this.listeners.clear();
  }
}

module.exports = EventBus;
