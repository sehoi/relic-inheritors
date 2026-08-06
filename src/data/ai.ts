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

/**
 * 잡몹 AI (T-050).
 *
 * **속성 약점만 다르면 적이 여섯이어도 싸움은 하나다.** 무엇을 하는 놈인지가 달라야
 * 대상 선택과 조합이 달라진다. 넷을 서로 다른 축으로 갈랐다:
 *
 * | 프로필 | 무엇이 다른가 | 플레이어가 배우는 것 |
 * |---|---|---|
 * | `tainter` | 독을 건다 | 해독제를 챙기거나 빨리 끝낸다 |
 * | `bulwark` | 자주 막고 단단한 쪽을 친다 | 오래 걸리니 MP 배분이 달라진다 |
 * | `stalker` | **약한 쪽만 집요하게** 친다 | 낮은 HP 파티원을 방치할 수 없다 |
 * | `ravager` | 막지 않고 세게 친다 | 먼저 잡아야 할 대상이 생긴다 |
 *
 * 페이즈는 두지 않는다 — 잡몹전은 3~6라운드라 전환이 일어날 틈이 없고,
 * 페이즈는 보스가 긴 전투에서 쓰는 장치다 (`warden`).
 */

/** 독을 묻히는 놈. 오래 끌수록 손해가 쌓인다. */
const tainter: AiProfile = {
  id: 'tainter',
  phases: [
    {
      id: 'always',
      options: [
        { weight: 5, kind: 'skill', skill: skill('rot-touch'), targeting: 'random' },
        { weight: 5, kind: 'attack', targeting: 'random' },
      ],
    },
  ],
};

/** 버티는 놈. 단단한 쪽을 쳐서 **약한 파티원이 살아남게** 둔다 — 그래서 오래 간다. */
const bulwark: AiProfile = {
  id: 'bulwark',
  phases: [
    {
      id: 'always',
      options: [
        { weight: 5, kind: 'attack', targeting: 'toughest' },
        { weight: 4, kind: 'guard' },
        { weight: 2, kind: 'skill', skill: skill('ward-strike'), targeting: 'toughest' },
      ],
    },
  ],
};

/**
 * 약한 쪽만 노리는 놈.
 *
 * **이 게임에서 가장 위험한 성격이다.** 다른 적이 흩어서 때리는 피해를 한 사람에게
 * 모아주므로, 낮은 HP 파티원을 방치하면 그대로 쓰러진다.
 */
const stalker: AiProfile = {
  id: 'stalker',
  phases: [
    {
      id: 'always',
      options: [
        { weight: 7, kind: 'attack', targeting: 'weakest' },
        { weight: 3, kind: 'skill', skill: skill('storm-needle'), targeting: 'weakest' },
      ],
    },
  ],
};

/** 막지 않고 세게 치는 놈. 먼저 잡아야 할 대상이 생긴다. */
const ravager: AiProfile = {
  id: 'ravager',
  phases: [
    {
      id: 'always',
      options: [
        { weight: 4, kind: 'attack', targeting: 'random' },
        { weight: 6, kind: 'skill', skill: skill('hollow-bite'), targeting: 'random' },
      ],
    },
  ],
};

export const MOB_AI_PROFILES = { tainter, bulwark, stalker, ravager } as const;

export const aiRegistry = createRegistry(
  'AI 프로필',
  { ...AI_PROFILES, ...MOB_AI_PROFILES },
  (profile) => profile.id,
);

export function aiProfile(id: string): AiProfile {
  return aiRegistry.get(id);
}
