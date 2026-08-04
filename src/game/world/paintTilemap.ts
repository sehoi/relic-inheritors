import type Phaser from 'phaser';
import { requireLayer, tileAt, type TileMap } from '../../core/world/tilemap.js';

/**
 * 타일맵을 단색 도형으로 그린다 (ADR-006의 플레이스홀더 경로).
 *
 * 실제 타일셋이 `assets/index.json` 에 등재되면 이 함수를 스프라이트 기반 렌더러로 교체한다.
 * 그때까지 화면은 못생겼지만, 이동·충돌·카메라를 만들고 검증하는 데는 아무 지장이 없다.
 * 에셋이 없다는 이유로 진행을 멈추지 않는 것이 요점이다.
 */
const PLACEHOLDER_COLORS: Readonly<Record<number, number>> = {
  1: 0x151a24, // 바닥
  2: 0x39465e, // 벽
};

const EMPTY_GID = 0;

export function paintTilemapPlaceholder(
  graphics: Phaser.GameObjects.Graphics,
  map: TileMap,
  layerName: string,
): void {
  const layer = requireLayer(map, layerName);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const gid = tileAt(layer, x, y);
      if (gid === EMPTY_GID) continue;

      // 등록되지 않은 gid 는 눈에 띄는 마젠타로 칠한다.
      // 조용히 건너뛰면 "왜 구멍이 났지"를 나중에 디버깅하게 된다.
      const color = PLACEHOLDER_COLORS[gid] ?? 0xff00ff;

      graphics.fillStyle(color, 1);
      graphics.fillRect(x * map.tileWidth, y * map.tileHeight, map.tileWidth, map.tileHeight);
    }
  }

  // 타일 격자를 옅게 얹어 좌표 감각을 준다. 실제 에셋이 들어오면 사라질 보조선이다.
  graphics.lineStyle(1, 0x1f2735, 0.6);
  for (let x = 0; x <= map.width; x += 1) {
    graphics.lineBetween(x * map.tileWidth, 0, x * map.tileWidth, map.height * map.tileHeight);
  }
  for (let y = 0; y <= map.height; y += 1) {
    graphics.lineBetween(0, y * map.tileHeight, map.width * map.tileWidth, y * map.tileHeight);
  }
}
