/**
 * 맵 간 이동 (ADR-001: 순수 TypeScript).
 *
 * 포탈은 밟으면 발동한다 — 고전 JRPG의 계단 방식이다.
 * 조사해서 발동하는 문(T-011 범위 밖)이 필요해지면 `trigger` 를 추가한다.
 */

import { Problems, createDuplicateGuard } from '../validation/index.js';
import type { Direction, GridPosition } from './movement.js';

export interface PortalTarget {
  readonly mapId: string;
  /** 도착 지점. **반대편 포탈 칸이 아니라 그 옆이어야 한다** — 아니면 무한히 오간다. */
  readonly position: GridPosition;
  readonly facing: Direction;
}

export interface Portal {
  readonly id: string;
  readonly position: GridPosition;
  readonly target: PortalTarget;
}

export function portalAt(
  portals: readonly Portal[],
  x: number,
  y: number,
): Portal | undefined {
  return portals.find((portal) => portal.position.x === x && portal.position.y === y);
}

/**
 * 포탈망 전체를 검사한다.
 *
 * 가장 위험한 실수는 **도착 지점이 반대편 포탈 위에 있는 것**이다.
 * 그러면 밟자마자 다시 발동해 두 맵을 무한히 오가고, 플레이어는 조작 불능이 된다.
 * 런타임에 발견하면 원인을 짚기 어려우므로 여기서 막는다.
 */
export function validatePortalNetwork(
  portalsByMap: Readonly<Record<string, readonly Portal[]>>,
): void {
  const problems = Problems.create();
  const guardId = createDuplicateGuard('포탈 id', problems);

  for (const [mapId, portals] of Object.entries(portalsByMap)) {
    const guardCell = createDuplicateGuard('포탈 칸', problems);

    for (const portal of portals) {
      const at = problems.scope(`${mapId}/${portal.id}`);

      guardId(portal.id);
      guardCell(`${portal.position.x},${portal.position.y}`);

      const targetMap = portalsByMap[portal.target.mapId];
      if (targetMap === undefined) {
        at.add(`대상 맵 "${portal.target.mapId}" 을(를) 찾을 수 없습니다.`);
        continue;
      }

      const landing = portalAt(targetMap, portal.target.position.x, portal.target.position.y);
      if (landing !== undefined) {
        at.add(
          `도착 지점 (${portal.target.position.x}, ${portal.target.position.y}) 이 ` +
            `포탈 "${landing.id}" 위입니다. 밟자마자 되돌아가 무한히 오갑니다. 한 칸 옆으로 옮기세요.`,
        );
      }
    }
  }

  problems.throwIfAny('포탈 배치');
}
