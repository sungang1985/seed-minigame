class Scene {
  constructor(game) {
    this.game = game;
    this.subscriptions = [];
  }

  enter(_data) {}
  exit() {}
  update(_deltaTime) {}
  render(_context) {}
  onPointer(_event) {}

  // 场景事件订阅在退出时自动释放。
  listen(name, listener) {
    const unsubscribe = this.game.events.on(name, listener);
    this.subscriptions.push(unsubscribe);
    return unsubscribe;
  }

  dispose() {
    this.subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
  }
}

module.exports = Scene;
