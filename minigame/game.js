const { createGame } = require('./src/main');

const game = createGame();
game.start().catch((error) => {
  console.error('[Game] 启动失败', error);
});
