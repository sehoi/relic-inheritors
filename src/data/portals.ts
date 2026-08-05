import type { Portal } from '../core/world/portal.js';
import type { MapId } from './maps.js';

/**
 * 맵 간 연결.
 *
 * 도착 지점은 **반대편 포탈 칸이 아니라 그 옆**이다. 포탈 위에 내려놓으면
 * 밟자마자 다시 발동해 두 맵을 무한히 오간다. `validatePortalNetwork` 가 이를 검사한다.
 */
export const PORTALS_BY_MAP: Readonly<Record<MapId, readonly Portal[]>> = {
  'ruin-entrance': [
    {
      id: 'entrance-stairs-down',
      position: { x: 11, y: 3 },
      target: { mapId: 'ruin-depths', position: { x: 5, y: 6 }, facing: 'down' },
    },
    // 야영지 구석에서 거점으로. 유적 밖으로 나가는 유일한 길이다.
    {
      id: 'entrance-to-haven',
      position: { x: 2, y: 2 },
      target: { mapId: 'haven', position: { x: 35, y: 12 }, facing: 'left' },
    },
  ],

  haven: [
    {
      id: 'haven-to-ruin',
      position: { x: 36, y: 12 },
      target: { mapId: 'ruin-entrance', position: { x: 3, y: 2 }, facing: 'right' },
    },
  ],

  'ruin-depths': [
    {
      id: 'depths-stairs-up',
      position: { x: 5, y: 5 },
      target: { mapId: 'ruin-entrance', position: { x: 11, y: 4 }, facing: 'down' },
    },
  ],
};

export function portalsForMap(mapId: MapId): readonly Portal[] {
  return PORTALS_BY_MAP[mapId] ?? [];
}
