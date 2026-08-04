import type { Occupant } from '../core/world/interaction.js';
import type { MapId } from './maps.js';

export interface Npc extends Occupant {
  /** `tiles-dungeon` 시트의 프레임 번호. 캐릭터 타일은 84번대부터다. */
  readonly tile: number;
  readonly dialogueId: string;
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
    { id: 'scholar', position: { x: 8, y: 4 }, tile: 84, dialogueId: 'ruin-scholar' },
    { id: 'guard', position: { x: 13, y: 10 }, tile: 96, dialogueId: 'ruin-guard' },
    { id: 'drifter', position: { x: 4, y: 9 }, tile: 99, dialogueId: 'ruin-drifter' },
  ],

  // 지하 1층에는 아직 아무도 없다. 사람이 내려올 곳이 아니다.
  'ruin-depths': [],
};

export function npcsForMap(mapId: MapId): readonly Npc[] {
  return NPCS_BY_MAP[mapId] ?? [];
}
