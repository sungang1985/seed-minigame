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
      if (this._muted) {
        this._call(track.context, 'pause');
        track.playing = false;
      } else if (!this.paused && track.active) this._play(track);
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
        track = { context, src, active: false, playing: false, playId: 0 };
        this.tracks.set(key, track);
        if (typeof context.onError === 'function') context.onError((error) => {
          track.playing = false;
          this._report(error);
        });
        if (typeof context.onEnded === 'function') context.onEnded(() => {
          track.active = false;
          track.playing = false;
        });
        context.src = src;
      }
      const repeatingLoop = track.active && track.playing && track.context.loop && loop;
      // A reusable one-shot must rewind before the next star is collected.
      if (track.playId > 0 && !loop) {
        if (typeof track.context.seek === 'function') this._call(track.context, 'seek', 0);
        else this._call(track.context, 'stop');
      }
      track.active = true;
      track.context.loop = Boolean(loop);
      track.context.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
      if (!this._muted && !this.paused && !repeatingLoop) this._play(track);
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
      track.playing = false;
    }
  }

  resumeAll() {
    if (!this.paused) return;
    this.paused = false;
    if (!this._muted) {
      for (const track of this.tracks.values()) {
        if (track.active) this._play(track);
      }
    }
  }

  stop(key) {
    const track = this.tracks.get(key);
    if (!track) return;
    this.tracks.delete(key);
    track.active = false;
    track.playing = false;
    track.playId += 1;
    this._call(track.context, 'stop');
    this._call(track.context, 'destroy');
  }

  destroy() {
    for (const key of Array.from(this.tracks.keys())) this.stop(key);
  }

  _play(track) {
    const playId = ++track.playId;
    track.playing = true;
    try {
      const result = track.context.play();
      if (result && typeof result.catch === 'function') result.catch((error) => {
        if (track.playId === playId) track.playing = false;
        this._report(error);
      });
    } catch (error) {
      track.playing = false;
      this._report(error);
    }
  }

  _call(context, method, ...args) {
    try {
      const result = context[method](...args);
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
