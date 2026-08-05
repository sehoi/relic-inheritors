import type { Zone } from '../core/world/zone.js';
import type { MapId } from './maps.js';

/**
 * 맵별 구역 배치.
 *
 * 이름은 **가제**다 (GDD §10). 고유명사가 아니라 장소의 성격을 가리키는 보통명사이므로,
 * 세계관이 확정될 때 이 목록을 통째로 바꿔도 코드는 그대로다.
 *
 * `encounters: false` 인 곳이 안전지대다. 안전지대가 흔해지면 탐색의 긴장이 사라지므로
 * 늘릴 때는 근거가 있어야 한다. 지금 있는 근거는 두 가지다.
 *
 * 1. **사람이 모여 있는 자리** — 야영지와 거점. 여기서 싸움이 나면 모여 있을 이유가 없다.
 * 2. **살아남은 사람이 혼자 버티고 있는 자리** — 은신처(`-hollow`). 유적 안쪽에 홀로 있는
 *    사람이 어떻게 아직 살아 있는지에 대한 답이다. 그런 자리가 있었으니 버텼다.
 *
 * 2번은 회복을 주지 않는다. 습격만 없다. 여관처럼 쓰이면 소모전(`tests/balance/attrition`)이
 * 무너지므로, 은신처는 **말을 걸 자리**이지 쉬어갈 자리가 아니다.
 *
 * 걸어갈 수 있는 모든 칸이 어느 구역엔가 속해야 한다. `validateZones` 가 검사한다.
 */
export const ZONES_BY_MAP: Readonly<Record<MapId, readonly Zone[]>> = {
  'ruin-entrance': [
    {
      id: 'entrance-camp',
      name: '무너진 야영지',
      // 계승자들이 유적 입구에 눌러앉아 만든 자리. 여기서는 싸우지 않는다.
      rects: [{ x: 2, y: 2, width: 15, height: 11 }],
      encounters: false,
    },
    {
      id: 'pillar-hall',
      name: '기둥 홀',
      rects: [
        { x: 24, y: 2, width: 17, height: 13 },
        // 야영지에서 넘어오는 복도. 방과 한 이름을 갖는다.
        { x: 17, y: 7, width: 7, height: 1 },
      ],
      encounters: true,
    },
    {
      id: 'east-gallery',
      name: '동편 회랑',
      rects: [
        { x: 44, y: 6, width: 14, height: 10 },
        // 아래쪽 끝은 은신처에 내준다.
        { x: 44, y: 16, width: 11, height: 3 },
        { x: 41, y: 10, width: 3, height: 1 },
      ],
      encounters: true,
    },
    {
      id: 'gallery-hollow',
      name: '회랑 끝 은신처',
      // 회랑 막다른 구석. 두 구역을 뚫고 와야 닿는다 — 지급이 아니라 발견이 되도록.
      rects: [{ x: 55, y: 16, width: 3, height: 3 }],
      encounters: false,
    },
    {
      id: 'north-descent',
      name: '무너진 계단길',
      rects: [{ x: 9, y: 13, width: 1, height: 7 }],
      encounters: true,
    },
    {
      id: 'west-hall',
      name: '서편 방',
      rects: [
        { x: 6, y: 20, width: 17, height: 13 },
        { x: 23, y: 28, width: 7, height: 1 },
      ],
      encounters: true,
    },
    {
      id: 'south-court',
      name: '남쪽 안뜰',
      rects: [
        { x: 30, y: 24, width: 21, height: 13 },
        { x: 48, y: 19, width: 1, height: 5 },
      ],
      encounters: true,
    },
  ],

  /**
   * 거점은 통째로 안전지대다.
   *
   * 유적 안의 야영지와 달리 여기는 **돌아올 곳**이다. 회복하고 조합을 다시 짜는 자리에
   * 전투가 끼어들면 그 목적이 성립하지 않는다.
   */
  haven: [
    {
      id: 'haven-yard',
      name: '안뜰',
      rects: [{ x: 2, y: 2, width: 36, height: 20 }],
      encounters: false,
    },
  ],

  // 지하에서 쉴 수 있는 곳은 없다. 습격이 없는 구석 하나가 있을 뿐이다.
  'ruin-depths': [
    {
      id: 'depths-landing',
      name: '계단참',
      rects: [{ x: 2, y: 2, width: 9, height: 9 }],
      encounters: true,
    },
    {
      id: 'depths-vault',
      name: '각인 보관실',
      rects: [
        { x: 20, y: 2, width: 15, height: 13 },
        { x: 11, y: 6, width: 9, height: 1 },
      ],
      encounters: true,
    },
    {
      id: 'depths-shaft',
      name: '수직 통로',
      rects: [{ x: 5, y: 11, width: 1, height: 9 }],
      encounters: true,
    },
    {
      id: 'depths-sump',
      name: '물 고인 바닥',
      rects: [
        { x: 8, y: 20, width: 27, height: 5 },
        // 남동쪽 구석은 은신처에 내준다.
        { x: 8, y: 25, width: 24, height: 3 },
        { x: 5, y: 20, width: 3, height: 1 },
        { x: 27, y: 15, width: 1, height: 5 },
      ],
      encounters: true,
    },
    {
      id: 'sump-hollow',
      name: '물가 구석',
      // 두 면이 벽인 모서리. 여기까지 내려온 사람이 아직 살아 있는 이유다.
      rects: [{ x: 32, y: 25, width: 3, height: 3 }],
      encounters: false,
    },
  ],
};

export function zonesForMap(mapId: MapId): readonly Zone[] {
  return ZONES_BY_MAP[mapId] ?? [];
}
