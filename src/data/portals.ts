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
    // 물 고인 바닥 동쪽 끝. 지하를 한 바퀴 돌아야 닿는다.
    // 은신처(x32~34, y25~27)를 피한다 — 거기엔 탐구자가 서 있다.
    {
      id: 'depths-stairs-down',
      position: { x: 33, y: 21 },
      target: { mapId: 'ruin-sanctum', position: { x: 5, y: 4 }, facing: 'down' },
    },
  ],

  'ruin-sanctum': [
    {
      id: 'sanctum-stairs-up',
      position: { x: 5, y: 3 },
      target: { mapId: 'ruin-depths', position: { x: 33, y: 22 }, facing: 'down' },
    },
    /**
     * 성소로 드는 문 (T-052).
     *
     * **막는 것이 목적이 아니라 순서를 만드는 것이 목적이다.** 열쇠는 이 층 남쪽 끝에
     * 있으므로 한 바퀴 돌아야 안쪽에 닿는다 — 그러지 않으면 넓은 층이 그냥 지름길이 된다.
     */
    {
      id: 'sanctum-door',
      position: { x: 30, y: 11 },
      target: { mapId: 'ruin-sanctum', position: { x: 32, y: 11 }, facing: 'right' },
      lock: {
        keyId: 'sanctum-seal',
        message: '문에 각인이 박혀 있다. 같은 모양의 것이 있어야 열린다.',
      },
    },
  ],
};

export function portalsForMap(mapId: MapId): readonly Portal[] {
  return PORTALS_BY_MAP[mapId] ?? [];
}
