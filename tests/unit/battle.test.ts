import { describe, expect, it } from 'vitest';
import {
  actorById,
  battleOutcome,
  createBattle,
  currentActor,
  fleeChance,
  isAlive,
  step,
  validTargets,
  type BattleActor,
  type BattleState,
  type BattleTuning,
} from '../../src/core/battle/index.js';
import type { DamageTuning } from '../../src/core/battle/damage.js';
import type { Skill } from '../../src/core/battle/skill.js';

/** 변동폭·치명타를 끈 결정론 설정. 전투 흐름을 볼 때 데미지가 흔들리면 검사가 어렵다. */
const FLAT_DAMAGE: DamageTuning = {
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
};

const TUNING: BattleTuning = {
  turnOrder: { jitter: 0.15 },
  damage: FLAT_DAMAGE,
  flee: { baseChance: 0.5, agiFactor: 0.02, minChance: 0.1, maxChance: 0.95 },
  erosion: { threshold: 100, reliefRatio: 0.5, max: 200 },
};

const NO_JITTER: BattleTuning = { ...TUNING, turnOrder: { jitter: 0 } };

const actor = (
  id: string,
  side: BattleActor['side'],
  agi: number,
  hp = 100,
): BattleActor => ({
  id,
  name: id,
  side,
  stats: { maxHp: 100, maxMp: 20, atk: 10, def: 5, mag: 8, res: 5, agi, luk: 5 },
  hp,
  mp: 20,
  erosion: 0,
});

/** 민첩 격차가 커서 흔들림으로는 순서가 뒤집히지 않는 편성 */
const roster = (): BattleActor[] => [
  actor('hero', 'party', 30),
  actor('mage', 'party', 10),
  actor('slime', 'enemy', 20),
];

const runPass = (state: BattleState, tuning = TUNING): ReturnType<typeof step> => {
  const acting = currentActor(state);
  if (acting === undefined) throw new Error('행동할 액터가 없습니다.');
  return step(state, { type: 'pass', actor: acting.id }, tuning);
};

describe('createBattle', () => {
  it('민첩이 높은 순으로 큐를 만든다', () => {
    const state = createBattle(roster(), 1, NO_JITTER);
    expect(state.queue).toEqual(['hero', 'slime', 'mage']);
    expect(state.round).toBe(1);
    expect(state.outcome).toBe('ongoing');
  });

  it('참가자가 없으면 던진다', () => {
    expect(() => createBattle([], 1, TUNING)).toThrow(RangeError);
  });

  it('죽은 액터는 큐에 들어가지 않는다', () => {
    const state = createBattle([...roster(), actor('corpse', 'enemy', 99, 0)], 1, NO_JITTER);
    expect(state.queue).not.toContain('corpse');
  });

  it('동점은 id 순으로 끊어 항상 같은 순서가 나온다', () => {
    const tied = [actor('b', 'party', 10), actor('a', 'party', 10), actor('x', 'enemy', 10)];
    expect(createBattle(tied, 7, NO_JITTER).queue).toEqual(['a', 'b', 'x']);
  });
});

