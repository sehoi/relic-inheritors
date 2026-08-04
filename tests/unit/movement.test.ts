import { describe, expect, it } from 'vitest';
import { parseTiledMap, type TileMap } from '../../src/core/world/tilemap.js';
import {
  DIRECTIONS,
  directionVector,
  spawnWalker,
  stepWalker,
  type Direction,
  type Walker,
} from '../../src/core/world/movement.js';

/**
 * 5x5 맵. `#` 이 막힌 칸이다.
 *
 * ```
 * # # # # #
 * # . . . #
 * # . # . #
 * # . . . #
 * # # # # #
 * ```
 */
const SOLID = 41;
const FLOOR = 49;

const WALLS = new Set(['0,0', '1,0', '2,0', '3,0', '4,0', '0,1', '4,1', '0,2', '2,2', '4,2', '0,3', '4,3', '0,4', '1,4', '2,4', '3,4', '4,4']);

const cells = <T,>(fn: (x: number, y: number) => T): T[] => {
  const out: T[] = [];
  for (let y = 0; y < 5; y += 1) for (let x = 0; x < 5; x += 1) out.push(fn(x, y));
  return out;
};

const testMap = (properties: unknown[] = []): TileMap =>
  parseTiledMap({
    type: 'map',
    orientation: 'orthogonal',
    infinite: false,
    width: 5,
    height: 5,
    tilewidth: 16,
    tileheight: 16,
    tilesets: [{ firstgid: 1, name: 'tiles-test', columns: 12, tilecount: 132 }],
    properties,
    layers: [
      {
        type: 'tilelayer',
        name: 'ground',
        width: 5,
        height: 5,
        data: cells((x, y) => (WALLS.has(`${x},${y}`) ? SOLID : FLOOR)),
      },
      {
        type: 'tilelayer',
        name: 'collision',
        width: 5,
        height: 5,
        data: cells((x, y) => (WALLS.has(`${x},${y}`) ? SOLID : 0)),
      },
    ],
  });

const at = (x: number, y: number, facing: Direction = 'down'): Walker => ({
  position: { x, y },
  facing,
});

describe('directionVector', () => {
  it('화면 좌표계를 따른다 (아래가 +y)', () => {
    expect(directionVector('up')).toEqual({ x: 0, y: -1 });
    expect(directionVector('down')).toEqual({ x: 0, y: 1 });
    expect(directionVector('left')).toEqual({ x: -1, y: 0 });
    expect(directionVector('right')).toEqual({ x: 1, y: 0 });
  });

  it('네 방향이 모두 서로 다른 벡터다', () => {
    const seen = new Set(DIRECTIONS.map((d) => JSON.stringify(directionVector(d))));
    expect(seen.size).toBe(4);
  });
});

describe('stepWalker', () => {
  const map = testMap();

  it('빈 칸으로 한 칸 옮긴다', () => {
    const result = stepWalker(map, at(1, 1), 'right');
    expect(result.moved).toBe(true);
    expect(result.walker.position).toEqual({ x: 2, y: 1 });
    expect(result.walker.facing).toBe('right');
  });

  it('네 방향 모두 동작한다', () => {
    const center = at(1, 1);
    expect(stepWalker(map, center, 'down').walker.position).toEqual({ x: 1, y: 2 });
    expect(stepWalker(map, at(3, 3), 'up').walker.position).toEqual({ x: 3, y: 2 });
    expect(stepWalker(map, at(3, 3), 'left').walker.position).toEqual({ x: 2, y: 3 });
    expect(stepWalker(map, at(1, 1), 'right').walker.position).toEqual({ x: 2, y: 1 });
  });

  it('벽에 막히면 제자리에 남는다', () => {
    const result = stepWalker(map, at(1, 2), 'right'); // (2,2) 는 기둥
    expect(result.moved).toBe(false);
    expect(result.walker.position).toEqual({ x: 1, y: 2 });
  });

  it('막혀도 방향은 바뀐다 (제자리에서 돌기)', () => {
    const result = stepWalker(map, at(1, 2, 'down'), 'right');
    expect(result.moved).toBe(false);
    expect(result.walker.facing).toBe('right');
  });

  it('맵 밖으로 나가지 못한다', () => {
    // (1,1) 기준 위쪽은 외곽 벽, 그 너머는 맵 밖.
    expect(stepWalker(map, at(1, 1), 'up').moved).toBe(false);
    expect(stepWalker(map, at(1, 1), 'left').moved).toBe(false);
  });

  it('입력 상태를 변경하지 않는다 (새 객체를 반환한다)', () => {
    const before = at(1, 1);
    const result = stepWalker(map, before, 'right');
    expect(before.position).toEqual({ x: 1, y: 1 });
    expect(before.facing).toBe('down');
    expect(result.walker).not.toBe(before);
  });

  it('연속 이동이 누적된다', () => {
    let walker = at(1, 1);
    for (const direction of ['right', 'right', 'down', 'down'] as const) {
      walker = stepWalker(map, walker, direction).walker;
    }
    expect(walker.position).toEqual({ x: 3, y: 3 });
    expect(walker.facing).toBe('down');
  });

  it('막힌 방향으로 계속 눌러도 상태가 흐트러지지 않는다', () => {
    let walker = at(1, 2);
    for (let i = 0; i < 10; i += 1) walker = stepWalker(map, walker, 'right').walker;
    expect(walker.position).toEqual({ x: 1, y: 2 });
  });
});

describe('spawnWalker', () => {
  it('맵 속성에서 시작 위치를 읽는다', () => {
    const map = testMap([
      { name: 'spawnX', type: 'int', value: 3 },
      { name: 'spawnY', type: 'int', value: 1 },
    ]);
    expect(spawnWalker(map)).toEqual({ position: { x: 3, y: 1 }, facing: 'down' });
  });

  it('속성이 없으면 무엇을 해야 하는지 알려주며 던진다', () => {
    expect(() => spawnWalker(testMap())).toThrow(/spawnX\/spawnY/);
    expect(() => spawnWalker(testMap())).toThrow(/Tiled/);
  });

  it('막힌 칸이 스폰으로 지정되면 조용히 밀어내지 않고 던진다', () => {
    const map = testMap([
      { name: 'spawnX', type: 'int', value: 2 },
      { name: 'spawnY', type: 'int', value: 2 },
    ]);
    expect(() => spawnWalker(map)).toThrow(/막혀 있습니다/);
  });
});
