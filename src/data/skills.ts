import { createRegistry } from '../core/data/registry.js';
import type { Skill } from '../core/battle/skill.js';

/**
 * 스킬.
 *
 * **능력의 출처는 캐릭터가 아니라 유물이다** (ADR-004). 여기 있는 것들은 유물이 들고 오는
 * 액티브이며, 어느 유물이 어느 스킬을 주는지는 `data/relics.ts` 가 정한다.
 *
 * 침식량은 **위력에 비례**한다. 이 비례가 무너지면 "가장 센 것만 계속 쓴다" 가 정답이 되어
 * 조합 설계가 무의미해진다 (GDD §5.4). 여기 적힌 값은 유물 계수가 곱해지기 **전**의 기준값이다
 * (T-026, ADR-012).
 *
 * 속성마다 성격을 다르게 잡았다 — 물은 재우고, 번개는 마비시키고, 공허는 침묵시킨다.
 * 같은 위력이라도 무엇을 거느냐가 다르면 조합에서 고를 이유가 생긴다.
 */
export const SKILLS: Readonly<Record<string, Skill>> = {
  'ember-lash': {
    id: 'ember-lash',
    name: '불꽃 채찍',
    mpCost: 4,
    erosion: 12,
    attack: { power: 130, element: 'fire', kind: 'magical' },
  },

  'stone-fist': {
    id: 'stone-fist',
    name: '바위 주먹',
    mpCost: 3,
    erosion: 8,
    attack: { power: 120, element: 'earth', kind: 'physical' },
  },

  // 위력이 크게 오르면 침식도 크게 오른다. 이 비례가 무너지면
  // "가장 센 것만 계속 쓴다" 가 정답이 되어 조합 설계가 무의미해진다.
  //
  // MP 비용을 위력에 비해 더 가파르게 매긴다. 위력 220 은 기본 공격의 2.2배인데,
  // MP 풀이 커질수록 이걸 반복 시전할 수 있어 후반에 지배적이 된다 (ADR-010 실측).
  'sundering-arc': {
    id: 'sundering-arc',
    name: '가르는 호',
    mpCost: 14,
    erosion: 40,
    attack: { power: 220, element: 'thunder', kind: 'magical' },
  },

  // ── T-028a: 유물이 늘면서 함께 들어온 액티브 ──────────────────────────────

  'tide-lash': {
    id: 'tide-lash',
    name: '밀물 채찍',
    mpCost: 5,
    // 실효 위력 141.5 (125 + 수면 55 × 0.3). 침식은 실효 위력을 따라간다.
    erosion: 20,
    attack: { power: 125, element: 'water', kind: 'magical' },
    // 재우는 대신 위력을 낮춘다. 수면은 피격하면 풀리므로 확률을 높게 잡아도 지배적이지 않다.
    inflict: { kind: 'sleep', chance: 0.3 },
  },

  'storm-needle': {
    id: 'storm-needle',
    name: '번개 침',
    mpCost: 6,
    // 실효 위력 152.5 (135 + 마비 70 × 0.25)
    erosion: 24,
    attack: { power: 135, element: 'thunder', kind: 'physical' },
    inflict: { kind: 'paralysis', chance: 0.25 },
  },

  // 방어형 유물의 액티브. 위력이 낮은 만큼 침식도 낮다 —
  // "지키는 유물은 천천히 탄다" 를 등급이 아니라 스킬 쪽에서 표현한다.
  'ward-strike': {
    id: 'ward-strike',
    name: '방벽 치기',
    mpCost: 3,
    erosion: 6,
    attack: { power: 110, element: 'earth', kind: 'physical' },
  },

  'ember-burst': {
    id: 'ember-burst',
    name: '잿불 터짐',
    mpCost: 9,
    erosion: 25,
    attack: { power: 170, element: 'fire', kind: 'magical' },
  },

  // 공허는 깎기보다 **막는다**. 침묵은 스킬을 봉인하므로 위력이 낮아도 값어치가 있다.
  'hollow-bite': {
    id: 'hollow-bite',
    name: '공허 물기',
    mpCost: 7,
    // 실효 위력 133 (105 + 침묵 80 × 0.35). 위력만 보면 가장 약한데 침식은 중간이다 —
    // 그게 상태이상의 값어치를 침식으로 매긴다는 뜻이다.
    erosion: 18,
    attack: { power: 105, element: 'none', kind: 'magical' },
    inflict: { kind: 'silence', chance: 0.35 },
  },
};

export const skillRegistry = createRegistry('스킬', SKILLS, (skill) => skill.id);

export function skill(id: string): Skill {
  return skillRegistry.get(id);
}
