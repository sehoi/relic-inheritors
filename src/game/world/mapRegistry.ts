import rawRuinEntrance from '../../data/maps/ruin-entrance.tmj?raw';
import rawRuinDepths from '../../data/maps/ruin-depths.tmj?raw';
import { parseTiledMap, type TileMap } from '../../core/world/tilemap.js';
import type { MapId } from '../../data/maps.js';

/**
 * 맵 파일을 읽어 파싱한다.
 *
 * `?raw` import 는 Vite 전용이라 게임 레이어에만 둘 수 있다 (ADR-001).
 * 맵 목록 자체는 `data/maps.ts` 에 있고, 유닛 테스트는 그 경로로 파일을 직접 읽는다.
 *
 * `.json` 이 아니라 `.tmj` 를 쓰는 이유: 확장자가 `.json` 이면 Vite 가 자동 파싱해서
 * `parseTiledMap` 검증을 건너뛸 수 있다. 문자열로 받아 반드시 검증을 통과시킨다.
 */
const RAW_MAPS: Readonly<Record<MapId, string>> = {
  'ruin-entrance': rawRuinEntrance,
  'ruin-depths': rawRuinDepths,
};

// 맵은 바뀌지 않으므로 한 번만 파싱한다. 층을 오갈 때마다 다시 파싱할 이유가 없다.
const cache = new Map<MapId, TileMap>();

export function loadMap(mapId: MapId): TileMap {
  const cached = cache.get(mapId);
  if (cached !== undefined) return cached;

  const parsed = parseTiledMap(JSON.parse(RAW_MAPS[mapId]));
  cache.set(mapId, parsed);
  return parsed;
}
