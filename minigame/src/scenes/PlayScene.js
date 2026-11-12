const Scene = require('../core/Scene');
const draw = require('../ui/draw');

const DURATION = 30;
const STAR_COUNT = 7;

class PlayScene extends Scene {
  enter() {
    this.elapsed = 0;
    this.remaining = DURATION;
    this.score = 0;
    this.paused = false;
    this.finished = false;
    this.pointerId = null;
    this.effects = [];
    this.stars = [];
    for (let index = 0; index < STAR_COUNT; index += 1) this.stars.push(this.spawnStar());
    this.fieldBounds = this.layout().field;
    this.listen('game:resize', () => {
      const previous = this.fieldBounds;
      const next = this.layout().field;
      for (const item of this.stars) {
        const xRatio = Math.max(0, Math.min(1, (item.x - previous.x) / previous.width));
        const yRatio = Math.max(0, Math.min(1, (item.y - previous.y) / previous.height));
        item.x = next.x + xRatio * next.width;
        item.y = next.y + yRatio * next.height;
      }
      this.fieldBounds = next;
      this.pointerId = null;
      this.effects = [];
    });
    this.listen('game:pause', () => { this.pointerId = null; });
    this.game.events.emit('game:start', { duration: DURATION });
  }

  exit() {
    this.pointerId = null;
    this.effects = [];
  }

  layout() {
    const { width, height, safeArea } = this.game;
    const top = Math.max(56, safeArea.top + 30);
    const bottom = Math.max(24, safeArea.bottom + 16);
    const middle = height / 2;
    return {
      top,
      bottom,
      field: { x: 34, y: top + 164, width: width - 68, height: Math.max(100, height - top - bottom - 222) },
      pause: { x: width - 76, y: top, width: 52, height: 34 },
      resume: { x: 52, y: middle + 20, width: width - 104, height: 52 },
      finish: { x: 52, y: middle + 88, width: width - 104, height: 44 }
    };
  }

  spawnStar() {
    const field = this.layout().field;
    let candidate;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      candidate = {
        x: field.x + Math.random() * field.width,
        y: field.y + Math.random() * field.height,
        radius: 15 + Math.random() * 5,
        phase: Math.random() * Math.PI * 2
      };
      if (this.stars.every((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) > 58)) break;
    }
    return candidate;
  }

  update(dt) {
    if (this.paused || this.finished) return;
    this.elapsed += dt;
    this.remaining = Math.max(0, this.remaining - dt);
    this.effects.forEach((effect) => { effect.age += dt; });
    this.effects = this.effects.filter((effect) => effect.age < 0.65);
    if (this.remaining === 0) this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    const previousBest = Number(this.game.storage.get('bestScore', 0)) || 0;
    const best = Math.max(previousBest, this.score);
    this.game.storage.set('bestScore', best);
    this.game.events.emit('game:finish', { score: this.score, best });
    this.game.scenes.change('result', { score: this.score, best, isNewBest: this.score > previousBest });
  }

  collect(point) {
    // Capture the current star list so a newly spawned star cannot score twice in one event.
    const touched = this.stars.filter((item) => Math.hypot(point.x - item.x, point.y - item.y) < item.radius + 15);
    for (const item of touched) {
      const index = this.stars.indexOf(item);
      this.effects.push({ x: item.x, y: item.y, age: 0 });
      this.stars.splice(index, 1);
      this.stars.push(this.spawnStar());
      this.score += 1;
      this.game.events.emit('game:score', { score: this.score });
    }
  }

  onPointer(event) {
    if (this.finished) return;
    const layout = this.layout();
    if (event.type === 'cancel' || event.type === 'up') {
      if (this.pointerId === event.id) this.pointerId = null;
      return;
    }
    if (this.paused) {
      if (event.type !== 'down') return;
      if (draw.inside(event, layout.resume)) this.paused = false;
      else if (draw.inside(event, layout.finish)) this.finish();
      return;
    }
    if (event.type === 'down' && draw.inside(event, layout.pause)) {
      this.paused = true;
      this.pointerId = null;
      return;
    }
    if (event.type === 'down') this.pointerId = event.id;
    if (this.pointerId === event.id) this.collect(event);
  }

  render(ctx) {
    const { width, height } = this.game;
    const { top, bottom, pause } = this.layout();
    draw.background(ctx, width, height, this.elapsed);
    draw.text(ctx, '星星收集', 24, top + 16, 17, draw.COLORS.text, 'left', 'bold');
    draw.panel(ctx, pause);
    draw.text(ctx, '暂停', pause.x + pause.width / 2, pause.y + pause.height / 2, 12, draw.COLORS.muted, 'center');
    const cardWidth = (width - 60) / 2;
    draw.panel(ctx, { x: 24, y: top + 35, width: cardWidth, height: 81 });
    draw.panel(ctx, { x: 36 + cardWidth, y: top + 35, width: cardWidth, height: 81 });
    draw.text(ctx, '已收集', 40, top + 55, 11, draw.COLORS.muted);
    draw.text(ctx, this.score, 40, top + 88, 29, draw.COLORS.primary, 'left', 'bold');
    draw.text(ctx, '剩余时间', 52 + cardWidth, top + 55, 11, draw.COLORS.muted);
    draw.text(ctx, `${Math.ceil(this.remaining)}s`, 52 + cardWidth, top + 88, 29,
      this.remaining <= 5 ? '#ffb2a7' : draw.COLORS.text, 'left', 'bold');
    draw.roundedRect(ctx, 24, top + 130, width - 48, 4, 2);
    ctx.fillStyle = draw.COLORS.border;
    ctx.fill();
    if (this.remaining > 0) {
      draw.roundedRect(ctx, 24, top + 130, (width - 48) * this.remaining / DURATION, 4, 2);
      ctx.fillStyle = draw.COLORS.primary;
      ctx.fill();
    }
    for (const item of this.stars) {
      const offset = Math.sin(this.elapsed * 2 + item.phase) * 2;
      ctx.fillStyle = 'rgba(255,219,136,0.07)';
      ctx.beginPath();
      ctx.arc(item.x, item.y + offset, item.radius + 10, 0, Math.PI * 2);
      ctx.fill();
      draw.star(ctx, item.x, item.y + offset, item.radius, draw.COLORS.gold, Math.sin(item.phase + this.elapsed * 0.5) * 0.2);
    }
    for (const effect of this.effects) {
      ctx.save();
      ctx.globalAlpha = 1 - effect.age / 0.65;
      draw.text(ctx, '+1', effect.x, effect.y - effect.age * 54, 20, draw.COLORS.primary, 'center', 'bold');
      ctx.restore();
    }
    draw.text(ctx, '点按或拖动，收集每一颗星光', width / 2, height - bottom - 16, 12, draw.COLORS.muted, 'center');
    if (this.paused) this.renderPause(ctx);
  }

  renderPause(ctx) {
    const { width, height } = this.game;
    const { resume, finish } = this.layout();
    ctx.fillStyle = 'rgba(5,12,21,0.83)';
    ctx.fillRect(0, 0, width, height);
    draw.star(ctx, width / 2, height / 2 - 112, 25, draw.COLORS.primary);
    draw.text(ctx, '休息一下', width / 2, height / 2 - 54, 28, draw.COLORS.text, 'center', 'bold');
    draw.text(ctx, '星光会等你回来', width / 2, height / 2 - 18, 13, draw.COLORS.muted, 'center');
    draw.button(ctx, resume, '继续游戏');
    draw.button(ctx, finish, '结束并结算', true);
  }
}

module.exports = PlayScene;
