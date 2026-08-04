import { describe, expect, it } from 'vitest';
import { parseTiledMap, type TileMap } from '../../src/core/world/tilemap.js';
import { clampCameraCenter, scrollFromCenter } from '../../src/core/world/camera.js';

/** width x height 타일의 빈 맵 (전부 바닥) */
const emptyMap = (width: number, height: number): TileMap =>
  parseTiledMap({
    type: 'map',
    orientation: 'orthogonal',
    infinite: false,
    width,
    height,
    tilewidth: 16,
    tileheight: 16,
    tilesets: [{ firstgid: 1, name: 'tiles-test', columns: 12, tilecount: 132 }],
    layers: [
      {
        type: 'tilelayer',
        name: 'ground',
        width,
        height,
        data: Array.from({ length: width * height }, () => 49),
      },
      {
        type: 'tilelayer',
        name: 'collision',
        width,
        height,
        data: Array.from({ length: width * height }, () => 0),
      },
    ],
  });

const VIEW = { width: 480, height: 270 };

describe('clampCameraCenter', () => {
  // 60x40 타일 = 960x640 픽셀. 화면보다 크다.
  const big = emptyMap(60, 40);

  it('맵 한가운데서는 원하는 지점을 그대로 본다', () => {
    expect(clampCameraCenter(big, VIEW, { x: 480, y: 320 })).toEqual({ x: 480, y: 320 });
  });

  it('좌상단 모서리에서 맵 밖을 보여주지 않는다', () => {
    // 화면 절반이 240x135 이므로 그보다 왼쪽/위로는 갈 수 없다.
    expect(clampCameraCenter(big, VIEW, { x: 0, y: 0 })).toEqual({ x: 240, y: 135 });
  });

  it('우하단 모서리에서도 멈춘다', () => {
    expect(clampCameraCenter(big, VIEW, { x: 9999, y: 9999 })).toEqual({
      x: 960 - 240,
      y: 640 - 135,
    });
  });

  it('축마다 독립적으로 판단한다', () => {
    // x 는 자유롭고 y 만 위쪽에 붙는 경우
    expect(clampCameraCenter(big, VIEW, { x: 500, y: 10 })).toEqual({ x: 500, y: 135 });
  });

  it('경계 바로 안쪽은 클램프하지 않는다', () => {
    expect(clampCameraCenter(big, VIEW, { x: 240, y: 135 })).toEqual({ x: 240, y: 135 });
    expect(clampCameraCenter(big, VIEW, { x: 720, y: 505 })).toEqual({ x: 720, y: 505 });
  });
});

describe('맵이 화면보다 작을 때', () => {
  // 20x10 타일 = 320x160 픽셀. 화면(480x270)보다 작다.
  const small = emptyMap(20, 10);

  it('클램프 대신 가운데 정렬한다 (양쪽에 빈 공간이 생기는 건 어쩔 수 없다)', () => {
    expect(clampCameraCenter(small, VIEW, { x: 0, y: 0 })).toEqual({ x: 160, y: 80 });
    expect(clampCameraCenter(small, VIEW, { x: 9999, y: 9999 })).toEqual({ x: 160, y: 80 });
  });

  it('한 축만 작으면 그 축만 가운데 정렬한다', () => {
    // 60x10 = 960x160. 가로는 크고 세로는 작다.
    const wide = emptyMap(60, 10);
    expect(clampCameraCenter(wide, VIEW, { x: 0, y: 0 })).toEqual({ x: 240, y: 80 });
  });
});

describe('scrollFromCenter', () => {
  it('중심에서 좌상단을 구한다', () => {
    expect(scrollFromCenter({ x: 480, y: 320 }, VIEW)).toEqual({ x: 240, y: 185 });
  });

  it('클램프된 중심을 넣으면 스크롤이 음수가 되지 않는다', () => {
    const map = emptyMap(60, 40);
    const center = clampCameraCenter(map, VIEW, { x: 0, y: 0 });
    const scroll = scrollFromCenter(center, VIEW);
    expect(scroll).toEqual({ x: 0, y: 0 });
  });
});
