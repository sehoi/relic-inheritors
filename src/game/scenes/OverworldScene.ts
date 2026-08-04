import Phaser from 'phaser';
import { markScene } from '../sceneMarker.js';

const TILE = 16;

/**
 * 탐색 씬. M0에서는 씬 전환이 성립하는지만 증명하는 골격이다.
 * 타일맵 로딩은 T-007, 이동·충돌은 T-008에서 붙인다.
 * 지금 그리는 격자와 사각형은 전부 플레이스홀더다 (ADR-006).
 */
export class OverworldScene extends Phaser.Scene {
  constructor() {
    super('overworld');
  }

  create(): void {
    markScene('overworld');

    const { width, height } = this.scale;

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x1c2230, 1);
    for (let x = 0; x <= width; x += TILE) {
      grid.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += TILE) {
      grid.lineBetween(0, y, width, y);
    }

    // 플레이어 플레이스홀더
    this.add.rectangle(width / 2, height / 2, TILE, TILE, 0xc8a15a);

    this.add.text(8, 8, 'OVERWORLD (placeholder)', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#6f7b8a',
    });
  }
}
