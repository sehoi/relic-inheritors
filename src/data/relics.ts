import { createRegistry } from '../core/data/registry.js';
import type { Relic } from '../core/relic/index.js';
import type { AttunementTuning } from '../core/relic/attunement.js';
import { skill } from './skills.js';

/**
 * 유물.
 *
 * ⚠️ **여기를 늘리면 `tests/balance/relicBuilds.test.ts` 의 `측정의 한계` 가 빨개진다.**
 * 일부러 그렇게 만들어 뒀다 (ADR-013) — 유물이 늘면 조합 공간이 곱으로 커지므로,
 * 낡은 측정 지점으로 새 데이터를 판정하지 않도록 `npm run sim` 으로 다시 재고
 * `MEASURED_RELICS` 를 갱신해야 한다.
 *
 * ## 설계 축 (GDD §5.4)
 *
 * - **등급이 높을수록 강하고 침식이 빠르다.** 등급 구간별로 `erosionFactor` 를 띠처럼 나눈다 —
 *   1등급 0.8~1.0, 2등급 1.1~1.25, 3등급 1.4~. 이 띠가 겹치면 "센데 안 타는" 유물이 생기고
 *   그건 곧 지배 전략이 된다.
 * - **태그마다 최소 두 유물.** 태그가 하나뿐이면 `count: 2` 짜리 공명이 영원히 성립하지 않는다.
 * - **속성은 겹쳐도 된다.** 겹치는 쪽이 오히려 "같은 속성인데 왜 다른가" 를 스탯과 액티브로
 *   말하게 만든다.
 */
export const RELICS: Readonly<Record<string, Relic>> = {
  'ember-coil': {
    id: 'ember-coil',
    name: '잿불 고리',
    tier: 1,
    element: 'fire',
    tags: ['ember'],
    statMods: { mag: 4, maxMp: 3 },
    actives: [{ skill: skill('ember-lash'), unlockRank: 0 }],
    erosionFactor: 1,
    lore: '불을 다루던 자의 손가락뼈에 그대로 남아 있었다.',
  },

  'stone-seal': {
    id: 'stone-seal',
    name: '돌의 봉인',
    tier: 1,
    element: 'earth',
    tags: ['stone', 'ward'],
    statMods: { atk: 3, def: 5, agi: -1 },
    actives: [{ skill: skill('stone-fist'), unlockRank: 0 }],
    erosionFactor: 0.8,
    lore: '문을 닫기 위해 만들어졌다. 무엇을 가두었는지는 적혀 있지 않다.',
  },

  // 상위 등급은 강한 대신 침식이 빠르다. 이 비례가 조합 설계의 축이다 (GDD §5.4).
  'sundering-core': {
    id: 'sundering-core',
    name: '가르는 핵',
    tier: 3,
    element: 'thunder',
    tags: ['storm', 'hollow'],
    statMods: { mag: 9, maxMp: 6, res: -3 },
    actives: [
      { skill: skill('ember-lash'), unlockRank: 0 },
      // 진짜 위력은 잠겨 있다. 유물을 계속 쓸 이유가 여기서 나온다 (GDD §5.3).
      { skill: skill('sundering-arc'), unlockRank: 2 },
    ],
    erosionFactor: 1.4,
    lore: '세 번째 계승자는 이것을 들고 돌아왔고, 그 뒤로 말을 하지 못했다.',
  },

  // ── T-028a ────────────────────────────────────────────────────────────────

  'tide-pearl': {
    id: 'tide-pearl',
    name: '밀물 진주',
    tier: 1,
    element: 'water',
    tags: ['tide'],
    statMods: { mag: 3, res: 4 },
    actives: [{ skill: skill('tide-lash'), unlockRank: 0 }],
    erosionFactor: 0.9,
    lore: '물이 빠진 자리에 남아 있었다. 아직도 젖어 있다.',
  },

  'bulwark-ring': {
    id: 'bulwark-ring',
    name: '방벽 고리',
    tier: 2,
    element: 'earth',
    tags: ['stone', 'ward'],
    // 지키는 대신 느리다. 민첩을 깎는 것이 이 유물의 진짜 대가다.
    statMods: { def: 7, maxHp: 18, agi: -3 },
    actives: [{ skill: skill('ward-strike'), unlockRank: 0 }],
    // 등급 띠는 지키되, 액티브의 침식이 낮아 실제로는 천천히 탄다.
    erosionFactor: 1.1,
    lore: '문을 지키던 자들이 나눠 끼던 것이다. 문은 결국 열렸다.',
  },

  'gale-fang': {
    id: 'gale-fang',
    name: '질풍 송곳니',
    tier: 2,
    element: 'thunder',
    tags: ['storm', 'tide'],
    statMods: { atk: 6, agi: 5, res: -2 },
    actives: [{ skill: skill('storm-needle'), unlockRank: 0 }],
    erosionFactor: 1.15,
    lore: '폭풍이 지나간 자리에서 주웠다고 한다. 주운 사람은 없다.',
  },

  'ash-lantern': {
    id: 'ash-lantern',
    name: '잿빛 등',
    tier: 2,
    element: 'fire',
    tags: ['ember', 'hollow'],
    statMods: { mag: 7, maxMp: 5, def: -2 },
    actives: [
      { skill: skill('hollow-bite'), unlockRank: 0 },
      // **가장 센 액티브는 0단계에 두지 않는다.** 처음에 이걸 0단계에 뒀더니
      // 잿빛 등 없이는 좋은 조합을 짤 수 없게 됐다 — 빼면 26.7%p 손해였다 (불변식 4b).
      // 위력 170은 다른 유물의 0단계 액티브(110~152)와 급이 달랐다.
      { skill: skill('ember-burst'), unlockRank: 2 },
    ],
    erosionFactor: 1.2,
    lore: '불을 담는 그릇인데, 안쪽이 비어 있는 쪽이 더 밝다.',
  },
};

export const relicRegistry = createRegistry('유물', RELICS, (relic) => relic.id);

export function relic(id: string): Relic {
  return relicRegistry.get(id);
}

/** 시작 시 지니고 있는 유물. M4 에서 세이브·획득이 붙으면 이 자리가 바뀐다. */
export const STARTING_RELICS: readonly string[] = ['ember-coil', 'stone-seal'];

/**
 * 각인 성장 설정 (GDD §5.3).
 *
 * 스킬 한 번에 5. 1단계까지 4회, 2단계까지 12회 — 한 유물을 몇 전투 동안 쓰면
 * 다음 단계가 열리는 정도로 잡았다. T-027 시뮬레이터가 조정 대상이다.
 */
export const ATTUNEMENT: AttunementTuning = {
  perUse: 5,
  thresholds: [0, 20, 60, 140, 300, 600],
};
