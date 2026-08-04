/**
 * 그리드 이동 (ADR-001: 순수 TypeScript).
 *
 * 이동은 칸 단위다. 픽셀 보간은 표현의 문제이므로 여기 없다 —
 * 이 모듈은 "어느 칸에 있고 어디를 보고 있는가"만 답한다.
 * 덕분에 이동 규칙 전체를 브라우저 없이 검증할 수 있다.
 */

import { isSolid, type TileMap } from './tilemap.js';

export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export interface GridPosition {
  readonly x: number;
  readonly y: number;
}

export interface Walker {
  readonly position: GridPosition;
  readonly facing: Direction;
}

const VECTORS: Readonly<Record<Direction, GridPosition>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function directionVector(direction: Direction): GridPosition {
  return VECTORS[direction];
}

export interface StepResult {
  readonly walker: Walker;
  /** 실제로 칸을 옮겼는가. false 면 제자리에서 방향만 바뀐 것이다. */
  readonly moved: boolean;
}

/**
 * 한 칸 이동을 시도한다.
 *
 * **막혀 있어도 방향은 바뀐다.** 고전 JRPG의 관습이고, 실용적인 이유도 있다 —
 * 벽을 마주 본 채로 말을 걸거나 조사하려면 제자리에서 도는 동작이 필요하다.
 * 막힌 방향으로 눌렀을 때 아무 반응이 없으면 입력이 씹힌 것처럼 느껴지기도 한다.
 *
 * 맵 밖은 `isSolid` 가 막힌 것으로 보므로 경계 검사를 따로 하지 않는다.
 */
export function stepWalker(map: TileMap, walker: Walker, direction: Direction): StepResult {
  const turned: Walker = { position: walker.position, facing: direction };

  const vector = VECTORS[direction];
  const target: GridPosition = {
    x: walker.position.x + vector.x,
    y: walker.position.y + vector.y,
  };

  if (isSolid(map, target.x, target.y)) {
    return { walker: turned, moved: false };
  }

  return { walker: { position: target, facing: direction }, moved: true };
}

/** 맵의 spawnX/spawnY 속성으로 시작 상태를 만든다. 속성이 없거나 막혀 있으면 던진다. */
export function spawnWalker(map: TileMap, facing: Direction = 'down'): Walker {
  const x = map.properties['spawnX'];
  const y = map.properties['spawnY'];

  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new Error(
      `맵에 spawnX/spawnY 속성이 없습니다. Tiled의 맵 속성에 int 로 추가하세요. ` +
        `(현재 속성: ${Object.keys(map.properties).join(', ') || '없음'})`,
    );
  }

  if (isSolid(map, x, y)) {
    // 조용히 옆 칸으로 밀어내지 않는다. 맵 데이터가 틀린 것이므로 고쳐야 한다.
    throw new Error(`스폰 지점 (${x}, ${y}) 이 막혀 있습니다.`);
  }

  return { position: { x, y }, facing };
}
