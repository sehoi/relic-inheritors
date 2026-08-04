import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAssetIndex } from '../../src/core/assets/index.js';
import {
  COLLISION_LAYER,
  TileMapError,
  findLayer,
  isInBounds,
  isSolid,
  localTileIndex,
  parseTiledMap,
  requireLayer,
  tileAt,
  tilesetForGid,
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
  tilesets: [{ firstgid: 1, name: 'tiles-test', columns: 4, tilecount: 8 }],
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

describe('타일셋 (T-007b)', () => {
  it('name 을 에셋 색인 키로 읽는다 (파일 경로가 아니다)', () => {
    const map = parseTiledMap(minimalMap());
    expect(map.tilesets).toEqual([
      { firstGid: 1, assetKey: 'tiles-test', columns: 4, tileCount: 8 },
    ]);
  });

  it('타일셋이 없거나 비면 거부한다', () => {
    expect(problemsOf(minimalMap({ tilesets: [] }))).toMatch(/비어 있습니다/);
    expect(problemsOf(minimalMap({ tilesets: undefined }))).toMatch(/배열/);
  });

  it('외부 타일셋(.tsx) 참조를 거부하며 해결 방법을 알려준다', () => {
    const external = minimalMap({ tilesets: [{ firstgid: 1, source: 'dungeon.tsx' }] });
    expect(problemsOf(external)).toMatch(/Embed tileset/);
  });

  it('필수 필드를 검사한다', () => {
    expect(problemsOf(minimalMap({ tilesets: [{ firstgid: 1, name: '', columns: 4, tilecount: 8 }] }))).toMatch(
      /name/,
    );
    expect(
      problemsOf(minimalMap({ tilesets: [{ firstgid: 0, name: 'x', columns: 4, tilecount: 8 }] })),
    ).toMatch(/firstgid/);
    expect(
      problemsOf(minimalMap({ tilesets: [{ firstgid: 1, name: 'x', columns: 0, tilecount: 8 }] })),
    ).toMatch(/columns/);
  });

  it('firstgid 가 오름차순이 아니면 거부한다', () => {
    const unsorted = minimalMap({
      tilesets: [
        { firstgid: 10, name: 'a', columns: 4, tilecount: 8 },
        { firstgid: 5, name: 'b', columns: 4, tilecount: 8 },
      ],
    });
    expect(problemsOf(unsorted)).toMatch(/커야 합니다/);
  });

  it('어떤 타일셋에도 속하지 않는 gid 를 거부한다 (화면에 구멍이 뚫리기 전에 잡는다)', () => {
    // tilecount 8, firstgid 1 => 유효 범위 1~8. 데이터에 99 를 심는다.
    const outOfRange = minimalMap({
      layers: [
        {
          type: 'tilelayer',
          name: 'ground',
          width: 4,
          height: 3,
          data: [99, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        },
        {
          type: 'tilelayer',
          name: COLLISION_LAYER,
          width: 4,
          height: 3,
          data: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
        },
      ],
    });
    expect(problemsOf(outOfRange)).toMatch(/속하지 않는 gid: 99/);
  });

  it('gid 를 타일셋과 프레임 번호로 바꾼다', () => {
    const map = parseTiledMap(
      minimalMap({
        tilesets: [
          { firstgid: 1, name: 'a', columns: 4, tilecount: 8 },
          { firstgid: 9, name: 'b', columns: 4, tilecount: 8 },
        ],
      }),
    );

    const first = tilesetForGid(map, 1);
    expect(first?.assetKey).toBe('a');
    expect(localTileIndex(first!, 1)).toBe(0);

    const second = tilesetForGid(map, 12);
    expect(second?.assetKey).toBe('b');
    expect(localTileIndex(second!, 12)).toBe(3);

    // 빈 칸과 범위 밖
    expect(tilesetForGid(map, 0)).toBeUndefined();
    expect(tilesetForGid(map, 999)).toBeUndefined();
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
    expect(map.tileWidth).toBe(16);
    expect(map.tileHeight).toBe(16);
  });

  it('화면보다 크다 (카메라 추적이 의미를 가지려면)', () => {
    // 크기 자체를 못 박으면 맵이 자랄 때마다 테스트를 고쳐야 한다.
    // 중요한 건 숫자가 아니라 "화면에 다 안 들어온다"는 성질이다.
    expect(map.width * map.tileWidth).toBeGreaterThan(480);
    expect(map.height * map.tileHeight).toBeGreaterThan(270);
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

  it('색인된 타일셋 키를 참조한다', () => {
    expect(map.tilesets.map((tileset) => tileset.assetKey)).toEqual(['tiles-dungeon']);
  });

  it('참조하는 타일셋 키가 assets/index.json 에 실제로 등재되어 있다', () => {
    // 맵과 에셋 색인 사이의 연결을 여기서 닫는다.
    // 이게 없으면 키 오타가 런타임까지 살아남아 "왜 안 그려지지"가 된다.
    const index = parseAssetIndex(
      JSON.parse(readFileSync(join(process.cwd(), 'assets/index.json'), 'utf8')),
    );
    const registered = new Set(index.entries.map((entry) => entry.key));
    const missing = map.tilesets
      .map((tileset) => tileset.assetKey)
      .filter((key) => !registered.has(key));

    expect(missing, `맵이 참조하는데 색인에 없는 타일셋 키: ${missing.join(', ')}`).toEqual([]);
  });

  it('ground 와 collision 이 서로 모순되지 않는다 (벽 타일 = 막힌 칸)', () => {
    const ground = requireLayer(map, 'ground');
    const WALL_GID = 41; // Kenney Tiny Dungeon 의 회색 벽돌 (로컬 40 + firstgid 1)

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