describe('결정론 (ADR-002)', () => {
  it('같은 시드는 같은 전개를 낳는다', () => {
    const run = (): string[] => {
      let state = createBattle(roster(), 4821, TUNING);
      const order: string[] = [];
      for (let i = 0; i < 12; i += 1) {
        order.push(state.queue[0] as string);
        state = runPass(state).state;
      }
      return order;
    };

    expect(run()).toEqual(run());
  });

  it('rngState 로 전투를 이어받을 수 있다', () => {
    let state = createBattle(roster(), 99, TUNING);
    for (let i = 0; i < 5; i += 1) state = runPass(state).state;

    // 상태를 그대로 복사해 이어가면 같은 전개가 나온다.
    const resumed: BattleState = { ...state };
    const a: string[] = [];
    const b: string[] = [];
    let s1 = state;
    let s2 = resumed;
    for (let i = 0; i < 8; i += 1) {
      a.push(s1.queue[0] as string);
      b.push(s2.queue[0] as string);
      s1 = runPass(s1).state;
      s2 = runPass(s2).state;
    }
    expect(a).toEqual(b);
  });

  it('흔들림이 민첩 격차를 뒤집지는 않는다', () => {
    // 30 vs 10 은 15% 흔들림으로 뒤집히지 않아야 한다.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const queue = createBattle(roster(), seed, TUNING).queue;
      expect(queue.indexOf('hero'), `시드 ${seed}`).toBeLessThan(queue.indexOf('mage'));
    }
  });

  it('흔들림이 0이면 시드와 무관하게 같은 순서다', () => {
    const a = createBattle(roster(), 1, NO_JITTER).queue;
    const b = createBattle(roster(), 12345, NO_JITTER).queue;
    expect(a).toEqual(b);
  });
});

describe('step', () => {
  it('턴 시작·종료 이벤트를 낸다', () => {
    const state = createBattle(roster(), 1, NO_JITTER);
    const { events } = runPass(state);
    expect(events).toEqual([
      { type: 'turnStart', actor: 'hero' },
      { type: 'turnEnd', actor: 'hero' },
    ]);
  });

  it('큐를 하나씩 소비한다', () => {
    let state = createBattle(roster(), 1, NO_JITTER);
    expect(state.queue).toHaveLength(3);
    state = runPass(state, NO_JITTER).state;
    expect(state.queue).toEqual(['slime', 'mage']);
  });

  it('큐가 비면 다음 라운드를 시작한다', () => {
    let state = createBattle(roster(), 1, NO_JITTER);
    const firstEvents = runPass(state, NO_JITTER).events;
    state = runPass(state, NO_JITTER).state;
    state = runPass(state, NO_JITTER).state;

    const third = runPass(state, NO_JITTER);
    expect(third.state.round).toBe(2);
    expect(third.state.queue).toHaveLength(3);
    expect(third.events).toContainEqual({ type: 'roundStart', round: 2 });
    expect(firstEvents).not.toContainEqual({ type: 'roundStart', round: 2 });
  });

  it('차례가 아닌 액터의 커맨드를 거부한다', () => {
    const state = createBattle(roster(), 1, NO_JITTER);
    expect(() => step(state, { type: 'pass', actor: 'mage' }, NO_JITTER)).toThrow(/지금 차례는/);
  });

  it('입력 상태를 변경하지 않는다', () => {
    const state = createBattle(roster(), 1, NO_JITTER);
    const before = [...state.queue];
    runPass(state, NO_JITTER);
    expect(state.queue).toEqual(before);
  });

  it('끝난 전투에서는 던진다', () => {
    const wiped = [actor('hero', 'party', 30, 0), actor('slime', 'enemy', 20)];
    const state = createBattle(wiped, 1, NO_JITTER);
    expect(state.outcome).toBe('defeat');
    expect(() => step(state, { type: 'pass', actor: 'slime' }, NO_JITTER)).toThrow(/이미 끝난/);
  });
});

