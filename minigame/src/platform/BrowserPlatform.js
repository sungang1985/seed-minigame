class BrowserPlatform {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    if (!this.canvas) throw new Error('预览页面缺少 #game-canvas');
    this.kind = 'browser';
    this.canvas.style.touchAction = 'none';
  }

  getWindowInfo() {
    const rect = this.canvas.getBoundingClientRect();
    return {
      windowWidth: rect.width,
      windowHeight: rect.height,
      pixelRatio: window.devicePixelRatio || 1,
      safeArea: { top: 24, bottom: rect.height - 20, left: 0, right: rect.width },
    };
  }

  onResize(callback) {
    const observer = new ResizeObserver(callback);
    observer.observe(this.canvas.parentElement);
    return () => observer.disconnect();
  }

  onPointer(callback) {
    const types = { pointerdown: 'down', pointermove: 'move', pointerup: 'up', pointercancel: 'cancel' };
    const disposers = Object.entries(types).map(([name, type]) => {
      const listener = (event) => {
        event.preventDefault();
        if (type === 'down') this.canvas.setPointerCapture(event.pointerId);
        if (type === 'move' && !this.canvas.hasPointerCapture(event.pointerId)) return;
        const rect = this.canvas.getBoundingClientRect();
        callback({ type, x: event.clientX - rect.left, y: event.clientY - rect.top, id: event.pointerId });
        if ((type === 'up' || type === 'cancel') && this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
      };
      this.canvas.addEventListener(name, listener);
      return () => this.canvas.removeEventListener(name, listener);
    });
    return () => disposers.forEach((dispose) => dispose());
  }

  onShow(callback) { return this.onVisibility(false, callback); }
  onHide(callback) { return this.onVisibility(true, callback); }

  onVisibility(hidden, callback) {
    const listener = () => { if (document.hidden === hidden) callback(); };
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  }

  requestFrame(callback) { return window.requestAnimationFrame(callback); }
  cancelFrame(handle) { window.cancelAnimationFrame(handle); }
  now() { return window.performance.now(); }
  createImage() { return new Image(); }

  createAudio() {
    const audio = new Audio();
    let errorListener;
    return {
      get src() { return audio.src; },
      set src(value) { audio.src = value; },
      get loop() { return audio.loop; },
      set loop(value) { audio.loop = value; },
      get volume() { return audio.volume; },
      set volume(value) { audio.volume = value; },
      play() {
        const result = audio.play();
        if (result) result.catch((error) => { if (errorListener) errorListener(error); });
      },
      pause() { audio.pause(); },
      stop() { audio.pause(); audio.currentTime = 0; },
      seek(seconds) { audio.currentTime = seconds; },
      destroy() { audio.pause(); audio.removeAttribute('src'); audio.load(); },
      onError(listener) { errorListener = listener; audio.onerror = listener; },
      onEnded(listener) { audio.onended = listener; },
    };
  }

  getStorage(key) {
    const value = window.localStorage.getItem(key);
    return value === null ? undefined : JSON.parse(value);
  }

  setStorage(key, value) { window.localStorage.setItem(key, JSON.stringify(value)); }
  removeStorage(key) { window.localStorage.removeItem(key); }
  logError(error) { console.warn('[Platform]', error); }

  async request(options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || 10000);
    try {
      const method = (options.method || 'GET').toUpperCase();
      let url = options.url;
      const header = { ...(options.header || {}) };
      let body;
      if (method === 'GET' || method === 'HEAD') {
        const params = new URLSearchParams(options.data || {}).toString();
        if (params) url += (url.includes('?') ? '&' : '?') + params;
      } else if (options.data !== undefined) {
        const contentType = Object.keys(header).find((key) => key.toLowerCase() === 'content-type');
        if (!contentType) header['Content-Type'] = 'application/json';
        const type = header[contentType || 'Content-Type'];
        body = /json/i.test(type) ? JSON.stringify(options.data) : options.data;
      }
      const response = await fetch(url, { method, headers: header, body, signal: controller.signal });
      const raw = await response.text();
      let data = raw;
      try { data = JSON.parse(raw); } catch (_) {}
      return { statusCode: response.status, data, header: Object.fromEntries(response.headers.entries()) };
    } finally { clearTimeout(timer); }
  }
}

module.exports = BrowserPlatform;
