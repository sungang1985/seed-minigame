const createPlatform = require('./platform/index');
const Game = require('./core/Game');
const config = require('./config/game');
const MenuScene = require('./scenes/MenuScene');
const PlayScene = require('./scenes/PlayScene');
const ResultScene = require('./scenes/ResultScene');

function createGame(platform = createPlatform(), options = {}) {
  const game = new Game(platform, { ...config, ...options });
  game.scenes
    .register('menu', MenuScene)
    .register('play', PlayScene)
    .register('result', ResultScene);
  return game;
}

module.exports = { createGame };
