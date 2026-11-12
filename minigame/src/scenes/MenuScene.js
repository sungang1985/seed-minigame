const Scene = require('../core/Scene');
const draw = require('../ui/draw');

class MenuScene extends Scene {
  enter() {
    this.elapsed = 0;
    this.best = this.game.storage.get('bestScore', 0);
  }

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
      start: { x: 24, y: height - bottom - 104, width: width - 48, height: 56 },
      guide: { x: 24, y: height - bottom - 204, width: width - 48, height: 78 }
    };
  }

  render(ctx) {
    const { width, height } = this.game;
    const { top, bottom, start, guide } = this.layout();
    draw.background(ctx, width, height, this.elapsed);
    draw.text(ctx, 'MINI GAME / 01', 24, top, 11, draw.COLORS.primary, 'left', 'bold');
    draw.text(ctx, '星星收集', width / 2, top + 49, 34, draw.COLORS.text, 'center', 'bold');
    draw.text(ctx, '指尖轻划，把星光收入囊中', width / 2, top + 88, 14, draw.COLORS.muted, 'center');
    const centerY = (top + 116 + guide.y - 12) / 2;
    const radius = Math.min(108, (guide.y - top - 124) / 2);
    draw.orbit(ctx, width / 2, centerY, Math.max(62, radius), this.elapsed);
    draw.panel(ctx, guide);
    draw.star(ctx, guide.x + 27, guide.y + 27, 9, draw.COLORS.primary);
    draw.text(ctx, '30 秒星光挑战', guide.x + 47, guide.y + 26, 15, draw.COLORS.text, 'left', 'bold');
    draw.text(ctx, '点按或拖动收集星星，每颗 +1 分', guide.x + 20, guide.y + 54, 12, draw.COLORS.muted);
    draw.button(ctx, start, '开始游戏   →');
    draw.text(ctx, `最高纪录  ${this.best} 分`, width / 2, height - bottom - 20, 12, draw.COLORS.muted, 'center');
  }

  onPointer(event) {
    if (event.type === 'down' && draw.inside(event, this.layout().start)) {
      this.game.scenes.change('play');
    }
  }
}

module.exports = MenuScene;
