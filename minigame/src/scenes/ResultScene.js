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
    return {
      top,
      again: { x: 24, y: height - bottom - 153, width: width - 48, height: 56 },
      home: { x: 24, y: height - bottom - 81, width: width - 48, height: 48 }
    };
  }

  render(ctx) {
    const { width, height } = this.game;
    const { top, again, home } = this.layout();
    draw.background(ctx, width, height, this.elapsed);
    draw.text(ctx, 'CHALLENGE COMPLETE', width / 2, top + 4, 11, draw.COLORS.primary, 'center', 'bold');
    draw.text(ctx, '收获满满星光', width / 2, top + 49, 29, draw.COLORS.text, 'center', 'bold');
    const scoreCenter = (top + 93 + again.y - 19) / 2;
    draw.orbit(ctx, width / 2, scoreCenter - 68, 58, this.elapsed);
    draw.text(ctx, this.score, width / 2, scoreCenter + 31, 64, draw.COLORS.text, 'center', 'bold');
    draw.text(ctx, '本次收集 / 颗', width / 2, scoreCenter + 84, 12, draw.COLORS.muted, 'center');
    draw.text(ctx, this.isNewBest ? `新纪录！最高 ${this.best} 分` : `最高纪录  ${this.best} 分`,
      width / 2, scoreCenter + 120, 14, this.isNewBest ? draw.COLORS.primary : draw.COLORS.muted, 'center');
    draw.button(ctx, again, '再来一局   →');
    draw.button(ctx, home, '返回首页', true);
  }

  onPointer(event) {
    if (event.type !== 'down') return;
    const { again, home } = this.layout();
    if (draw.inside(event, again)) this.game.scenes.change('play');
    else if (draw.inside(event, home)) this.game.scenes.change('menu');
  }
}

module.exports = ResultScene;
