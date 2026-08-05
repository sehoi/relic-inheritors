import { describe, expect, it } from 'vitest';
import {
  experienceOf,
  gainAll,
  gainAttunement,
  maxRank,
  rankOf,
  rankOfRelic,
  toNextRank,
  validateAttunementTuning,
  type AttunementTuning,
} from '../../src/core/relic/attunement.js';
import { activesOf, lockedActives } from '../../src/core/relic/index.js';
import { ATTUNEMENT, relic } from '../../src/data/relics.js';

const TUNING: AttunementTuning = { perUse: 5, thresholds: [0, 20, 60, 140] };

describe('rankOf', () => {
  it('임계에 따라 단계가 오른다', () => {
    expect(rankOf(0, TUNING)).toBe(0);
    expect(rankOf(19, TUNING)).toBe(0);
    expect(rankOf(20, TUNING)).toBe(1);
    expect(rankOf(59, TUNING)).toBe(1);
    expect(rankOf(140, TUNING)).toBe(3);
  });

  it('최고 단계를 넘지 않는다', () => {
    expect(rankOf(99_999, TUNING)).toBe(maxRank(TUNING));
    expect(maxRank(TUNING)).toBe(3);
  });
});

describe('toNextRank', () => {
  it('다음 단계까지 남은 양을 알려준다', () => {
    expect(toNextRank(0, TUNING)).toBe(20);
    expect(toNextRank(15, TUNING)).toBe(5);
  });

  it('최고 단계면 undefined 다', () => {
    expect(toNextRank(200, TUNING)).toBeUndefined();
  });
});

describe('gainAttunement', () => {
  it('사용 횟수만큼 쌓인다', () => {
    const after = gainAttunement({}, 'ember-coil', 3, TUNING);
    expect(experienceOf(after, 'ember-coil')).toBe(15);
  });

  it('여러 번에 걸쳐 누적된다', () => {
    let attunement = gainAttunement({}, 'ember-coil', 2, TUNING);
    attunement = gainAttunement(attunement, 'ember-coil', 2, TUNING);
    expect(rankOfRelic(attunement, 'ember-coil', TUNING)).toBe(1); // 20
  });

  it('0회면 그대로다', () => {
    const before = { 'ember-coil': 10 };
    expect(gainAttunement(before, 'ember-coil', 0, TUNING)).toBe(before);
  });

  it('음수를 거부한다', () => {
    expect(() => gainAttunement({}, 'ember-coil', -1, TUNING)).toThrow(RangeError);
  });

  it('원본을 변경하지 않는다', () => {
    const before = { 'ember-coil': 10 };
    gainAttunement(before, 'ember-coil', 5, TUNING);
    expect(before['ember-coil']).toBe(10);
  });

  it('유물마다 따로 쌓인다 (착용자가 아니라 유물에 귀속된다)', () => {
    let attunement = gainAttunement({}, 'ember-coil', 4, TUNING);
    attunement = gainAttunement(attunement, 'stone-seal', 1, TUNING);

    expect(experienceOf(attunement, 'ember-coil')).toBe(20);
    expect(experienceOf(attunement, 'stone-seal')).toBe(5);
  });
});

describe('gainAll', () => {
  it('여러 유물을 한 번에 반영한다', () => {
    const after = gainAll({}, { 'ember-coil': 2, 'stone-seal': 3 }, TUNING);
    expect(experienceOf(after, 'ember-coil')).toBe(10);
    expect(experienceOf(after, 'stone-seal')).toBe(15);
  });
});

describe('해금', () => {
  const core = relic('sundering-core');

  it('0단계에서는 잠긴 스킬을 쓸 수 없다', () => {
    const usable = activesOf([core], { 'sundering-core': 0 });
    expect(usable.map((s) => s.id)).toEqual(['ember-lash']);
  });

  it('단계가 오르면 열린다', () => {
    const usable = activesOf([core], { 'sundering-core': 2 });
    expect(usable.map((s) => s.id).sort()).toEqual(['ember-lash', 'sundering-arc']);
  });

  it('숙련도를 모르면 0단계로 본다 (해금되지 않은 스킬을 실수로 쓰지 않는다)', () => {
    expect(activesOf([core]).map((s) => s.id)).toEqual(['ember-lash']);
  });

  it('잠긴 목록을 알려준다 (장착 화면이 "몇 단계에 무엇이" 를 보여준다)', () => {
    expect(lockedActives(core, 0).map((a) => a.skill.id)).toEqual(['sundering-arc']);
    expect(lockedActives(core, 2)).toEqual([]);
  });
});

describe('validateAttunementTuning', () => {
  it('실제 설정이 유효하다', () => {
    expect(() => validateAttunementTuning(ATTUNEMENT)).not.toThrow();
  });

  it('첫 임계가 0 이 아니면 거부한다', () => {
    expect(() => validateAttunementTuning({ perUse: 5, thresholds: [10, 20] })).toThrow(/첫 값/);
  });

  it('오름차순이 아니면 거부한다', () => {
    expect(() => validateAttunementTuning({ perUse: 5, thresholds: [0, 30, 20] })).toThrow(
      /오름차순/,
    );
  });

  it('perUse 가 양수여야 한다', () => {
    expect(() => validateAttunementTuning({ perUse: 0, thresholds: [0, 10] })).toThrow(/perUse/);
  });
});
