import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng/index.js';
import {
  createBattle,
  type BattleActor,
  type BattleTuning,
} from '../../src/core/battle/index.js';
import {
  AiError,
  activePhase,
  chooseCommand,
  hpRatio,
  usableOptions,
  type AiProfile,
} from '../../src/core/battle/ai.js';
import type { Skill } from '../../src/core/battle/skill.js';
import { AI_PROFILES, aiProfile } from '../../src/data/ai.js';

const TUNING: BattleTuning = {
  turnOrder: { jitter: 0 },
  damage: {
    pierce: 0.2,
    defFactor: 0.5,
    varianceMin: 1,
    varianceMax: 1,
    critMultiplier: 1.5,
    critBaseChance: 0,
    critLukFactor: 0,
    critMaxChance: 0.5,
    guardMultiplier: 0.5,
    minDamage: 1,
  },
  flee: { baseChance: 0.5, agiFactor: 0.02, minChance: 0.1, maxChance: 0.95 },
  erosion: { threshold: 100, reliefRatio: 0.5, max: 200 },
  ailment: {
    poisonPercent: 0.06,
    paralysisSkipChance: 0,
    confusionChance: 0,
    defaultTurns: { poison: 5, paralysis: 3, sleep: 4, silence: 3, confusion: 3 },
  },
};

const bolt: Skill = {
  id: 'bolt',
  name: '번개',
  mpCost: 5,
  erosion: 10,
  attack: { power: 150, element: 'thunder', kind: 'magical' },
};

const actor = (
  id: string,
  side: BattleActor['side'],
  overrides: Partial<BattleActor> = {},
): BattleActor => ({
  id,
  name: id,
  side,
  stats: { maxHp: 100, maxMp: 20, atk: 20, def: 10, mag: 20, res: 10, agi: 10, luk: 0 },
  hp: 100,
  mp: 20,
  erosion: 0,
  ...overrides,
});

const field = (...extra: BattleActor[]): BattleActor[] => [
  actor('hero', 'party'),
  actor('mage', 'party', { hp: 30 }),
  actor('boss', 'enemy'),
  ...extra,
];

const battle = (actors = field()): ReturnType<typeof createBattle> =>
  createBattle(actors, 1, TUNING);

describe('hpRatio / activePhase', () => {
  const twoPhase: AiProfile = {
    id: 'two',
    phases: [
      { id: 'enraged', hpAtOrBelow: 0.5, options: [{ weight: 1, kind: 'attack' }] },
      { id: 'calm', options: [{ weight: 1, kind: 'guard' }] },
    ],
  };

  it('HP 비율을 계산한다', () => {
    expect(hpRatio(actor('x', 'enemy', { hp: 25 }))).toBe(0.25);
  });

  it('HP 가 높으면 조건 없는 페이즈로 떨어진다', () => {
    expect(activePhase(actor('x', 'enemy', { hp: 100 }), twoPhase).id).toBe('calm');
  });

  it('임계 이하로 떨어지면 페이즈가 바뀐다', () => {
    expect(activePhase(actor('x', 'enemy', { hp: 50 }), twoPhase).id).toBe('enraged');
    expect(activePhase(actor('x', 'enemy', { hp: 10 }), twoPhase).id).toBe('enraged');
  });

  it('목록 순서가 곧 우선순위다 (좁은 조건을 먼저 둬야 한다)', () => {
    const wrongOrder: AiProfile = {
      id: 'wrong',
      phases: [
        { id: 'wide', hpAtOrBelow: 1, options: [{ weight: 1, kind: 'attack' }] },
        { id: 'narrow', hpAtOrBelow: 0.2, options: [{ weight: 1, kind: 'guard' }] },
      ],
    };
    // 넓은 조건이 위에 있으면 좁은 조건은 영원히 도달하지 않는다.
    expect(activePhase(actor('x', 'enemy', { hp: 5 }), wrongOrder).id).toBe('wide');
  });

  it('페이즈가 없으면 던진다', () => {
    expect(() => activePhase(actor('x', 'enemy'), { id: 'empty', phases: [] })).toThrow(AiError);
  });
});

describe('usableOptions', () => {
  const phase = {
    id: 'p',
    options: [
      { weight: 1, kind: 'attack' as const },
      { weight: 1, kind: 'skill' as const, skill: bolt },
      { weight: 0, kind: 'guard' as const },
    ],
  };

  it('가중치 0 인 선택지를 뺀다', () => {
    expect(usableOptions(actor('x', 'enemy'), phase, TUNING).map((o) => o.kind)).toEqual([
      'attack',
      'skill',
    ]);
  });

  it('MP 가 모자라면 스킬을 뺀다', () => {
    const poor = actor('x', 'enemy', { mp: 1 });
    expect(usableOptions(poor, phase, TUNING).map((o) => o.kind)).toEqual(['attack']);
  });

  it('침묵이면 스킬을 뺀다', () => {
    const silenced = actor('x', 'enemy', { ailments: [{ kind: 'silence', turns: 3 }] });
    expect(usableOptions(silenced, phase, TUNING).map((o) => o.kind)).toEqual(['attack']);
  });

  it('폭주 중이면 스킬을 뺀다', () => {
    const wild = actor('x', 'enemy', { erosion: 150 });
    expect(usableOptions(wild, phase, TUNING).map((o) => o.kind)).toEqual(['attack']);
  });

  it('skill 인데 스킬이 없으면 뺀다', () => {
    const broken = { id: 'p', options: [{ weight: 1, kind: 'skill' as const }] };
    expect(usableOptions(actor('x', 'enemy'), broken, TUNING)).toEqual([]);
  });
});

