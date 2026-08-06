/**
 * 닿을 수 있는가 (T-054, ADR-001).
 *
 * **사람이 길을 막는다.** NPC 와 시설은 벽처럼 걸음을 막으므로(`blockedByOccupants`),
 * 좁은 자리에 세우면 그 너머가 통째로 끊긴다 — 계단 위에 선 동료, 거점 입구를 막은 사람.
 * 둘 다 실제로 있었고 둘 다 화면에서는 "왜 안 가지" 로만 보인다.
 *
 * 걸어서 닿는 칸을 전부 구해두면 **끊긴 곳이 있는지 데이터만으로** 알 수 있다.
 */

import type { GridPosition } from './movement.js';
import { isSolid, type TileMap } from './tilemap.js';

const keyOf = (x: number, y: number): string => `${x},${y}`;

/**
 * 시작 칸에서 걸어 닿는 모든 칸.
 *
 * 네 방향으로만 움직인다 — 이 게임의 이동이 그렇다 (`core/world/movement.ts`).
 * `blocked` 는 벽이 아닌데 막는 것들이다 (사람, 시설).
 */
export function reachableFrom(
  map: TileMap,
  start: GridPosition,
  blocked: readonly GridPosition[] = [],
): ReadonlySet<string> {
  const walls = new Set(blocked.map((position) => keyOf(position.x, position.y)));
  const seen = new Set<string>();
  const queue: GridPosition[] = [];

  const visit = (x: number, y: number): void => {
    const key = keyOf(x, y);
    if (seen.has(key) || walls.has(key) || isSolid(map, x, y)) return;
    seen.add(key);
    queue.push({ x, y });
  };

  visit(start.x, start.y);

  // 너비 우선. 깊이 우선으로 하면 큰 맵에서 스택이 깊어진다.
  for (let head = 0; head < queue.length; head += 1) {
    const at = queue[head];
    if (at === undefined) continue;
    visit(at.x + 1, at.y);
    visit(at.x - 1, at.y);
    visit(at.x, at.y + 1);
    visit(at.x, at.y - 1);
  }

  return seen;
}

/**
 * 그 자리 **옆에** 설 수 있는가.
 *
 * 마주 보고 말을 거는 게임이라(`occupantInFront`) 사람과 시설은 그 칸이 아니라
 * **이웃 칸에 닿을 수 있으면** 쓸 수 있다. 칸 자체는 본인이 막고 서 있으므로
 * 거기 닿는지를 물으면 언제나 아니라고 나온다.
 */
export function canApproach(reachable: ReadonlySet<string>, at: GridPosition): boolean {
  return (
    reachable.has(keyOf(at.x + 1, at.y)) ||
    reachable.has(keyOf(at.x - 1, at.y)) ||
    reachable.has(keyOf(at.x, at.y + 1)) ||
    reachable.has(keyOf(at.x, at.y - 1))
  );
}
