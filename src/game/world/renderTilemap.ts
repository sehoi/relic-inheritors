import type Phaser from 'phaser';
import type { AssetCatalog } from '../../core/assets/index.js';
import {
  isSolid,
  localTileIndex,
  requireLayer,
  tileAt,
  tilesetForGid,
  type TileMap,
} from '../../core/world/tilemap.js';

/**
 * 타일맵 레이어를 하나의 텍스처로 그린다.
 *
 * 타일마다 스프라이트를 만들지 않고 RenderTexture 에 한 번 구워낸다.
 * 맵이 커져도 게임 오브젝트는 하나다.
 *
 * 참조하는 타일셋이 색인에 없으면 **멈추지 않고 단색 도형으로 그린다** (ADR-006).
 * 에셋 부재가 진행을 막아서는 안 되기 때문이다.
 */
export function renderTilemapLayer(
  scene: Phaser.Scene,
  map: TileMap,
  catalog: AssetCatalog,
  layerName: string,
): Phaser.GameObjects.GameObject {
  const missing = map.tilesets
    .filter((tileset) => !catalog.has(tileset.assetKey))
    .map((tileset) => tileset.assetKey);

  if (missing.length > 0) {
    console.warn(
      `타일셋 [${missing.join(', ')}] 이(가) 색인에 없어 플레이스홀더로 그립니다 (ADR-006). ` +
        `assets/index.json 에 등재하면 실제 타일로 바뀝니다.`,
    );
    return paintPlaceholder(scene, map);
  }

  return drawTiles(scene, map, layerName);
}

function drawTiles(
  scene: Phaser.Scene,
  map: TileMap,
  layerName: string,
): Phaser.GameObjects.GameObject {
  const layer = requireLayer(map, layerName);
  const canvas = scene.add
    .renderTexture(0, 0, map.width * map.tileWidth, map.height * map.tileHeight)
    .setOrigin(0, 0);

  canvas.beginDraw();
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const gid = tileAt(layer, x, y);
      if (gid === 0) continue;

      // 파서가 이미 모든 gid 의 범위를 검증했다. 여기서 undefined 면 파서가 틀린 것이다.
      const tileset = tilesetForGid(map, gid);
      if (tileset === undefined) continue;

      canvas.batchDrawFrame(
        tileset.assetKey,
        localTileIndex(tileset, gid),
        x * map.tileWidth,
        y * map.tileHeight,
      );
    }
  }
  canvas.endDraw();

  return canvas;
}

/**
 * 에셋 없이 그리는 대체 경로.
 *
 * gid 값이 아니라 **충돌 여부**로 색을 정한다. gid 는 타일셋에 따라 의미가 달라지지만
 * "막혔는가"는 어떤 맵에서도 같은 뜻이라, 어떤 콘텐츠가 와도 형태를 알아볼 수 있다.
 */
function paintPlaceholder(scene: Phaser.Scene, map: TileMap): Phaser.GameObjects.Graphics {
  const FLOOR = 0x151a24;
  const WALL = 0x39465e;

  const graphics = scene.add.graphics();
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      graphics.fillStyle(isSolid(map, x, y) ? WALL : FLOOR, 1);
      graphics.fillRect(x * map.tileWidth, y * map.tileHeight, map.tileWidth, map.tileHeight);
    }
  }
  return graphics;
}
