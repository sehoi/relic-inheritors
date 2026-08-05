/**
 * 회수 지점 (GDD §6.1, ADR-001).
 *
 * 유적에서 유물을 줍는 자리다. **유물이 어디서 오는가**에 대한 답이며,
 * 그전까지는 시작 목록으로 손에 쥐여주고 있었다.
 *
 * 한 번 주우면 사라진다. 그래서 **회수했다는 사실이 세이브에 남아야 한다** —
 * 그러지 않으면 불러올 때마다 같은 유물이 다시 놓여 있고, 저장·로드 반복이
 * 유물 무한 획득이 된다.
 *
 * 밟으면 발동한다 — 계단(`portal.ts`)과 같은 방식이다. 조사해서 여는 상자가 필요해지면
 * `trigger` 를 추가한다.
 */

import { Problems, createDuplicateGuard } from '../validation/index.js';
import type { GridPosition } from './movement.js';
import { isSolid, type TileMap } from './tilemap.js';

export interface RelicSite {
  readonly id: string;
  readonly position: GridPosition;
  /** 여기서 얻는 유물. */
  readonly relicId: string;
}

export function siteAt(
  sites: readonly RelicSite[],
  x: number,
  y: number,
): RelicSite | undefined {
  return sites.find((site) => site.position.x === x && site.position.y === y);
}

/** 아직 줍지 않은 것만. 화면에 그릴 것과 밟았을 때 발동할 것이 같은 목록에서 나와야 한다. */
export function remainingSites(
  sites: readonly RelicSite[],
  collected: ReadonlySet<string>,
): readonly RelicSite[] {
  return sites.filter((site) => !collected.has(site.id));
}

export interface SiteSurroundings {
  /** 이 칸들 위에는 놓을 수 없다 — 밟는 순간 무엇이 발동할지 모호해진다. */
  readonly occupied: readonly GridPosition[];
  readonly knownRelics: readonly string[];
}

/**
 * 한 맵의 회수 지점을 검사한다.
 *
 * **가장 위험한 실수는 계단이나 NPC 와 같은 칸에 놓는 것이다.** 밟는 순간 둘 다 발동하려 들고,
 * 어느 쪽이 이기는지는 코드 순서에 달리게 된다. 그런 건 화면에서 보고 알아낼 수 없다.
 */
export function validateSites(
  mapId: string,
  map: TileMap,
  sites: readonly RelicSite[],
  surroundings: SiteSurroundings,
): void {
  const problems = Problems.create();
  const guardId = createDuplicateGuard('회수 지점 id', problems);
  const guardCell = createDuplicateGuard('회수 지점 칸', problems);
  const relics = new Set(surroundings.knownRelics);
  const blocked = new Set(
    surroundings.occupied.map((position) => `${position.x},${position.y}`),
  );

  for (const site of sites) {
    const at = problems.scope(`${mapId}/${site.id}`);
    guardId(site.id);
    guardCell(`${site.position.x},${site.position.y}`);

    const { x, y } = site.position;
    if (isSolid(map, x, y)) {
      at.add(`(${x}, ${y}) 가 벽 속입니다. 밟을 수 없으면 영영 못 줍습니다.`);
    }
    if (blocked.has(`${x},${y}`)) {
      at.add(`(${x}, ${y}) 에 이미 계단이나 NPC 가 있습니다. 밟았을 때 무엇이 발동할지 모호해집니다.`);
    }
    if (!relics.has(site.relicId)) {
      at.add(`없는 유물을 놓아두었습니다: "${site.relicId}"`);
    }
  }

  problems.throwIfAny('회수 지점');
}

/** 같은 유물을 두 곳에서 줍게 두지 않는다. 두 번째는 아무 일도 일어나지 않아 버그로 보인다. */
export function duplicateRewards(
  sitesByMap: Readonly<Record<string, readonly RelicSite[]>>,
): readonly string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();

  for (const sites of Object.values(sitesByMap)) {
    for (const site of sites) {
      if (seen.has(site.relicId)) duplicated.add(site.relicId);
      seen.add(site.relicId);
    }
  }
  return [...duplicated].sort();
}
