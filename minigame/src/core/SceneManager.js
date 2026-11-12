class SceneManager {
  constructor(game) {
    this.game = game;
    this.registry = new Map();
    this.current = null;
    this.name = null;
  }

  register(name, SceneType) {
    if (this.registry.has(name)) throw new Error(`场景已注册：${name}`);
    this.registry.set(name, SceneType);
    return this;
  }

  change(name, data = {}) {
    const SceneType = this.registry.get(name);
    if (!SceneType) throw new Error(`场景未注册：${name}`);
    // 每次切换都创建新实例，避免重开时残留上一局状态。
    const next = new SceneType(this.game);
    this.clear();
    this.current = next;
    this.name = name;
    next.enter(data);
    this.game.events.emit('scene:change', { name, data });
    return next;
  }

  update(deltaTime) {
    if (this.current) this.current.update(deltaTime);
  }

  render(context) {
    if (this.current) this.current.render(context);
  }

  onPointer(event) {
    // 只把一次输入交给当前场景；切换后不继续转发。
    const scene = this.current;
    if (scene) scene.onPointer(event);
  }

  clear() {
    const previous = this.current;
    this.current = null;
    this.name = null;
    if (previous) {
      try { previous.exit(); } finally { previous.dispose(); }
    }
  }
}

module.exports = SceneManager;
