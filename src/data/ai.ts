import { createRegistry } from '../core/data/registry.js';
import type { AiProfile } from '../core/battle/ai.js';
// 인덱스 접근이 아니라 접근자를 쓴다 — id 오타가 모듈을 불러오는 순간 터진다.
import { skill } from './skills.js';

/**
 * 적 AI 프로필.
 *
 * 실제 적 콘텐츠는 M5(수직 슬라이스)에서 채운다. 여기 둘은 AI 시스템을 굴려보고
 * **페이즈 전환이 실제로 체감되는지** 확인하기 위한 표본이다.
 */
export const AI_PROFILES: Readonly<Record<string, AiProfile>> = {
  /**
   * 파티 측정용. 시뮬레이터가 파티를 굴릴 때 쓴다.
   * 스킬 비중을 넣어 **MP 와 침식이 실제로 소모되게** 한다 — 기본 공격만 반복하면
   * 자원 압박이 측정되지 않는다.
   */
  striker: {
    id: 'striker',
    phases: [
      {
        id: 'always',
        options: [
          { weight: 6, kind: 'attack', targeting: 'weakest' },
          { weight: 4, kind: 'skill', skill: skill('ember-lash'), targeting: 'weakest' },
        ],
      },
    ],
  },

  // 단순 근접 적. 가끔 방어한다.
  brute: {
    id: 'brute',
    phases: [
      {
        id: 'always',
        options: [
          { weight: 8, kind: 'attack', targeting: 'random' },
          { weight: 2, kind: 'guard' },
        ],
      },
    ],
  },

  /**
   * 2페이즈 보스.
   *
   * 체력이 절반 아래로 떨어지면 방어를 버리고 강한 스킬 비중을 높인다.
   * 페이즈 목록은 위에서부터 첫 조건 만족 순이므로, **좁은 조건을 먼저 둔다.**
   */
  warden: {
    id: 'warden',
    phases: [
      {
        id: 'enraged',
        hpAtOrBelow: 0.5,
        options: [
          { weight: 5, kind: 'skill', skill: skill('sundering-arc'), targeting: 'weakest' },
          { weight: 4, kind: 'attack', targeting: 'weakest' },
        ],
      },
      {
        id: 'calm',
        options: [
          { weight: 5, kind: 'attack', targeting: 'toughest' },
          { weight: 3, kind: 'skill', skill: skill('ember-lash'), targeting: 'random' },
          { weight: 2, kind: 'guard' },
        ],
      },
    ],
  },
};

export const aiRegistry = createRegistry('AI 프로필', AI_PROFILES, (profile) => profile.id);

export function aiProfile(id: string): AiProfile {
  return aiRegistry.get(id);
}
