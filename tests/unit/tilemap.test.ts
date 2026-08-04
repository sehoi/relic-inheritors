import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COLLISION_LAYER,
  TileMapError,
  findLayer,
  isInBounds,
  isSolid,
  parseTiledMap,
  requireLayer,
  tileAt,
} from '../../src/core/world/tilemap.js';

/** 4x3 짜리 최소 맵. ground 는 전부 1, collision 은 (1,1) 한 칸만 막혀 있다. */
const minimalMap = (overrides: Record<string, unknown> = {}): unknown => ({
  type: 'map',
  orientation: 'orthogonal',
  infinite: false,
  width: 4,
  height: 3,
  tilewidth: 16,
  tileheight: 16,
  layers: [
    {
      type: 'tilelayer',
      name: 'ground',
      width: 4,
      height: 3,
      data: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    },
    {
      type: 'tilelayer',
      name: COLLISION_LAYER,
      width: 4,
      height: 3,
      data: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    },
  ],
  ...overrides,
});

const problemsOf = (raw: unknown): string => {
  try {
    parseTiledMap(raw);
  } catch (error) {
    if (error instanceof TileMapError) return error.problems.join('\n');
    throw error;
  }
  throw new Error('검증이 통과했습니다 — 실패를 기대했습니다.');
};

