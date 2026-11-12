const Scene = require('../core/Scene');
const draw = require('../ui/draw');

class MenuScene extends Scene {
  enter() {
    this.elapsed = 0;
    this.best = Number(this.game.storage.get('bestScore', 0)) || 0;
    this.privacyOpen = false;
    this.active = true;
  }

  exit() { this.active = false; }

  update(dt) {
    this.elapsed += dt;
  }

  layout() {
    const { width, height, safeArea } = this.game;
    const top = Math.max(56, safeArea.top + 30);
    const bottom = Math.max(24, safeArea.bottom + 16);
    return {
      top,
      bottom,
      start: { x: 24, y: height - bottom - 142, width: width - 48, height: 56 },
      login: { x: 24, y: height - bottom - 74, width: width - 48, height: 40 },
      guide: { x: 24, y: height - bottom - 233, width: width - 48, height: 72 },
      sound: { x: width - 90, y: top - 14, width: 66, height: 30 },
      privacy: { x: width / 2 - 46, y: height - bottom - 27, width: 92, height: 30 },
      modal: { x: 24, y: Math.max(top, (height - 376) / 2), width: width - 48, height: 376 },
      closePrivacy: { x: 44, y: Math.max(top, (height - 376) / 2) + 300, width: width - 88, height: 48 }
    };
  }

  render(ctx) {
    const { width, height } = this.game;
    const { top, bottom, start, login, guide, sound, privacy } = this.layout();
    draw.background(ctx, width, height, this.elapsed);
    draw.text(ctx, '收集每一束星光', 24, top, 11, draw.COLORS.primary, 'left', 'bold');
    draw.panel(ctx, sound);
    draw.text(ctx, this.game.sound.muted ? '声音：关' : '声音：开', sound.x + sound.width / 2,
      sound.y + sound.height / 2, 11, draw.COLORS.muted, 'center');
    draw.text(ctx, '星星收集', width / 2, top + 49, 34, draw.COLORS.text, 'center', 'bold');
    draw.text(ctx, '指尖轻划，把星光收入囊中', width / 2, top + 88, 14, draw.COLORS.muted, 'center');
    draw.text(ctx, '登录用于识别玩家身份，纪录保存在本机', width / 2, top + 111,
      10, draw.COLORS.muted, 'center');
    const centerY = (top + 138 + guide.y - 18) / 2;
    const radius = Math.max(38, Math.min(103, (guide.y - top - 156) / 2));
    draw.orbit(ctx, width / 2, centerY, radius, this.elapsed);
    draw.panel(ctx, guide);
    draw.text(ctx, '30 秒星光挑战', guide.x + 20, guide.y + 23, 14, draw.COLORS.text, 'left', 'bold');
    draw.text(ctx, `最高 ${this.best} 分`, guide.x + guide.width - 20, guide.y + 23,
      11, draw.COLORS.primary, 'right');
    draw.text(ctx, '点按或拖动收集星星，每颗 +1 分', guide.x + 20, guide.y + 50, 12, draw.COLORS.muted);
    draw.button(ctx, start, '开始游戏   →');
    const auth = this.game.auth;
    const label = auth.status === 'loading' ? '微信登录中…' : auth.status === 'authenticated'
      ? `${auth.user.displayName} · 退出登录` : '微信登录 · 也可游客游玩';
    draw.panel(ctx, login);
    draw.text(ctx, label, width / 2, login.y + login.height / 2, 13,
      auth.status === 'loading' ? draw.COLORS.muted : draw.COLORS.text, 'center');
    draw.text(ctx, '隐私说明', width / 2, privacy.y + privacy.height / 2, 11, draw.COLORS.muted, 'center');
    const version = this.game.config.release && this.game.config.release.version;
    if (version) draw.text(ctx, `v${version}`, width - 24, height - bottom - 12, 10, draw.COLORS.muted, 'right');
    if (this.privacyOpen) this.renderPrivacy(ctx);
  }

  onPointer(event) {
    if (event.type !== 'down') return;
    const bounds = this.layout();
    if (this.privacyOpen) {
      if (draw.inside(event, bounds.closePrivacy)) {
        this.game.sound.tap();
        this.privacyOpen = false;
      }
      return;
    }
    if (draw.inside(event, bounds.start)) {
      this.game.sound.start();
      this.game.scenes.change('play');
    } else if (draw.inside(event, bounds.sound)) {
      this.game.sound.setMuted(!this.game.sound.muted);
      this.game.sound.tap();
    } else if (draw.inside(event, bounds.privacy)) {
      this.game.sound.tap();
      this.privacyOpen = true;
    } else if (draw.inside(event, bounds.login)) {
      this.login();
    }
  }

  login() {
    const auth = this.game.auth;
    if (auth.status === 'loading') return;
    this.game.sound.tap();
    if (auth.status === 'authenticated') {
      auth.logout();
      this.game.notify('已退出本次登录');
      return;
    }
    if (!auth.available) {
      this.game.notify(this.game.platform.kind === 'browser'
        ? '请在微信中体验账号登录' : '登录暂时不可用，请稍后重试');
      return;
    }
    auth.login().then(() => {
      if (this.active) this.game.notify('登录成功，欢迎回来');
    }).catch(() => {
      if (this.active) this.game.notify('登录暂时不可用，请稍后重试');
    });
  }

  renderPrivacy(ctx) {
    const { width, height } = this.game;
    const { modal, closePrivacy } = this.layout();
    ctx.fillStyle = 'rgba(5,12,21,0.88)';
    ctx.fillRect(0, 0, width, height);
    draw.panel(ctx, modal);
    draw.text(ctx, '隐私说明', width / 2, modal.y + 35, 23, draw.COLORS.text, 'center', 'bold');
    const lines = [
      '微信登录通过云服务识别账号，',
      '并生成专属玩家标识。',
      '不读取头像、昵称或手机号。',
      '最高纪录与声音偏好仅保存在本机。',
      '你可以不登录，直接游客游玩。',
      '退出会清除本次登录状态。'
    ];
    lines.forEach((line, index) => draw.text(ctx, line, modal.x + 20, modal.y + 87 + index * 29,
      13, draw.COLORS.muted));
    draw.button(ctx, closePrivacy, '我知道了');
  }
}

module.exports = MenuScene;
