import { createRegistry } from '../core/data/registry.js';
import type { Relic } from '../core/relic/index.js';
import { skill } from './skills.js';

/**
 * 유물.
 *
 * ⚠️ **여기를 늘리기 전에 T-027 의 밸런스 불변식이 살아 있어야 한다** (CLAUDE.md 규칙 9).
 * 유물 하나가 8슬롯에 대한 조합 공간을 곱으로 늘리므로, 검증 없이 늘리면
 * 무엇을 망가뜨렸는지 알 수 없게 된다.
 *
 * 지금 셋은 **구조를 굴려보기 위한 표본**이다. 수직 슬라이스 분량(12종)은 T-028 에서 채운다.
 */
export const RELICS: Readonly<Record<string, Relic>> = {
  'ember-coil': {
    id: 'ember-coil',
    name: '잿불 고리',
    tier: 1,
    element: 'fire',
    tags: ['ember'],
    statMods: { mag: 4, maxMp: 3 },
    actives: [skill('ember-lash')],
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
    actives: [skill('stone-fist')],
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
    actives: [skill('sundering-arc'), skill('ember-lash')],
    erosionFactor: 1.4,
    lore: '세 번째 계승자는 이것을 들고 돌아왔고, 그 뒤로 말을 하지 못했다.',
  },
};

export const relicRegistry = createRegistry('유물', RELICS, (relic) => relic.id);

export function relic(id: string): Relic {
  return relicRegistry.get(id);
}

/** 시작 시 지니고 있는 유물. M4 에서 세이브·획득이 붙으면 이 자리가 바뀐다. */
export const STARTING_RELICS: readonly string[] = ['ember-coil', 'stone-seal'];