describe('parseTiledMap', () => {
  it('정상 맵을 파싱한다', () => {
    const map = parseTiledMap(minimalMap());
    expect(map.width).toBe(4);
    expect(map.height).toBe(3);
    expect(map.tileWidth).toBe(16);
    expect(map.layers).toHaveLength(2);
  });

  it('지원하지 않는 형식을 명시적으로 거부한다', () => {
    expect(problemsOf(minimalMap({ orientation: 'isometric' }))).toMatch(/orthogonal/);
    expect(problemsOf(minimalMap({ infinite: true }))).toMatch(/무한 맵/);
    expect(problemsOf(minimalMap({ type: 'tileset' }))).toMatch(/type/);
  });

  it('크기가 양의 정수가 아니면 거부한다', () => {
    expect(problemsOf(minimalMap({ width: 0 }))).toMatch(/width/);
    expect(problemsOf(minimalMap({ tilewidth: -16 }))).toMatch(/tilewidth/);
  });

  it('data 길이가 width*height 와 다르면 거부한다', () => {
    const broken = minimalMap({
      layers: [
        { type: 'tilelayer', name: 'ground', width: 4, height: 3, data: [1, 1, 1] },
        {
          type: 'tilelayer',
          name: COLLISION_LAYER,
          width: 4,
          height: 3,
          data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      ],
    });
    expect(problemsOf(broken)).toMatch(/data 길이가 3/);
  });

  it('압축된 data(문자열)를 거부하며 해결 방법을 알려준다', () => {
    const compressed = minimalMap({
      layers: [
        { type: 'tilelayer', name: 'ground', width: 4, height: 3, data: 'eJxjZGRk...' },
        {
          type: 'tilelayer',
          name: COLLISION_LAYER,
          width: 4,
          height: 3,
          data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      ],
    });
    expect(problemsOf(compressed)).toMatch(/CSV/);
  });

  it('collision 레이어가 없으면 거부한다', () => {
    const noCollision = minimalMap({
      layers: [
        {
          type: 'tilelayer',
          name: 'ground',
          width: 4,
          height: 3,
          data: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        },
      ],
    });
    expect(problemsOf(noCollision)).toMatch(/collision/);
  });

  it('오브젝트 레이어를 조용히 무시하지 않고 거부한다', () => {
    const withObjects = minimalMap({
      layers: [
        ...(minimalMap() as { layers: unknown[] }).layers,
        { type: 'objectgroup', name: 'npc', objects: [] },
      ],
    });
    expect(problemsOf(withObjects)).toMatch(/tilelayer/);
  });

  it('properties 를 레코드로 변환한다', () => {
    const map = parseTiledMap(
      minimalMap({
        properties: [
          { name: 'spawnX', type: 'int', value: 2 },
          { name: 'title', type: 'string', value: '유적 입구' },
        ],
      }),
    );
    expect(map.properties).toEqual({ spawnX: 2, title: '유적 입구' });
  });

  it('properties 가 없으면 빈 레코드다', () => {
    expect(parseTiledMap(minimalMap()).properties).toEqual({});
  });
});

describe('레이어 조회', () => {
  const map = parseTiledMap(minimalMap());

  it('이름으로 찾는다', () => {
    expect(findLayer(map, 'ground')?.name).toBe('ground');
    expect(findLayer(map, 'nope')).toBeUndefined();
  });

  it('requireLayer 는 없으면 던지며 존재하는 이름을 알려준다', () => {
    expect(() => requireLayer(map, 'nope')).toThrow(/ground/);
  });
});

describe('tileAt', () => {
  const map = parseTiledMap(minimalMap());
  const collision = requireLayer(map, COLLISION_LAYER);

  it('행 우선으로 읽는다', () => {
    expect(tileAt(collision, 1, 1)).toBe(1);
    expect(tileAt(collision, 0, 0)).toBe(0);
  });

  it('범위 밖은 0이다', () => {
    expect(tileAt(collision, -1, 0)).toBe(0);
    expect(tileAt(collision, 0, -1)).toBe(0);
    expect(tileAt(collision, 4, 0)).toBe(0);
    expect(tileAt(collision, 0, 3)).toBe(0);
  });
});

describe('isSolid', () => {
  const map = parseTiledMap(minimalMap());

  it('collision 레이어의 0이 아닌 칸이 막혀 있다', () => {
    expect(isSolid(map, 1, 1)).toBe(true);
    expect(isSolid(map, 0, 0)).toBe(false);
  });

  it('맵 밖은 막힌 것으로 본다 (경계 검사를 호출부에 미루지 않는다)', () => {
    expect(isInBounds(map, -1, 0)).toBe(false);
    expect(isSolid(map, -1, 0)).toBe(true);
    expect(isSolid(map, 4, 0)).toBe(true);
    expect(isSolid(map, 0, 3)).toBe(true);
  });
});

describe('src/data/maps/ruin-entrance.tmj (실제 맵)', () => {
  const raw: unknown = JSON.parse(
    readFileSync(join(process.cwd(), 'src/data/maps/ruin-entrance.tmj'), 'utf8'),
  );
  const map = parseTiledMap(raw);

  it('파싱된다', () => {
    expect(map.width).toBe(30);
    expect(map.height).toBe(16);
    expect(map.tileWidth).toBe(16);
  });

  it('외곽이 전부 막혀 있다 (플레이어가 맵 밖으로 나갈 수 없다)', () => {
    for (let x = 0; x < map.width; x += 1) {
      expect(isSolid(map, x, 0), `(${x}, 0)`).toBe(true);
      expect(isSolid(map, x, map.height - 1), `(${x}, ${map.height - 1})`).toBe(true);
    }
    for (let y = 0; y < map.height; y += 1) {
      expect(isSolid(map, 0, y), `(0, ${y})`).toBe(true);
      expect(isSolid(map, map.width - 1, y), `(${map.width - 1}, ${y})`).toBe(true);
    }
  });

  it('스폰 지점이 정의되어 있고 막혀 있지 않다', () => {
    const { spawnX, spawnY } = map.properties;
    expect(typeof spawnX).toBe('number');
    expect(typeof spawnY).toBe('number');
    expect(isSolid(map, spawnX as number, spawnY as number)).toBe(false);
  });

  it('ground 와 collision 이 서로 모순되지 않는다 (벽 타일 = 막힌 칸)', () => {
    const ground = requireLayer(map, 'ground');
    const WALL_GID = 2;

    const mismatches: string[] = [];
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const looksLikeWall = tileAt(ground, x, y) === WALL_GID;
        if (looksLikeWall !== isSolid(map, x, y)) {
          mismatches.push(`(${x}, ${y}) ground=${tileAt(ground, x, y)} solid=${isSolid(map, x, y)}`);
        }
      }
    }

    expect(mismatches, `보이는 것과 막힌 것이 어긋납니다:\n${mismatches.join('\n')}`).toEqual([]);
  });
});