describe('공격 커맨드', () => {
  const attackRoster = (): BattleActor[] => [
    actor('hero', 'party', 30),
    actor('slime', 'enemy', 20),
  ];

  it('대상의 HP 를 깎고 damage 이벤트를 낸다', () => {
    const state = createBattle(attackRoster(), 1, NO_JITTER);
    const { state: next, events } = step(
      state,
      { type: 'attack', actor: 'hero', target: 'slime' },
      NO_JITTER,
    );

    // atk 10, def 5*0.5=2.5 => 7.5 => 반올림 8
    expect(actorById(next, 'slime').hp).toBe(92);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'damage', source: 'hero', target: 'slime', amount: 8 }),
    );
  });

  it('쓰러뜨리면 death 와 battleEnd 를 낸다', () => {
    const dying = [actor('hero', 'party', 30), actor('slime', 'enemy', 20, 1)];
    const state = createBattle(dying, 1, NO_JITTER);
    const { state: next, events } = step(
      state,
      { type: 'attack', actor: 'hero', target: 'slime' },
      NO_JITTER,
    );

    expect(events).toContainEqual({ type: 'death', actor: 'slime' });
    expect(events).toContainEqual({ type: 'battleEnd', outcome: 'victory' });
    expect(next.outcome).toBe('victory');
  });

  it('없는 대상과 이미 쓰러진 대상을 거부한다', () => {
    const state = createBattle([...attackRoster(), actor('corpse', 'enemy', 5, 0)], 1, NO_JITTER);
    expect(() => step(state, { type: 'attack', actor: 'hero', target: 'ghost' }, NO_JITTER)).toThrow(
      /전투에 없습니다/,
    );
    expect(() =>
      step(state, { type: 'attack', actor: 'hero', target: 'corpse' }, NO_JITTER),
    ).toThrow(/이미 쓰러졌습니다/);
  });

  it('원본 상태를 변경하지 않는다', () => {
    const state = createBattle(attackRoster(), 1, NO_JITTER);
    step(state, { type: 'attack', actor: 'hero', target: 'slime' }, NO_JITTER);
    expect(actorById(state, 'slime').hp).toBe(100);
  });
});

describe('방어 커맨드', () => {
  const pair = (): BattleActor[] => [actor('hero', 'party', 30), actor('slime', 'enemy', 20)];

  it('방어 상태가 되고 피해가 줄어든다', () => {
    let state = createBattle(pair(), 1, NO_JITTER);
    const guarded = step(state, { type: 'guard', actor: 'hero' }, NO_JITTER);
    expect(guarded.events).toContainEqual({ type: 'guard', actor: 'hero' });
    expect(actorById(guarded.state, 'hero').guarding).toBe(true);

    state = step(guarded.state, { type: 'attack', actor: 'slime', target: 'hero' }, NO_JITTER).state;
    // 평소 8 → 방어로 4
    expect(actorById(state, 'hero').hp).toBe(96);
  });

  it('다음 자기 턴이 시작되면 풀린다', () => {
    let state: BattleState = createBattle(pair(), 1, NO_JITTER);
    state = step(state, { type: 'guard', actor: 'hero' }, NO_JITTER).state;
    state = step(state, { type: 'pass', actor: 'slime' }, NO_JITTER).state;
    // 새 라운드, 다시 hero 차례
    state = step(state, { type: 'pass', actor: 'hero' }, NO_JITTER).state;
    expect(actorById(state, 'hero').guarding).toBe(false);
  });
});

describe('도망 커맨드', () => {
  const swift = (): BattleActor[] => [actor('hero', 'party', 100), actor('slime', 'enemy', 10)];
  const slow = (): BattleActor[] => [actor('hero', 'party', 1), actor('slime', 'enemy', 200)];

  it('민첩이 높으면 성공률이 높다', () => {
    const fast = createBattle(swift(), 1, TUNING);
    const sluggish = createBattle(slow(), 1, TUNING);
    expect(fleeChance(fast, 'hero', TUNING.flee)).toBeGreaterThan(
      fleeChance(sluggish, 'hero', TUNING.flee),
    );
  });

  it('성공률은 상한과 하한 사이에 머문다 (항상 도망칠 수는 없다)', () => {
    const fast = createBattle(swift(), 1, TUNING);
    const sluggish = createBattle(slow(), 1, TUNING);
    expect(fleeChance(fast, 'hero', TUNING.flee)).toBeLessThanOrEqual(TUNING.flee.maxChance);
    expect(fleeChance(sluggish, 'hero', TUNING.flee)).toBeGreaterThanOrEqual(TUNING.flee.minChance);
  });

  it('성공하면 전투가 fled 로 끝난다', () => {
    const always: BattleTuning = { ...TUNING, flee: { ...TUNING.flee, minChance: 1, maxChance: 1 } };
    const state = createBattle(swift(), 1, always);
    const { state: next, events } = step(state, { type: 'flee', actor: 'hero' }, always);

    expect(events).toContainEqual({ type: 'flee', actor: 'hero', success: true });
    expect(next.outcome).toBe('fled');
    expect(() => step(next, { type: 'pass', actor: 'slime' }, always)).toThrow(/이미 끝난/);
  });

  it('실패하면 턴만 소모한다', () => {
    const never: BattleTuning = { ...TUNING, flee: { ...TUNING.flee, minChance: 0, maxChance: 0 } };
    const state = createBattle(swift(), 1, never);
    const { state: next, events } = step(state, { type: 'flee', actor: 'hero' }, never);

    expect(events).toContainEqual({ type: 'flee', actor: 'hero', success: false });
    expect(next.outcome).toBe('ongoing');
    expect(next.queue[0]).toBe('slime');
  });

  it('적은 도망칠 수 없다', () => {
    let state = createBattle(swift(), 1, NO_JITTER);
    state = step(state, { type: 'pass', actor: 'hero' }, NO_JITTER).state;
    expect(() => step(state, { type: 'flee', actor: 'slime' }, NO_JITTER)).toThrow(/파티만/);
  });
});

