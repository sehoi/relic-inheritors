import { describe, expect, it } from 'vitest';
import { canApproach, reachableFrom } from '../../src/core/world/reach.js';
import { parseTiledMap, type TileMap } from '../../src/core/world/tilemap.js';

/**
 * 닿을 수 있는가 (T-054).
 *
 * **사람이 길을 막는다.** 좁은 복도에 세우면 그 너머가 통째로 끊기고, 화면에서는
 * "왜 안 가지" 로만 보인다. 순수 함수로 두면 맵을 만들지 않고도 검사할 수 있다.
 */

/** `#` 는 벽, `.` 는 바닥. 그림으로 쓰면 무엇을 재는지가 코드에 그대로 보인다. */
function mapOf(rows: readonly string[]): TileMap {
  const width = rows[0]?.length ?? 0;
  const data = rows.flatMap((row) => [...row].map((cell) => (cell === '#' ? 1 : 0)));

  return parseTiledMap({
    width,
    height: rows.length,
    tilewidth: 16,
    tileheight: 16,
    infinite: false,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    type: 'map',
    version: '1.10',
    tilesets: [{ firstgid: 1, name: 'tiles-dungeon', columns: 12, tilecount: 132 }],
    properties: [
      { name: 'spawnX', type: 'int', value: 1 },
      { name: 'spawnY', type: 'int', value: 1 },
    ],
    layers: [
      { name: 'ground', type: 'tilelayer', width, height: rows.length, data: data.map(() => 1), x: 0, y: 0, opacity: 1, visible: true, id: 1 },
      { name: 'collision', type: 'tilelayer', width, height: rows.length, data, x: 0, y: 0, opacity: 1, visible: true, id: 2 },
    ],
  });
}

/**
 * 방 — 복도 — 방. 복도가 한 칸이라 거기 서면 오른쪽 방이 끊긴다.
 */
const CORRIDOR = mapOf([
  '#######',
  '#..#..#',
  '#.....#',
  '#..#..#',
  '#######',
]);

describe('닿을 수 있는 칸', () => {
  it('막는 것이 없으면 다 닿는다', () => {
    const reachable = reachableFrom(CORRIDOR, { x: 1, y: 1 });
    expect(reachable.has('5,1'), '오른쪽 방').toBe(true);
    expect(reachable.has('3,1'), '벽').toBe(false);
  });

  it('좁은 복도를 막으면 그 너머가 끊긴다', () => {
    // 이게 이 함수의 존재 이유다 — 계단 한 칸에 사람이 서면 층 전체가 끊긴다.
    const reachable = reachableFrom(CORRIDOR, { x: 1, y: 1 }, [{ x: 3, y: 2 }]);

    expect(reachable.has('1,1'), '시작 쪽은 그대로').toBe(true);
    expect(reachable.has('5,1'), '막힌 너머').toBe(false);
  });

  it('넓은 방에서는 한 사람이 끊지 못한다', () => {
    // **불편한 것과 끊긴 것은 다르다.** 거점에서 실제로 그랬다 — 스모크는 막혔지만
    // 우회로가 있어 도달 자체는 됐다.
    const room = mapOf(['#####', '#...#', '#...#', '#...#', '#####']);
    const reachable = reachableFrom(room, { x: 1, y: 1 }, [{ x: 2, y: 2 }]);

    expect(reachable.has('3,3')).toBe(true);
  });

  it('벽 속에서 시작하면 아무 데도 못 간다', () => {
    expect(reachableFrom(CORRIDOR, { x: 0, y: 0 }).size).toBe(0);
  });

  it('막는 것 위에서 시작해도 갇힌다', () => {
    expect(reachableFrom(CORRIDOR, { x: 1, y: 1 }, [{ x: 1, y: 1 }]).size).toBe(0);
  });
});

describe('다가갈 수 있는가', () => {
  it('옆 칸에 닿으면 말을 걸 수 있다', () => {
    // 사람은 자기 칸을 막고 서 있으므로 그 칸에 닿는지를 물으면 언제나 아니라고 나온다.
    const reachable = reachableFrom(CORRIDOR, { x: 1, y: 1 }, [{ x: 1, y: 2 }]);
    expect(canApproach(reachable, { x: 1, y: 2 })).toBe(true);
  });

  it('사방이 막히면 다가갈 수 없다', () => {
    const reachable = reachableFrom(CORRIDOR, { x: 1, y: 1 }, [{ x: 3, y: 2 }]);
    // 오른쪽 방 사람에게는 갈 수 없다.
    expect(canApproach(reachable, { x: 5, y: 2 })).toBe(false);
  });
});
