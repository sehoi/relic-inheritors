import type { RelicSite } from '../core/world/site.js';
import type { MapId } from './maps.js';

/**
 * 맵별 회수 지점 (GDD §6.1 — 유적 층마다 1~2개).
 *
 * **위험한 구역에 둔다.** 안전지대에 두면 전투를 거치지 않고 유물이 늘어나고,
 * 그러면 유적에 들어갈 이유가 없어진다 (`data/zones.ts` 의 `encounters` 를 보라).
 *
 * 여기 놓인 유물은 시작 목록(`STARTING_RELICS`)에 없는 것들이다. 이미 지닌 것을 다시 주우면
 * 아무 일도 일어나지 않아 버그로 보인다.
 */
export const SITES_BY_MAP: Readonly<Record<MapId, readonly RelicSite[]>> = {
  'ruin-entrance': [
    // 기둥 홀 한가운데. 야영지에서 나와야 닿는다.
    { id: 'pillar-cache', position: { x: 32, y: 8 }, relicId: 'bulwark-ring' },
    // 남쪽 안뜰. 서편 방을 지나 한참 돌아야 나온다.
    { id: 'south-cache', position: { x: 40, y: 30 }, relicId: 'brine-crown' },
  ],

  'ruin-depths': [
    { id: 'vault-cache', position: { x: 27, y: 4 }, relicId: 'ash-lantern' },
    { id: 'sump-cache', position: { x: 20, y: 24 }, relicId: 'graven-hand' },
  ],
};

export function sitesForMap(mapId: MapId): readonly RelicSite[] {
  return SITES_BY_MAP[mapId] ?? [];
}
