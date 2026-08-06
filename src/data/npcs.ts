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

  haven: [],
};

export function npcsForMap(mapId: MapId): readonly Npc[] {
  return NPCS_BY_MAP[mapId] ?? [];
}
