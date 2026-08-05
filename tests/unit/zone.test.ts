import { describe, expect, it } from 'vitest';
import {
  encountersAt,
  rectContains,
  validateZones,
  zoneAt,
  zoneContains,
  type Zone,
} from '../../src/core/world/zone.js';
import { parseTiledMap, type TileMap } from '../../src/core/world/tilemap.js';

/** 3x3 짜리 최소 맵. 가운데 한 칸만 벽이다. */
function tinyMap(): TileMap {
  return parseTiledMap({
    type: 'map',
    orientation: 'orthogonal',
    infinite: false,
    width: 3,
    height: 3,
    tilewidth: 16,
    tileheight: 16,
    tilesets: [{ firstgid: 1, name: 'tiles-dungeon', columns: 12, tilecount: 132 }],
    layers: [
      {
        type: 'tilelayer',
        name: 'collision',
        width: 3,
        height: 3,
        data: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      },
    ],
  });
}

const camp: Zone = {
  id: 'camp',
  name: '야영지',
  rects: [{ x: 0, y: 0, width: 2, height: 2 }],
  encounters: false,
};

const wild: Zone = {
  id: 'wild',
  name: '바깥',
  rects: [
    { x: 2, y: 0, width: 1, height: 3 },
    { x: 0, y: 2, width: 2, height: 1 },
  ],
  encounters: true,
};

describe('rectContains', () => {
  const rect = { x: 2, y: 3, width: 4, height: 2 };

  it('경계는 왼쪽·위를 포함하고 오른쪽·아래를 포함하지 않는다', () => {
    expect(rectContains(rect, 2, 3)).toBe(true);
    expect(rectContains(rect, 5, 4)).toBe(true);
    expect(rectContains(rect, 6, 4)).toBe(false);
    expect(rectContains(rect, 2, 5)).toBe(false);
  });

  it('음수 좌표를 받아도 터지지 않는다', () => {
    expect(rectContains(rect, -1, -1)).toBe(false);
  });
});

describe('zoneAt', () => {
  const zones = [camp, wild];

  it('사각형 여러 개가 한 구역을 이룬다', () => {
    // 방과 그 방으로만 이어지는 복도는 플레이어에게 한 장소다.
    expect(zoneContains(wild, 2, 0)).toBe(true);
    expect(zoneContains(wild, 1, 2)).toBe(true);
  });

  it('선 칸의 구역을 찾는다', () => {
    expect(zoneAt(zones, 0, 0)?.id).toBe('camp');
    expect(zoneAt(zones, 2, 2)?.id).toBe('wild');
  });

  it('어느 구역에도 없으면 undefined 다', () => {
    expect(zoneAt(zones, 9, 9)).toBeUndefined();
  });
});

describe('encountersAt', () => {
  const zones = [camp, wild];

  it('안전지대에서는 전투가 벌어지지 않는다', () => {
    expect(encountersAt(zones, 0, 0)).toBe(false);
    expect(encountersAt(zones, 2, 2)).toBe(true);
  });

  it('구역이 없는 칸은 안전한 쪽으로 본다', () => {
    // 빠뜨린 방에서 갑자기 전투가 터지는 것보다, 안 터지는 편이 알아채기 쉽고 덜 해롭다.
    expect(encountersAt(zones, 9, 9)).toBe(false);
  });
});

describe('validateZones', () => {
  const map = tinyMap();

  it('빈틈 없이 덮으면 통과한다', () => {
    expect(() => validateZones('tiny', map, [camp, wild])).not.toThrow();
  });

  it('걸어갈 수 있는데 어느 구역에도 없는 칸을 잡는다', () => {
    // 방을 하나 더 파고 구역 등록을 잊는 실수는 반드시 일어난다.
    expect(() => validateZones('tiny', map, [camp])).toThrow(/속하지 않는 칸/);
  });

  it('벽은 덮지 않아도 된다', () => {
    // 가운데 (1,1) 은 벽이라 어느 구역에도 속하지 않지만 문제가 아니다.
    expect(() => validateZones('tiny', map, [camp, wild])).not.toThrow();
  });

  it('겹치는 구역을 거부한다', () => {
    const overlapping: Zone = { ...wild, id: 'other', rects: [{ x: 0, y: 0, width: 3, height: 3 }] };
    expect(() => validateZones('tiny', map, [camp, overlapping])).toThrow(/겹칩니다/);
  });

  it('맵 밖으로 나가는 사각형을 거부한다', () => {
    const outside: Zone = { ...wild, rects: [{ x: 2, y: 0, width: 5, height: 3 }] };
    expect(() => validateZones('tiny', map, [camp, outside])).toThrow(/밖으로/);
  });

  it('크기가 0 인 사각형을 거부한다', () => {
    const empty: Zone = { ...wild, rects: [{ x: 0, y: 0, width: 0, height: 2 }] };
    expect(() => validateZones('tiny', map, [empty])).toThrow(/0 이하/);
  });

  it('id 중복을 거부한다', () => {
    expect(() => validateZones('tiny', map, [camp, { ...wild, id: 'camp' }])).toThrow(/중복/);
  });

  it('이름 없는 구역을 거부한다 (화면에 띄울 것이 없다)', () => {
    expect(() => validateZones('tiny', map, [{ ...camp, name: '  ' }, wild])).toThrow(/이름/);
  });

  it('문제를 첫 건에서 멈추지 않고 모아서 보고한다', () => {
    try {
      validateZones('tiny', map, [{ ...camp, name: '', rects: [] }]);
      expect.unreachable('던져야 합니다');
    } catch (error) {
      expect((error as { problems: readonly string[] }).problems.length).toBeGreaterThan(1);
    }
  });
});
