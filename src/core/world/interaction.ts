/**
 * 맵 위의 물체와 상호작용 (ADR-001: 순수 TypeScript).
 *
 * 타일은 `tilemap` 이, 걷기는 `movement` 가 담당한다.
 * 여기는 "그 칸에 누가 서 있는가" 와 "지금 무엇을 마주 보고 있는가" 만 다룬다.
 */

import { directionVector, type GridPosition, type Walker } from './movement.js';

export interface Occupant {
  readonly id: string;
  readonly position: GridPosition;
}

export function occupantAt<T extends Occupant>(
  occupants: readonly T[],
  x: number,
  y: number,
): T | undefined {
  return occupants.find(
    (occupant) => occupant.position.x === x && occupant.position.y === y,
  );
}

/** 지금 바라보고 있는 칸. 말을 걸거나 조사할 대상은 여기 있다. */
export function tileInFront(walker: Walker): GridPosition {
  const vector = directionVector(walker.facing);
  return { x: walker.position.x + vector.x, y: walker.position.y + vector.y };
}

export function occupantInFront<T extends Occupant>(
  occupants: readonly T[],
  walker: Walker,
): T | undefined {
  const target = tileInFront(walker);
  return occupantAt(occupants, target.x, target.y);
}

/**
 * 물체가 서 있는 칸을 막힌 것으로 보는 판정식. `stepWalker` 에 넘긴다.
 *
 * 지형 충돌(`isSolid`)과 분리해 둔 이유는, 물체는 움직이고 지형은 안 움직이기 때문이다.
 * 한 곳에 합치면 NPC 가 이동할 때마다 맵 데이터를 건드려야 한다.
 */
export function blockedByOccupants(
  occupants: readonly Occupant[],
): (x: number, y: number) => boolean {
  return (x, y) => occupantAt(occupants, x, y) !== undefined;
}
