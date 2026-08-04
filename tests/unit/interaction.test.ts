import { describe, expect, it } from 'vitest';
import { parseTiledMap, type TileMap } from '../../src/core/world/tilemap.js';
import { stepWalker, type Walker } from '../../src/core/world/movement.js';
import {
  blockedByOccupants,
  occupantAt,
  occupantInFront,
  tileInFront,
  type Occupant,
} from '../../src/core/world/interaction.js';

/** 외곽만 벽인 5x5 빈 방 */
const openRoom = (): TileMap => {
  const isWall = (x: number, y: number): boolean => x === 0 || y === 0 || x === 4 || y === 4;
  const cells = <T,>(fn: (x: number, y: number) => T): T[] => {
    const out: T[] = [];
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 5; x += 1) out.push(fn(x, y));
    return out;
  };

  return parseTiledMap({
    type: 'map',
    orientation: 'orthogonal',
    infinite: false,
    width: 5,
    height: 5,
    tilewidth: 16,
    tileheight: 16,
    tilesets: [{ firstgid: 1, name: 'tiles-test', columns: 12, tilecount: 132 }],
    layers: [
      {
        type: 'tilelayer',
        name: 'ground',
        width: 5,
        height: 5,
        data: cells((x, y) => (isWall(x, y) ? 41 : 49)),
      },
      {
        type: 'tilelayer',
        name: 'collision',
        width: 5,
        height: 5,
        data: cells((x, y) => (isWall(x, y) ? 41 : 0)),
      },
    ],
  });
};

const npcs: Occupant[] = [
  { id: 'scholar', position: { x: 2, y: 1 } },
  { id: 'guard', position: { x: 3, y: 3 } },
];

const at = (x: number, y: number, facing: Walker['facing']): Walker => ({
  position: { x, y },
  facing,
});

describe('occupantAt', () => {
  it('그 칸에 선 물체를 찾는다', () => {
    expect(occupantAt(npcs, 2, 1)?.id).toBe('scholar');
    expect(occupantAt(npcs, 1, 1)).toBeUndefined();
  });
});

describe('tileInFront', () => {
  it('바라보는 방향의 한 칸 앞을 가리킨다', () => {
    expect(tileInFront(at(2, 2, 'up'))).toEqual({ x: 2, y: 1 });
    expect(tileInFront(at(2, 2, 'down'))).toEqual({ x: 2, y: 3 });
    expect(tileInFront(at(2, 2, 'left'))).toEqual({ x: 1, y: 2 });
    expect(tileInFront(at(2, 2, 'right'))).toEqual({ x: 3, y: 2 });
  });

  it('맵 밖도 그대로 가리킨다 (범위 판단은 호출부의 몫)', () => {
    expect(tileInFront(at(0, 0, 'up'))).toEqual({ x: 0, y: -1 });
  });
});

describe('occupantInFront', () => {
  it('마주 본 물체를 찾는다', () => {
    expect(occupantInFront(npcs, at(2, 2, 'up'))?.id).toBe('scholar');
  });

  it('옆이나 뒤에 있으면 찾지 않는다 (마주 봐야 말을 건다)', () => {
    expect(occupantInFront(npcs, at(2, 2, 'down'))).toBeUndefined();
    expect(occupantInFront(npcs, at(2, 2, 'left'))).toBeUndefined();
  });

  it('같은 칸에 겹쳐 있어도 앞을 본다', () => {
    // 물체 위에 서 있는 상황은 정상이 아니지만, 그때도 규칙은 "앞"이다.
    expect(occupantInFront(npcs, at(2, 1, 'up'))).toBeUndefined();
  });
});

describe('stepWalker 와의 결합', () => {
  const map = openRoom();
  const blocked = blockedByOccupants(npcs);

  it('NPC 가 선 칸으로는 들어가지 못한다', () => {
    const result = stepWalker(map, at(2, 2, 'down'), 'up', blocked);
    expect(result.moved).toBe(false);
    expect(result.walker.position).toEqual({ x: 2, y: 2 });
  });

  it('막혀도 방향은 바뀐다 (지형에 막힐 때와 같은 규칙)', () => {
    expect(stepWalker(map, at(2, 2, 'down'), 'up', blocked).walker.facing).toBe('up');
  });

  it('빈 칸으로는 그대로 간다', () => {
    expect(stepWalker(map, at(2, 2, 'down'), 'left', blocked).walker.position).toEqual({
      x: 1,
      y: 2,
    });
  });

  it('판정식을 주지 않으면 지형만 본다 (NPC 를 통과한다)', () => {
    expect(stepWalker(map, at(2, 2, 'down'), 'up').moved).toBe(true);
  });
});
