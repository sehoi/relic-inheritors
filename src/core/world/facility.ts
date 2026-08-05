/**
 * 거점 시설 (GDD §6.4, ADR-001).
 *
 * 정화소·상점·여관처럼 **말을 걸면 무언가를 해주는 자리**다. NPC 와 다른 점은
 * 대화가 목적이 아니라 상태를 바꾸는 것이 목적이라는 것이다.
 *
 * NPC 처럼 길을 막는다 — 밟고 지나갈 수 있으면 어디에 있는지 눈으로 찾기 어렵고,
 * 마주 보고 말을 거는 조작(`interaction.ts`)이 그대로 쓰이지 않는다.
 */

import { Problems, createDuplicateGuard } from '../validation/index.js';
import type { Occupant } from './interaction.js';
import { isSolid, type TileMap } from './tilemap.js';

export const FACILITY_KINDS = ['cleansing', 'inn', 'shop'] as const;
export type FacilityKind = (typeof FACILITY_KINDS)[number];

export interface Facility extends Occupant {
  readonly kind: FacilityKind;
  readonly name: string;
  /** 시트의 프레임 번호. 화면 표현이라 데이터에 함께 둔다. */
  readonly tile: number;
}

export function facilityAt(
  facilities: readonly Facility[],
  x: number,
  y: number,
): Facility | undefined {
  return facilities.find((f) => f.position.x === x && f.position.y === y);
}

/**
 * 침식을 얼마나 씻어내는가.
 *
 * **전투 중 정화석보다 나아야 한다** (GDD §5.4). 그러지 않으면 거점에 갈 이유가 없고,
 * 거점이 없는 것과 같아진다. 그래서 비율로 씻는다 — 정화석은 고정량이라
 * 침식이 많이 쌓일수록 정화소 쪽이 확실히 유리해진다.
 */
export interface CleansingTuning {
  /** 씻어내는 비율 (0~1). 1이면 완전히 사라진다. */
  readonly ratio: number;
  /** 비율로 계산한 값이 이보다 작으면 이만큼 씻는다. 침식이 적을 때 헛걸음이 되지 않게. */
  readonly minimum: number;
}

export function cleansedErosion(erosion: number, tuning: CleansingTuning): number {
  if (erosion <= 0) return 0;
  const removed = Math.max(tuning.minimum, Math.round(erosion * tuning.ratio));
  return Math.max(0, erosion - removed);
}

export interface FacilitySurroundings {
  /** 이 칸들 위에는 놓을 수 없다 — 계단이나 NPC 와 겹치면 무엇이 발동할지 모호해진다. */
  readonly occupied: readonly { readonly x: number; readonly y: number }[];
}

export function validateFacilities(
  mapId: string,
  map: TileMap,
  facilities: readonly Facility[],
  surroundings: FacilitySurroundings,
): void {
  const problems = Problems.create();
  const guardId = createDuplicateGuard('시설 id', problems);
  const guardCell = createDuplicateGuard('시설 칸', problems);
  const blocked = new Set(surroundings.occupied.map((p) => `${p.x},${p.y}`));

  for (const facility of facilities) {
    const at = problems.scope(`${mapId}/${facility.id}`);
    guardId(facility.id);
    guardCell(`${facility.position.x},${facility.position.y}`);

    const { x, y } = facility.position;
    if (isSolid(map, x, y)) {
      at.add(`(${x}, ${y}) 가 벽 속입니다. 마주 볼 수 없으면 쓸 수 없습니다.`);
    }
    if (blocked.has(`${x},${y}`)) {
      at.add(`(${x}, ${y}) 에 이미 다른 것이 있습니다.`);
    }
    if (facility.name.trim().length === 0) at.add('이름이 비어 있습니다.');

    // 사방이 막히면 말을 걸 수 없다. 벽 속에 있는 것과 결과가 같다.
    const reachable = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ].some(([nx, ny]) => !isSolid(map, nx as number, ny as number) && !blocked.has(`${nx},${ny}`));
    if (!reachable) {
      at.add(`(${x}, ${y}) 에 다가설 수 있는 칸이 없습니다.`);
    }
  }

  problems.throwIfAny('거점 시설');
}