describe('chooseCommand', () => {
  const attackOnly: AiProfile = {
    id: 'attacker',
    phases: [{ id: 'p', options: [{ weight: 1, kind: 'attack', targeting: 'weakest' }] }],
  };

  it('가장 약한 대상을 고른다', () => {
    const command = chooseCommand(battle(), 'boss', attackOnly, createRng(1), TUNING);
    expect(command).toEqual({ type: 'attack', actor: 'boss', target: 'mage' });
  });

  it('가장 튼튼한 대상을 고른다', () => {
    const toughest: AiProfile = {
      id: 't',
      phases: [{ id: 'p', options: [{ weight: 1, kind: 'attack', targeting: 'toughest' }] }],
    };
    const command = chooseCommand(battle(), 'boss', toughest, createRng(1), TUNING);
    expect(command).toEqual({ type: 'attack', actor: 'boss', target: 'hero' });
  });

  it('같은 시드는 같은 커맨드를 낳는다', () => {
    const mixed: AiProfile = {
      id: 'mixed',
      phases: [
        {
          id: 'p',
          options: [
            { weight: 1, kind: 'attack', targeting: 'random' },
            { weight: 1, kind: 'guard' },
            { weight: 1, kind: 'skill', skill: bolt, targeting: 'random' },
          ],
        },
      ],
    };

    const run = (): unknown[] => {
      const rng = createRng(4821);
      return Array.from({ length: 15 }, () =>
        chooseCommand(battle(), 'boss', mixed, rng, TUNING),
      );
    };
    expect(run()).toEqual(run());
  });

  it('가중치가 큰 쪽이 더 자주 나온다', () => {
    const skewed: AiProfile = {
      id: 'skewed',
      phases: [
        {
          id: 'p',
          options: [
            { weight: 9, kind: 'attack', targeting: 'random' },
            { weight: 1, kind: 'guard' },
          ],
        },
      ],
    };

    const rng = createRng(7);
    let guards = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i += 1) {
      if (chooseCommand(battle(), 'boss', skewed, rng, TUNING).type === 'guard') guards += 1;
    }
    expect(guards / trials).toBeCloseTo(0.1, 1);
  });

  it('쓸 수 있는 선택지가 없으면 기본 공격으로 떨어진다', () => {
    const skillOnly: AiProfile = {
      id: 'caster',
      phases: [{ id: 'p', options: [{ weight: 1, kind: 'skill', skill: bolt }] }],
    };
    const drained = field();
    drained[2] = actor('boss', 'enemy', { mp: 0 });

    const command = chooseCommand(battle(drained), 'boss', skillOnly, createRng(1), TUNING);
    expect(command.type).toBe('attack');
  });

  it('대상이 없으면 방어한다 (던지지 않는다)', () => {
    const alone = [actor('hero', 'party', { hp: 0 }), actor('boss', 'enemy')];
    const command = chooseCommand(
      createBattle(alone, 1, TUNING),
      'boss',
      attackOnly,
      createRng(1),
      TUNING,
    );
    expect(command).toEqual({ type: 'guard', actor: 'boss' });
  });

  it('없는 액터·쓰러진 액터는 던진다', () => {
    expect(() => chooseCommand(battle(), 'ghost', attackOnly, createRng(1), TUNING)).toThrow(
      AiError,
    );
    const downed = field();
    downed[2] = actor('boss', 'enemy', { hp: 0 });
    expect(() =>
      chooseCommand(createBattle(downed, 1, TUNING), 'boss', attackOnly, createRng(1), TUNING),
    ).toThrow(/쓰러졌습니다/);
  });
});

describe('AI 프로필 데이터', () => {
  it('레지스트리로 조회된다', () => {
    expect(aiProfile('warden').phases).toHaveLength(2);
    expect(() => aiProfile('nope')).toThrow(/brute/);
  });

  it('모든 페이즈에 선택지가 있고 가중치가 양수다', () => {
    for (const profile of Object.values(AI_PROFILES)) {
      expect(profile.phases.length, profile.id).toBeGreaterThan(0);
      for (const phase of profile.phases) {
        expect(phase.options.length, `${profile.id}/${phase.id}`).toBeGreaterThan(0);
        for (const option of phase.options) {
          expect(option.weight, `${profile.id}/${phase.id}`).toBeGreaterThan(0);
          if (option.kind === 'skill') {
            expect(option.skill, `${profile.id}/${phase.id}`).toBeDefined();
          }
        }
      }
    }
  });

  it('조건 없는 페이즈가 마지막에 하나 있다 (없으면 특정 HP 에서 갈 곳이 없다)', () => {
    for (const profile of Object.values(AI_PROFILES)) {
      const last = profile.phases[profile.phases.length - 1];
      expect(last?.hpAtOrBelow, profile.id).toBeUndefined();
    }
  });

  it('보스는 HP 가 떨어지면 페이즈가 바뀐다', () => {
    const warden = aiProfile('warden');
    expect(activePhase(actor('boss', 'enemy', { hp: 100 }), warden).id).toBe('calm');
    expect(activePhase(actor('boss', 'enemy', { hp: 40 }), warden).id).toBe('enraged');
  });
});
