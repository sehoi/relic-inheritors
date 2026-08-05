import { createRegistry } from '../core/data/registry.js';
import type { Resonance } from '../core/relic/resonance.js';

/**
 * 공명.
 *
 * ⚠️ **유물과 마찬가지로 T-027 의 불변식이 살아 있어야 늘릴 수 있다** (CLAUDE.md 규칙 9).
 * 공명은 조합 공간을 유물보다 더 빠르게 부풀리므로 더 조심해야 한다.
 *
 * 지금 셋은 표본이다. 수직 슬라이스 분량(4종)은 T-028 에서 채운다.
 *
 * 조건을 **한 유물이 혼자 만족시킬 수도 있다** — `가르는 핵` 은 storm·hollow 를 동시에 가져
 * 혼자서 `무너지는 울림` 을 발동시킨다. 이건 버그가 아니라 그 유물의 값어치다.
 */
export const RESONANCES: Readonly<Record<string, Resonance>> = {
  'banked-fire': {
    id: 'banked-fire',
    name: '묻어둔 불',
    conditions: [
      { tag: 'ember', count: 1 },
      { tag: 'stone', count: 1 },
    ],
    statMods: { atk: 3, def: 3 },
    // "묻어두면 천천히 탄다" 를 수치로 옮긴 자리. 침식 완화 효과를 소비할 기제가
    // T-026 에서 생겨서 붙였다 — 새 공명을 늘리지 않고 기존 것에 얹었다 (CLAUDE.md 규칙 9).
    erosionRelief: 0.85,
    description: '불을 돌 아래 묻으면 오래 간다. 유물이 천천히 탄다.',
  },

  'collapsing-echo': {
    id: 'collapsing-echo',
    name: '무너지는 울림',
    conditions: [
      { tag: 'storm', count: 1 },
      { tag: 'hollow', count: 1 },
    ],
    statMods: { mag: 6, res: -2 },
    description: '빈 곳에서 울리는 것은 되돌아오지 않는다.',
  },

  // 아직 성립하지 않는다 — 같은 태그의 유물이 둘 필요하다.
  // 유물이 늘어날수록 성립 가능한 공명이 늘어난다는 구조를 보여주는 자리다.
  'twin-ember': {
    id: 'twin-ember',
    name: '겹불',
    conditions: [{ tag: 'ember', count: 2 }],
    statMods: { mag: 5, maxMp: 4 },
    description: '두 불이 같은 박자로 타오르면 하나처럼 보인다.',
  },
};

export const resonanceRegistry = createRegistry(
  '공명',
  RESONANCES,
  (resonance) => resonance.id,
);

export function resonance(id: string): Resonance {
  return resonanceRegistry.get(id);
}

export const ALL_RESONANCES: readonly Resonance[] = Object.values(RESONANCES);