describe('스킬 커맨드', () => {
  const blaze: Skill = {
    id: 'blaze',
    name: '불꽃',
    mpCost: 4,
    erosion: 30,
    attack: { power: 200, element: 'fire', kind: 'magical' },
  };

  const pair = (): BattleActor[] => [actor('hero', 'party', 30), actor('slime', 'enemy', 20)];

  it('MP 를 쓰고 침식을 쌓으며 피해를 준다', () => {
    const state = createBattle(pair(), 1, NO_JITTER);
    const { state: next, events } = step(
      state,
      { type: 'skill', actor: 'hero', target: 'slime', skill: blaze },
      NO_JITTER,
    );

    const hero = actorById(next, 'hero');
    expect(hero.mp).toBe(16);
    expect(hero.erosion).toBe(30);
    expect(events).toContainEqual({ type: 'skillUsed', actor: 'hero', skill: 'blaze' });
    expect(events).toContainEqual({ type: 'erosion', actor: 'hero', value: 30 });
    expect(actorById(next, 'slime').hp).toBeLessThan(100);
  });

  it('MP 가 모자라면 거부하고 상태를 건드리지 않는다', () => {
    const poor = [{ ...actor('hero', 'party', 30), mp: 1 }, actor('slime', 'enemy', 20)];
    const state = createBattle(poor, 1, NO_JITTER);
    expect(() =>
      step(state, { type: 'skill', actor: 'hero', target: 'slime', skill: blaze }, NO_JITTER),
    ).toThrow(/MP/);
    expect(actorById(state, 'slime').hp).toBe(100);
  });

  it('스킬 속성이 대상 내성에 걸린다', () => {
    const resistant: BattleActor = { ...actor('slime', 'enemy', 20), affinity: { fire: 0.5 } };
    const state = createBattle([actor('hero', 'party', 30), resistant], 1, NO_JITTER);
    const { events } = step(
      state,
      { type: 'skill', actor: 'hero', target: 'slime', skill: blaze },
      NO_JITTER,
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'damage', element: 'fire', elementMod: 0.5 }),
    );
  });
});

