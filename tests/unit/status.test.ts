import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng/index.js';
import type { BattleActor } from '../../src/core/battle/index.js';
import {
  AILMENTS,
  addAilment,
  ailmentsOf,
  clearAilments,
  confusionHits,
  hasAilment,
  incapacitatedBy,
  poisonDamage,
  removeAilment,
  tickAilments,
  type AilmentTuning,
} from '../../src/core/battle/status.js';

const TUNING: AilmentTuning = {
  poisonPercent: 0.06,
  paralysisSkipChance: 0.4,
  confusionChance: 0.5,
  defaultTurns: { poison: 5, paralysis: 3, sleep: 4, silence: 3, confusion: 3 },
};

const actor = (overrides: Partial<BattleActor> = {}): BattleActor => ({
  id: 'hero',
  name: 'hero',
  side: 'party',
  stats: { maxHp: 100, maxMp: 20, atk: 40, def: 20, mag: 30, res: 15, agi: 10, luk: 0 },
  hp: 100,
  mp: 20,
  erosion: 0,
  ...overrides,
});

describe('상태이상 부여', () => {
  it('없던 이상을 건다', () => {
    const poisoned = addAilment(actor(), 'poison', 5);
    expect(hasAilment(poisoned, 'poison')).toBe(true);
    expect(ailmentsOf(poisoned)).toEqual([{ kind: 'poison', turns: 5 }]);
  });

  it('여러 이상을 동시에 걸 수 있다', () => {
    let target = addAilment(actor(), 'poison', 5);
    target = addAilment(target, 'silence', 3);
    expect(ailmentsOf(target)).toHaveLength(2);
  });

  it('같은 이상을 다시 걸면 누적하지 않고 긴 쪽으로 갱신한다', () => {
    // 누적을 허용하면 반복 시전으로 사실상 영구 봉인이 되고,
    // "수면 걸고 때리기" 가 지배 전략이 된다.
    let target = addAilment(actor(), 'sleep', 4);
    target = addAilment(target, 'sleep', 2);
    expect(ailmentsOf(target)).toEqual([{ kind: 'sleep', turns: 4 }]);

    target = addAilment(target, 'sleep', 7);
    expect(ailmentsOf(target)).toEqual([{ kind: 'sleep', turns: 7 }]);
  });

  it('지속 턴이 0 이하면 던진다', () => {
    expect(() => addAilment(actor(), 'poison', 0)).toThrow(RangeError);
  });

  it('제거와 전체 해제', () => {
    let target = addAilment(addAilment(actor(), 'poison', 5), 'sleep', 4);
    expect(hasAilment(removeAilment(target, 'poison'), 'poison')).toBe(false);
    target = clearAilments(target);
    expect(ailmentsOf(target)).toEqual([]);
  });

  it('원본을 변경하지 않는다', () => {
    const original = actor();
    addAilment(original, 'poison', 5);
    expect(ailmentsOf(original)).toEqual([]);
  });
});

describe('tickAilments', () => {
  it('지속 턴을 하나씩 깎는다', () => {
    const target = addAilment(actor(), 'poison', 3);
    expect(tickAilments(target).actor.ailments).toEqual([{ kind: 'poison', turns: 2 }]);
  });

  it('0이 되면 사라지고 만료 목록에 담긴다', () => {
    const target = addAilment(actor(), 'silence', 1);
    const result = tickAilments(target);
    expect(result.actor.ailments).toEqual([]);
    expect(result.expired).toEqual(['silence']);
  });

  it('여러 이상이 각자 만료된다', () => {
    let target = addAilment(actor(), 'poison', 1);
    target = addAilment(target, 'sleep', 3);
    const result = tickAilments(target);
    expect(result.expired).toEqual(['poison']);
    expect(result.actor.ailments).toEqual([{ kind: 'sleep', turns: 2 }]);
  });

  it('이상이 없어도 안전하다', () => {
    expect(tickAilments(actor()).expired).toEqual([]);
  });
});

describe('poisonDamage', () => {
  it('최대 HP 비율로 계산한다', () => {
    expect(poisonDamage(actor(), TUNING)).toBe(6);
  });

  it('비율이 아무리 작아도 최소 1은 깎는다', () => {
    const tiny: AilmentTuning = { ...TUNING, poisonPercent: 0.0001 };
    expect(poisonDamage(actor(), tiny)).toBe(1);
  });

  it('현재 HP 가 아니라 최대 HP 기준이다 (빈사여도 같은 양)', () => {
    expect(poisonDamage(actor({ hp: 3 }), TUNING)).toBe(6);
  });
});

describe('incapacitatedBy', () => {
  it('수면은 확정으로 행동을 막는다', () => {
    const asleep = addAilment(actor(), 'sleep', 4);
    for (let i = 0; i < 20; i += 1) {
      expect(incapacitatedBy(asleep, createRng(i), TUNING)).toBe('sleep');
    }
  });

  it('마비는 확률적으로 막는다', () => {
    const paralyzed = addAilment(actor(), 'paralysis', 3);
    const always: AilmentTuning = { ...TUNING, paralysisSkipChance: 1 };
    const never: AilmentTuning = { ...TUNING, paralysisSkipChance: 0 };

    expect(incapacitatedBy(paralyzed, createRng(1), always)).toBe('paralysis');
    expect(incapacitatedBy(paralyzed, createRng(1), never)).toBeUndefined();
  });

  it('수면을 마비보다 먼저 본다 (확정이 확률보다 먼저여야 RNG 소비가 흔들리지 않는다)', () => {
    let both = addAilment(actor(), 'sleep', 4);
    both = addAilment(both, 'paralysis', 3);
    expect(incapacitatedBy(both, createRng(1), TUNING)).toBe('sleep');
  });

  it('독·침묵·혼란은 행동 자체를 막지 않는다', () => {
    for (const kind of ['poison', 'silence', 'confusion'] as const) {
      const target = addAilment(actor(), kind, 3);
      expect(incapacitatedBy(target, createRng(1), TUNING), kind).toBeUndefined();
    }
  });
});

describe('confusionHits', () => {
  it('혼란이 없으면 발동하지 않는다', () => {
    const always: AilmentTuning = { ...TUNING, confusionChance: 1 };
    expect(confusionHits(actor(), createRng(1), always)).toBe(false);
  });

  it('혼란이 있으면 확률에 따른다', () => {
    const confused = addAilment(actor(), 'confusion', 3);
    expect(confusionHits(confused, createRng(1), { ...TUNING, confusionChance: 1 })).toBe(true);
    expect(confusionHits(confused, createRng(1), { ...TUNING, confusionChance: 0 })).toBe(false);
  });
});

describe('이상 목록', () => {
  it('다섯 가지가 모두 기본 지속 턴을 갖는다', () => {
    for (const kind of AILMENTS) {
      expect(TUNING.defaultTurns[kind], kind).toBeGreaterThan(0);
    }
  });
});
