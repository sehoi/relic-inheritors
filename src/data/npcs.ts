import type { ActorId } from '../core/battle/index.js';
import type { Occupant } from '../core/world/interaction.js';
import { PORTRAITS } from './characters.js';
import type { MapId } from './maps.js';

export interface Npc extends Occupant {
  /** `chars-roguelike` 시트의 프레임 번호. `data/characters.ts` 가 번호를 안다. */
  readonly tile: number;
  readonly dialogueId: string;
  /**
   * 말을 걸면 파티에 합류한다 (GDD §8 — 2명 시작 → 4명).
   *
   * **유적 안에 둔다.** 거점에서 그냥 받으면 "찾아냈다" 가 아니라 "지급받았다" 가 된다.
   */
  readonly joinsAs?: ActorId;
  /** 합류한 뒤의 대사. 합류 전 대사를 계속 쓰면 이미 들어온 사람이 또 청한다. */
  readonly joinedDialogueId?: string;
}

/**
 * 맵별 NPC 배치.
 *
 * Tiled 의 오브젝트 레이어를 쓰지 않고 여기 둔다 — 파서가 오브젝트 레이어를 거부하고 있고
 * (`core/world/tilemap.ts`), 배치를 코드 쪽에 두면 대화 ID 오타를 테스트로 잡을 수 있다.
 * 맵이 여러 장으로 늘어나면 Tiled 오브젝트 레이어 지원을 재검토한다.
 */
export const NPCS_BY_MAP: Readonly<Partial<Record<MapId, readonly Npc[]>>> = {
  'ruin-entrance': [
    // 겉모습이 역할을 말하게 한다 — 이름표 없이도 누구에게 말을 걸지 고를 수 있어야 한다.
    { id: 'scholar', position: { x: 8, y: 4 }, tile: PORTRAITS.elder, dialogueId: 'ruin-scholar' },
    { id: 'guard', position: { x: 13, y: 10 }, tile: PORTRAITS.bare, dialogueId: 'ruin-guard' },
    { id: 'drifter', position: { x: 4, y: 9 }, tile: PORTRAITS.teal, dialogueId: 'ruin-drifter' },
    // 회랑 끝 은신처. 두 명으로 버티는 구간이 가장 힘든 구간이므로 방패부터 만나게 한다.
    {
      id: 'warden-recruit',
      position: { x: 56, y: 17 },
      tile: PORTRAITS.bearded,
      dialogueId: 'join-warden',
      joinedDialogueId: 'join-warden-after',
      joinsAs: 'warden',
    },
  ],

  // 물가 구석. 지하까지 내려온 보상이다.
  'ruin-depths': [
    {
      id: 'seeker-recruit',
      position: { x: 33, y: 26 },
      tile: PORTRAITS.teal,
      dialogueId: 'join-seeker',
      joinedDialogueId: 'join-seeker-after',
      joinsAs: 'seeker',
    },
  ],

  /**
   * 거점 사람들 (GDD §8 — NPC 5명, T-054).
   *
   * **시설 곁에 세우되 시설을 막지 않는다.** 기록자는 정화소 옆, 주인은 상점 옆에 있어
   * 무엇에 대해 말하는지가 자리로 드러난다 — 대사에서 "상점 말인데" 라고 설명할 필요가 없다.
   *
   * 거점은 통째로 안전지대라 어디에 세워도 습격당하지 않는다 (`data/zones.ts`).
   */
  haven: [
    // 정화소 곁 — 무엇을 주워 왔는지 세는 사람.
    { id: 'archivist', position: { x: 8, y: 10 }, tile: PORTRAITS.robed, dialogueId: 'haven-archivist' },
    // 유적으로 나가는 길 곁. **y12 는 비워 둔다** — 거점 입구(36,12)에서 곧장 들어오는
    // 줄이라, 여기 서면 사람이 문을 막는 꼴이 된다 (스모크가 실제로 걸렸다).
    { id: 'veteran', position: { x: 33, y: 15 }, tile: PORTRAITS.scarred, dialogueId: 'haven-veteran' },
    // 상점 곁 — 소지 한도를 알려준다.
    { id: 'keeper', position: { x: 26, y: 16 }, tile: PORTRAITS.greying, dialogueId: 'haven-keeper' },
    { id: 'child', position: { x: 14, y: 19 }, tile: PORTRAITS.braided, dialogueId: 'haven-child' },
    { id: 'idler', position: { x: 20, y: 4 }, tile: PORTRAITS.hooded, dialogueId: 'haven-idler' },
  ],
};

export function npcsForMap(mapId: MapId): readonly Npc[] {
  return NPCS_BY_MAP[mapId] ?? [];
}
