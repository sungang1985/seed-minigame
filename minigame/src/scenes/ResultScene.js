const Scene = require('../core/Scene');
const draw = require('../ui/draw');

class ResultScene extends Scene {
  enter(data = {}) {
    this.elapsed = 0;
    this.score = data.score || 0;
    this.best = data.best || 0;
    this.isNewBest = Boolean(data.isNewBest);
  }

  update(dt) {
    this.elapsed += dt;
  }

  layout() {
    const { width, height, safeArea } = this.game;
    const top = Math.max(56, safeArea.top + 30);
    const bottom = Math.max(24, safeArea.bottom + 16);
    const again = { x: 24, y: height - bottom - 193, width: width - 48, height: 56 };
    const contentTop = top + 90;
    const contentBottom = again.y - 32;
    const available = contentBottom - contentTop;
    const blockHeight = Math.min(300, available);
    const blockTop = contentTop + (available - blockHeight) / 2;
    const recordY = blockTop + blockHeight;
    const labelY = recordY - 28;
    const scoreSize = Math.max(36, Math.min(64, blockHeight / 4));
    const scoreY = labelY - scoreSize / 2 - 25;
    const orbitBottom = scoreY - scoreSize / 2 - 12;
    return {
      top,
      again,
      home: { x: 24, y: height - bottom - 125, width: width - 48, height: 48 },
      share: { x: 70, y: height - bottom - 65, width: width - 140, height: 36 },
      score: {
        orbitY: (blockTop + orbitBottom) / 2,
        orbitRadius: Math.min(58, (orbitBottom - blockTop) / 2),
        y: scoreY,
        size: scoreSize,
        labelY,
        recordY
      }
    };
  }

  render(ctx) {
    const { width, height } = this.game;
    const { top, again, home, share, score } = this.layout();
    draw.background(ctx, width, height, this.elapsed);
    draw.text(ctx, '每一颗星光都算数', width / 2, top + 4, 11, draw.COLORS.primary, 'center', 'bold');
    draw.text(ctx, '收获满满星光', width / 2, top + 49, 29, draw.COLORS.text, 'center', 'bold');
    draw.orbit(ctx, width / 2, score.orbitY, score.orbitRadius, this.elapsed);
    draw.text(ctx, this.score, width / 2, score.y, score.size, draw.COLORS.text, 'center', 'bold');
    draw.text(ctx, '本次收集 / 颗', width / 2, score.labelY, 12, draw.COLORS.muted, 'center');
    draw.text(ctx, this.isNewBest ? `新纪录！最高 ${this.best} 分` : `最高纪录  ${this.best} 分`,
      width / 2, score.recordY, 14,
      this.isNewBest ? draw.COLORS.primary : draw.COLORS.muted, 'center');
    draw.button(ctx, again, '再来一局   →');
    draw.button(ctx, home, '返回首页', true);
    draw.text(ctx, '邀请好友挑战', width / 2, share.y + share.height / 2, 13, draw.COLORS.primary, 'center');
  }

  onPointer(event) {
    if (event.type !== 'down') return;
    const { again, home, share } = this.layout();
    if (draw.inside(event, again)) {
      this.game.sound.start();
      this.game.scenes.change('play');
    } else if (draw.inside(event, home)) {
      this.game.sound.tap();
      this.game.scenes.change('menu');
    } else if (draw.inside(event, share)) {
      this.game.sound.tap();
      this.game.share().catch(() => this.game.notify('暂时无法分享，请稍后重试'));
    }
  }
}

module.exports = ResultScene;
