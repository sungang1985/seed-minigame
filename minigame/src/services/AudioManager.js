'use strict';

/** Manages user mute preference independently from application visibility. */
class AudioManager {
  constructor(platform, storage) {
    this.platform = platform;
    this.storage = storage;
    this.tracks = new Map();
    this._muted = storage ? Boolean(storage.get('audio.muted', false)) : false;
    this.paused = false;
  }

  get muted() {
    return this._muted;
  }

  setMuted(muted) {
    const nextMuted = Boolean(muted);
    if (nextMuted === this._muted) return;
    this._muted = nextMuted;
    if (this.storage) this.storage.set('audio.muted', this._muted);
    for (const track of this.tracks.values()) {
      if (this._muted) this._call(track.context, 'pause');
      else if (!this.paused && track.active) this._call(track.context, 'play');
    }
  }

  play(key, src, { loop = false, volume = 1 } = {}) {
    let track = this.tracks.get(key);
    if (track && track.src !== src) {
      this.stop(key);
      track = null;
    }
    try {
      if (!track) {
        const context = this.platform.createAudio();
        track = { context, src, active: true };
        this.tracks.set(key, track);
        if (typeof context.onError === 'function') context.onError((error) => this._report(error));
        if (typeof context.onEnded === 'function') context.onEnded(() => { track.active = false; });
        context.src = src;
      }
      track.active = true;
      track.context.loop = Boolean(loop);
      track.context.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
      if (!this._muted && !this.paused) this._call(track.context, 'play');
      return track.context;
    } catch (error) {
      this.stop(key);
      this._report(error);
      return null;
    }
  }

  pauseAll() {
    if (this.paused) return;
    this.paused = true;
    for (const track of this.tracks.values()) {
      if (track.active) this._call(track.context, 'pause');
    }
  }

  resumeAll() {
    if (!this.paused) return;
    this.paused = false;
    if (!this._muted) {
      for (const track of this.tracks.values()) {
        if (track.active) this._call(track.context, 'play');
      }
    }
  }

  stop(key) {
    const track = this.tracks.get(key);
    if (!track) return;
    this.tracks.delete(key);
    this._call(track.context, 'stop');
    this._call(track.context, 'destroy');
  }

  destroy() {
    for (const key of Array.from(this.tracks.keys())) this.stop(key);
  }

  _call(context, method) {
    try {
      const result = context[method]();
      if (result && typeof result.catch === 'function') result.catch((error) => this._report(error));
    } catch (error) {
      this._report(error);
    }
  }

  _report(error) {
    if (typeof this.platform.logError === 'function') this.platform.logError(error);
  }
}

module.exports = AudioManager;