describe('폭주 (침식 한계)', () => {
  const overloaded = (): BattleActor[] => [
    { ...actor('hero', 'party', 30), erosion: 120 },
    actor('ally', 'party', 25),
    actor('slime', 'enemy', 20),
  ];

  it('커맨드를 무시하고 아무나 공격한다', () => {
    const state = createBattle(overloaded(), 1, NO_JITTER);
    const { state: next, events } = step(state, { type: 'pass', actor: 'hero' }, NO_JITTER);

    expect(events).toContainEqual({ type: 'overload', actor: 'hero' });
    expect(events.some((e) => e.type === 'damage')).toBe(true);

    // 대상은 아군일 수도 적일 수도 있다 — 제어를 잃었으므로.
    const hurt = next.actors.filter((a) => a.id !== 'hero' && a.hp < 100);
    expect(hurt).toHaveLength(1);
  });

  it('폭주 후 침식이 일부 해소되고 상태가 풀린다', () => {
    const state = createBattle(overloaded(), 1, NO_JITTER);
    const { state: next, events } = step(state, { type: 'pass', actor: 'hero' }, NO_JITTER);

    expect(actorById(next, 'hero').erosion).toBe(60);
    expect(events).toContainEqual({ type: 'erosion', actor: 'hero', value: 60 });
  });

  it('폭주 중에는 스킬을 쓸 수 없다 — 커맨드 자체가 무시된다', () => {
    const blaze: Skill = {
      id: 'blaze',
      name: '불꽃',
      mpCost: 4,
      erosion: 30,
      attack: { power: 200, element: 'fire', kind: 'magical' },
    };
    const state = createBattle(overloaded(), 1, NO_JITTER);
    const { state: next, events } = step(
      state,
      { type: 'skill', actor: 'hero', target: 'slime', skill: blaze },
      NO_JITTER,
    );

    // 스킬은 발동하지 않았다.
    expect(events.some((e) => e.type === 'skillUsed')).toBe(false);
    expect(actorById(next, 'hero').mp).toBe(20);
  });

  it('턴은 정상적으로 넘어간다', () => {
    const state = createBattle(overloaded(), 1, NO_JITTER);
    const { state: next, events } = step(state, { type: 'pass', actor: 'hero' }, NO_JITTER);
    expect(events).toContainEqual({ type: 'turnEnd', actor: 'hero' });
    expect(next.queue[0]).not.toBe('hero');
  });
});

describe('validTargets', () => {
  it('상대편 생존자만 돌려준다', () => {
    const state = createBattle(
      [actor('hero', 'party', 30), actor('slime', 'enemy', 20), actor('corpse', 'enemy', 5, 0)],
      1,
      NO_JITTER,
    );
    expect(validTargets(state, 'hero').map((a) => a.id)).toEqual(['slime']);
    expect(validTargets(state, 'slime').map((a) => a.id)).toEqual(['hero']);
  });
});

describe('battleOutcome', () => {
  it('적이 전멸하면 승리', () => {
    expect(battleOutcome([actor('hero', 'party', 10), actor('slime', 'enemy', 10, 0)])).toBe(
      'victory',
    );
  });

  it('파티가 전멸하면 패배', () => {
    expect(battleOutcome([actor('hero', 'party', 10, 0), actor('slime', 'enemy', 10)])).toBe(
      'defeat',
    );
  });

  it('양쪽이 동시에 전멸하면 패배로 본다 (살아남지 못했다면 이긴 것이 아니다)', () => {
    expect(battleOutcome([actor('hero', 'party', 10, 0), actor('slime', 'enemy', 10, 0)])).toBe(
      'defeat',
    );
  });

  it('둘 다 살아 있으면 진행 중', () => {
    expect(battleOutcome(roster())).toBe('ongoing');
  });
});

describe('조회 도우미', () => {
  const state = createBattle(roster(), 1, NO_JITTER);

  it('id 로 찾는다', () => {
    expect(actorById(state, 'mage').name).toBe('mage');
  });

  it('없는 id 는 참가자 목록과 함께 던진다', () => {
    expect(() => actorById(state, 'ghost')).toThrow(/hero, mage, slime/);
  });

  it('현재 차례를 알려준다', () => {
    expect(currentActor(state)?.id).toBe('hero');
  });

  it('isAlive 는 HP 로 판정한다', () => {
    expect(isAlive(actor('x', 'party', 1, 1))).toBe(true);
    expect(isAlive(actor('x', 'party', 1, 0))).toBe(false);
  });
});
