import { createRegistry } from '../core/data/registry.js';
import type { Skill } from '../core/battle/skill.js';

/**
 * 스킬.
 *
 * **본격적인 스킬 콘텐츠는 M3(유물 시스템)에서 온다.** GDD §5.1 대로 능력의 출처는
 * 캐릭터가 아니라 유물이고, 유물이 자신의 스킬을 들고 온다.
 * 여기 있는 셋은 전투 시스템을 굴려보기 위한 최소 표본이며, 침식 계수의 비례 감각
 * (위력이 높을수록 침식도 크게)을 고정해 두는 역할을 한다.
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
};

export const skillRegistry = createRegistry('스킬', SKILLS, (skill) => skill.id);

export function skill(id: string): Skill {
  return skillRegistry.get(id);
}
