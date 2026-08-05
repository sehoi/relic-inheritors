import type { CleansingTuning, Facility } from '../core/world/facility.js';
import { item } from './items.js';
import type { MapId } from './maps.js';

/**
 * 거점 시설 배치 (GDD §6.4).
 *
 * 상점과 여관은 T-041 에서 붙는다. 자리만 먼저 잡아두지 않는다 —
 * 말을 걸어도 아무 일이 없는 시설은 버그로 보인다.
 */
export const FACILITIES_BY_MAP: Readonly<Partial<Record<MapId, readonly Facility[]>>> = {
  haven: [
    {
      id: 'cleansing-pool',
      position: { x: 10, y: 8 },
      kind: 'cleansing',
      name: '정화소',
      // `tiles-dungeon` 64번 — 돌기둥처럼 생긴 칸. 계단 표식과 헷갈리지 않는다.
      tile: 64,
    },
  ],
};

export function facilitiesForMap(mapId: MapId): readonly Facility[] {
  return FACILITIES_BY_MAP[mapId] ?? [];
}

/**
 * 정화소의 효율 (GDD §5.4).
 *
 * **정화석(고정 40)보다 나아야 한다.** 그러지 않으면 거점에 갈 이유가 없다.
 * 비율로 씻으므로 침식이 많이 쌓였을수록 확실히 유리해진다 — 40 이하일 때만
 * 정화석이 앞서는데, 그 구간은 애초에 거점까지 걸어올 이유가 없는 구간이다.
 *
 * 완전히 씻지 않는 이유는 침식이 리스크 축이기 때문이다 (ADR-012 의 하한과 같은 이유).
 * 거점에 들르면 다 지워진다면 "센 유물을 언제 쓰나" 라는 판단이 사라진다.
 */
export const CLEANSING: CleansingTuning = {
  ratio: 0.75,
  /**
   * **정화석 한 개 분량을 하한으로 삼는다.**
   *
   * 숫자를 따로 적지 않고 아이템에서 가져온다 — 따로 적으면 언젠가 한쪽만 바뀌고,
   * 그러면 "거점이 더 나쁜" 구간이 조용히 생긴다. 처음 30으로 적었다가
   * 침식 40 구간에서 정화석이 앞서는 것을 테스트가 잡았다.
   */
  minimum: stoneCleanse(),
};

function stoneCleanse(): number {
  const effect = item('cleansing-stone').effect;
  return effect.kind === 'cleanse' ? effect.erosion : 0;
}
