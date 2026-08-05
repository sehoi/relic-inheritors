/**
 * 구역 (ADR-001: 순수 TypeScript).
 *
 * 맵 한 장은 성격이 다른 장소들로 이루어진다. 사람이 모여 있는 야영지와
 * 그 너머의 기둥 홀은 같은 타일맵에 있지만 **같은 곳이 아니다.**
 *
 * 구역을 도입한 직접적인 이유는 인카운터다. 맵 전체에서 걸음 수를 세면
 * NPC 와 대화하다가도 전투가 벌어진다 — 안전해 보이는 곳이 안전하지 않으면
 * 플레이어는 어디서 쉴 수 있는지 배울 수 없다.
 *
 * 부수적으로 "지금 여기가 어디인가" 라는 질문에도 답한다. 맵 id 는
 * `ruin-entrance` 같은 식별자라 화면에 띄울 수 없지만, 구역에는 이름이 있다.
 *
 * 사각형 여러 개로 한 구역을 만든다. 방과 그 방으로만 이어지는 복도는
 * 플레이어에게 한 장소이므로, 이름도 하나여야 한다.
 */

import { Problems, createDuplicateGuard } from '../validation/index.js';
import { isSolid, type TileMap } from './tilemap.js';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Zone {
  readonly id: string;
  /** 화면에 뜨는 이름. 고유명사가 아니라 장소의 성격을 가리키는 보통명사다 (GDD §10). */
  readonly name: string;
  readonly rects: readonly Rect[];
  /** 이 구역에서 랜덤 인카운터가 발생하는가. */
  readonly encounters: boolean;
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
  );
}

export function zoneContains(zone: Zone, x: number, y: number): boolean {
  return zone.rects.some((rect) => rectContains(rect, x, y));
}

export function zoneAt(zones: readonly Zone[], x: number, y: number): Zone | undefined {
  return zones.find((zone) => zoneContains(zone, x, y));
}

/**
 * 여기서 전투가 벌어질 수 있는가.
 *
 * **구역이 없는 칸은 안전한 쪽으로 본다.** 구역을 빠뜨린 방에서 갑자기 전투가 터지는 것보다,
 * 전투가 안 나오는 편이 훨씬 알아채기 쉽고 덜 해롭다. 빠뜨린 방 자체는
 * `validateZones` 의 빈틈 검사가 잡는다.
 */
export function encountersAt(zones: readonly Zone[], x: number, y: number): boolean {
  return zoneAt(zones, x, y)?.encounters ?? false;
}

function describeRect(rect: Rect): string {
  return `(${rect.x}, ${rect.y}) ${rect.width}x${rect.height}`;
}

/**
 * 한 맵의 구역 배치를 검사한다.
 *
 * 가장 중요한 것은 **빈틈 검사**다. 걸어갈 수 있는 칸이 어느 구역에도 속하지 않으면
 * 그곳은 이름도 없고 전투도 안 나오는 유령 구역이 된다. 맵에 방을 하나 더 파고
 * 구역 등록을 잊는 실수는 반드시 일어나므로, 화면이 아니라 여기서 드러나야 한다.
 */
export function validateZones(mapId: string, map: TileMap, zones: readonly Zone[]): void {
  const problems = Problems.create();
  const guardId = createDuplicateGuard('구역 id', problems);
  const owner = new Map<string, string>();

  for (const zone of zones) {
    const at = problems.scope(`${mapId}/${zone.id}`);
    guardId(zone.id);

    if (zone.name.trim().length === 0) at.add('이름이 비어 있습니다.');
    if (zone.rects.length === 0) at.add('사각형이 하나도 없습니다.');

    for (const rect of zone.rects) {
      if (rect.width <= 0 || rect.height <= 0) {
        at.add(`사각형 ${describeRect(rect)} 의 크기가 0 이하입니다.`);
        continue;
      }
      if (
        rect.x < 0 ||
        rect.y < 0 ||
        rect.x + rect.width > map.width ||
        rect.y + rect.height > map.height
      ) {
        at.add(`사각형 ${describeRect(rect)} 가 맵(${map.width}x${map.height}) 밖으로 나갑니다.`);
        continue;
      }

      for (let y = rect.y; y < rect.y + rect.height; y += 1) {
        for (let x = rect.x; x < rect.x + rect.width; x += 1) {
          const cell = `${x},${y}`;
          const taken = owner.get(cell);
          if (taken !== undefined && taken !== zone.id) {
            at.add(`(${x}, ${y}) 가 구역 "${taken}" 와 겹칩니다. 어느 쪽 이름을 띄울지 알 수 없습니다.`);
          }
          owner.set(cell, zone.id);
        }
      }
    }
  }

  const uncovered: string[] = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (isSolid(map, x, y)) continue;
      if (!owner.has(`${x},${y}`)) uncovered.push(`(${x}, ${y})`);
    }
  }
  if (uncovered.length > 0) {
    problems.add(
      `${mapId}: 어느 구역에도 속하지 않는 칸이 ${uncovered.length} 개 있습니다. ` +
        `예: ${uncovered.slice(0, 8).join(', ')}. src/data/zones.ts 에 사각형을 추가하세요.`,
    );
  }

  problems.throwIfAny('구역 배치');
}
