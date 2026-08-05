import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene.js';
import { TitleScene } from './game/scenes/TitleScene.js';
import { OverworldScene } from './game/scenes/OverworldScene.js';
import { BattleScene } from './game/scenes/BattleScene.js';

/** 16x16 타일 기준 내부 해상도 (GDD §7). 실제 표시는 정수 배율로 확대한다. */
const GAME_WIDTH = 480;
const GAME_HEIGHT = 270;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b0c10',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, OverworldScene, BattleScene],
};

new Phaser.Game(config);
