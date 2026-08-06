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
export const SITES_BY_MAP: Readonly<Partial<Record<MapId, readonly RelicSite[]>>> = {
  'ruin-entrance': [
    // 기둥 홀 한가운데. 야영지에서 나와야 닿는다.
    { id: 'pillar-cache', position: { x: 32, y: 8 }, reward: { kind: 'relic', relicId: 'bulwark-ring' } },
    // 남쪽 안뜰. 서편 방을 지나 한참 돌아야 나온다.
    //
    // **멀리 갈수록 좋은 것이 나와야 한다.** 예전에는 여기서 1등급(`brine-crown`)이 나왔다 —
    // 맵을 한참 돌아 도착해서 시작 유물과 같은 급을 줍는 것은 김이 빠진다. 그 유물은
    // 시작 목록으로 옮기고 여기에는 3등급을 둔다.
    { id: 'south-cache', position: { x: 40, y: 30 }, reward: { kind: 'relic', relicId: 'ember-crown' } },
  ],

  'ruin-depths': [
    { id: 'vault-cache', position: { x: 27, y: 4 }, reward: { kind: 'relic', relicId: 'ash-lantern' } },
    { id: 'sump-cache', position: { x: 20, y: 24 }, reward: { kind: 'relic', relicId: 'graven-hand' } },
  ],

  /**
   * 3층에는 유물이 아니라 **열쇠**가 있다 (T-052).
   *
   * 유물은 열둘이 전부 배치돼 있어 더 놓을 것이 없기도 하지만, 그보다 **이 층의 보상은
   * 안쪽으로 가는 길 자체**여야 한다. 열쇠를 같은 층에 두어 한 바퀴 돌게 만든다 —
   * 아래층에 두면 없는 채로 내려온 사람이 되돌아가야 하고, 그건 난이도가 아니라 왕복이다.
   */
  'ruin-sanctum': [
    {
      id: 'sanctum-key',
      position: { x: 8, y: 24 },
      reward: { kind: 'key', keyId: 'sanctum-seal', name: '성소의 각인' },
    },
  ],
};

export function sitesForMap(mapId: MapId): readonly RelicSite[] {
  return SITES_BY_MAP[mapId] ?? [];
}
