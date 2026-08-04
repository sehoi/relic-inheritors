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
