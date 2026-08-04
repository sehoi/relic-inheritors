import Phaser from 'phaser';
import rawRuinEntrance from '../../data/maps/ruin-entrance.tmj?raw';
import { isSolid, parseTiledMap, type TileMap } from '../../core/world/tilemap.js';
import { paintTilemapPlaceholder } from '../world/paintTilemap.js';
import { markScene } from '../sceneMarker.js';

/**
 * 탐색 씬.
 *
 * T-007 범위는 "맵을 읽고 그린다" 까지다.
 * 이동·충돌 반응은 T-008, 카메라 추적은 T-009 에서 붙인다.
 * 지금은 맵 전체가 화면에 들어오므로 카메라 없이도 확인이 된다.
 */
export class OverworldScene extends Phaser.Scene {
  constructor() {
    super('overworld');
  }

  create(): void {
    markScene('overworld');

    const map = parseTiledMap(JSON.parse(rawRuinEntrance));

    const pixelWidth = map.width * map.tileWidth;
    const pixelHeight = map.height * map.tileHeight;
    const offsetX = Math.floor((this.scale.width - pixelWidth) / 2);
    const offsetY = Math.floor((this.scale.height - pixelHeight) / 2);

    const world = this.add.container(offsetX, offsetY);

    const terrain = this.add.graphics();
    paintTilemapPlaceholder(terrain, map, 'ground');
    world.add(terrain);

    world.add(this.createPlayerPlaceholder(map));

    this.add.text(4, 4, 'RUIN ENTRANCE  ·  30x16', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#6f7b8a',
    });
  }

  /** 스폰 지점의 플레이어 표식. T-008에서 실제로 움직이는 객체로 대체된다. */
  private createPlayerPlaceholder(map: TileMap): Phaser.GameObjects.Rectangle {
    const spawnX = typeof map.properties['spawnX'] === 'number' ? map.properties['spawnX'] : 1;
    const spawnY = typeof map.properties['spawnY'] === 'number' ? map.properties['spawnY'] : 1;

    if (isSolid(map, spawnX, spawnY)) {
      // 맵 데이터가 잘못된 것이므로 조용히 옆 칸으로 밀어내지 않는다.
      // 유닛 테스트가 같은 조건을 검사하지만, 런타임에서도 즉시 드러나게 둔다.
      throw new Error(`스폰 지점 (${spawnX}, ${spawnY}) 이 막혀 있습니다.`);
    }

    return this.add.rectangle(
      spawnX * map.tileWidth + map.tileWidth / 2,
      spawnY * map.tileHeight + map.tileHeight / 2,
      map.tileWidth - 4,
      map.tileHeight - 4,
      0xc8a15a,
    );
  }
}
