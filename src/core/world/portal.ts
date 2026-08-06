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

/**
 * 잠긴 문 (T-052).
 *
 * **막는 것이 목적이 아니라 순서를 만드는 것이 목적이다.** 열쇠를 찾기 전에는 못 지나가므로,
 * 층을 한 바퀴 돌아야 안쪽에 닿는다 — 그러지 않으면 넓은 층이 그냥 지름길이 된다.
 *
 * 열쇠는 **가진 것을 확인만 하고 쓰지 않는다.** 소모되면 두 번째 방문 때 다시 막히는데,
 * 이미 연 문이 다시 잠기는 것은 진행이 아니라 사고로 읽힌다.
 */
export interface PortalLock {
  /** 이 열쇠를 지녀야 지날 수 있다. */
  readonly keyId: string;
  /** 막혔을 때 띄울 말. 무엇이 필요한지 모르면 막힌 것이 버그로 보인다. */
  readonly message: string;
}

export interface Portal {
  readonly id: string;
  readonly position: GridPosition;
  readonly target: PortalTarget;
  readonly lock?: PortalLock;
}

/**
 * 이 포탈이 지금 막혀 있는가. 막혔으면 띄울 말을, 아니면 `undefined`.
 *
 * 판정을 여기 두는 이유는 **화면과 시뮬레이터가 같은 답을 쓰게** 하기 위해서다.
 * 씬에서 `if (lock && !keys.has(...))` 를 쓰면 다른 곳에서 같은 조건을 또 쓰게 되고,
 * 그 둘은 반드시 언젠가 어긋난다.
 */
export function lockedReason(
  portal: Portal,
  heldKeys: ReadonlySet<string>,
): string | undefined {
  if (portal.lock === undefined) return undefined;
  return heldKeys.has(portal.lock.keyId) ? undefined : portal.lock.message;
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
