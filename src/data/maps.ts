/**
 * 맵 목록.
 *
 * 여기에는 **파일 경로만** 둔다. 실제 로딩은 게임 레이어(`game/world/mapRegistry.ts`)가
 * Vite 의 `?raw` 로 한다 — 그 import 를 여기 두면 node 환경의 유닛 테스트가 깨진다 (ADR-001).
 * 테스트는 이 경로로 파일을 직접 읽는다.
 */
export const MAP_IDS = ['ruin-entrance', 'ruin-depths'] as const;

export type MapId = (typeof MAP_IDS)[number];

export const MAP_FILES: Readonly<Record<MapId, string>> = {
  'ruin-entrance': 'src/data/maps/ruin-entrance.tmj',
  'ruin-depths': 'src/data/maps/ruin-depths.tmj',
};

/**
 * 화면에 띄우는 맵 이름 (가제).
 *
 * 맵 id 는 식별자라 그대로 보여줄 수 없다. 고유명사는 아직 확정하지 않으므로(GDD §10)
 * 장소의 성격을 가리키는 보통명사를 쓴다. 더 좁은 단위의 이름은 `data/zones.ts` 가 갖는다.
 */
export const MAP_NAMES: Readonly<Record<MapId, string>> = {
  'ruin-entrance': '유적 입구',
  'ruin-depths': '유적 지하 1층',
};

/** 게임을 시작하는 맵. */
export const STARTING_MAP: MapId = 'ruin-entrance';

export function isMapId(value: string): value is MapId {
  return (MAP_IDS as readonly string[]).includes(value);
}
