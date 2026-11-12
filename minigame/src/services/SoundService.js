const tracks = require('../config/audio');

class SoundService {
  constructor(audio) {
    this.audio = audio;
    this.unlocked = false;
  }

  get muted() { return this.audio.muted; }

  // 必须在用户的触摸回调内同步调用，浏览器和微信均可据此首次播放。
  unlock() {
    this.unlocked = true;
    // AudioManager 对活跃循环去重；解码或播放失败后下次手势仍可重试。
    this.play('bgm');
  }

  play(name) {
    const track = tracks[name];
    if (!track) return null;
    return this.audio.play(name, track.src, track);
  }

  tap() { this.play('tap'); }
  start() { this.play('start'); }
  collect() { this.play('collect'); }
  finish() { this.play('finish'); }
  setMuted(muted) { this.audio.setMuted(muted); }
}

module.exports = SoundService;
