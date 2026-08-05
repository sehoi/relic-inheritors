import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng/index.js';
import {
  advanceCounter,
  pickWeighted,
  startCounter,
  type EncounterTuning,
} from '../../src/core/world/encounter.js';
import { AREA_LEVELS, ENCOUNTER_STEPS, ENCOUNTER_TABLES } from '../../src/data/encounters.js';
import { MAP_IDS } from '../../src/data/maps.js';

const TUNING: EncounterTuning = { minSteps: 8, maxSteps: 20 };

describe('startCounter', () => {
  it('임계를 범위 안에서 뽑는다', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i += 1) {
      const counter = startCounter(rng, TUNING);
      expect(counter.steps).toBe(0);
      expect(counter.threshold).toBeGreaterThanOrEqual(TUNING.minSteps);
      expect(counter.threshold).toBeLessThanOrEqual(TUNING.maxSteps);
    }
  });

  it('같은 시드는 같은 임계를 낳는다', () => {
    expect(startCounter(createRng(7), TUNING)).toEqual(startCounter(createRng(7), TUNING));
  });

  it('범위가 잘못되면 던진다', () => {
    expect(() => startCounter(createRng(1), { minSteps: 0, maxSteps: 5 })).toThrow(RangeError);
    expect(() => startCounter(createRng(1), { minSteps: 9, maxSteps: 3 })).toThrow(RangeError);
  });
});

describe('advanceCounter', () => {
  it('임계 전에는 발생하지 않는다', () => {
    let counter = { steps: 0, threshold: 3 };
    for (const expected of [false, false]) {
      const outcome = advanceCounter(counter);
      expect(outcome.triggered).toBe(expected);
      counter = outcome.counter;
    }
  });

  it('임계에 닿으면 발생한다', () => {
    const outcome = advanceCounter({ steps: 2, threshold: 3 });
    expect(outcome.triggered).toBe(true);
    expect(outcome.counter.steps).toBe(3);
  });

  it('최소 걸음 수 전에는 절대 발생하지 않는다', () => {
    // 확률 방식이었다면 두 걸음 만에 두 번 싸울 수도 있다.
    const rng = createRng(3);
    for (let trial = 0; trial < 100; trial += 1) {
      let counter = startCounter(rng, TUNING);
      for (let step = 1; step < TUNING.minSteps; step += 1) {
        const outcome = advanceCounter(counter);
        expect(outcome.triggered, `${trial}회차 ${step}걸음`).toBe(false);
        counter = outcome.counter;
      }
    }
  });

  it('최대 걸음 수 안에는 반드시 발생한다', () => {
    const rng = createRng(5);
    for (let trial = 0; trial < 100; trial += 1) {
      let counter = startCounter(rng, TUNING);
      let fired = false;
      for (let step = 0; step < TUNING.maxSteps; step += 1) {
        const outcome = advanceCounter(counter);
        counter = outcome.counter;
        if (outcome.triggered) {
          fired = true;
          break;
        }
      }
      expect(fired, `${trial}회차`).toBe(true);
    }
  });

  it('원본을 변경하지 않는다', () => {
    const counter = { steps: 0, threshold: 3 };
    advanceCounter(counter);
    expect(counter.steps).toBe(0);
  });
});

describe('pickWeighted', () => {
  it('가중치가 큰 쪽이 더 자주 나온다', () => {
    const rng = createRng(11);
    const entries = [
      { weight: 9, value: 'often' },
      { weight: 1, value: 'rare' },
    ];

    let rare = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i += 1) {
      if (pickWeighted(entries, rng) === 'rare') rare += 1;
    }
    expect(rare / trials).toBeCloseTo(0.1, 1);
  });

  it('가중치 0 은 뽑히지 않는다', () => {
    const rng = createRng(2);
    const entries = [
      { weight: 0, value: 'never' },
      { weight: 1, value: 'always' },
    ];
    for (let i = 0; i < 50; i += 1) expect(pickWeighted(entries, rng)).toBe('always');
  });

  it('고를 것이 없으면 던진다', () => {
    expect(() => pickWeighted([{ weight: 0, value: 'x' }], createRng(1))).toThrow(RangeError);
  });
});

describe('인카운터 테이블 (콘텐츠)', () => {
  it('모든 맵에 테이블과 지역 레벨이 있다', () => {
    for (const mapId of MAP_IDS) {
      expect(ENCOUNTER_TABLES[mapId]?.length, mapId).toBeGreaterThan(0);
      expect(AREA_LEVELS[mapId], mapId).toBeGreaterThan(0);
    }
  });

  it('적 수와 가중치가 양수다', () => {
    for (const mapId of MAP_IDS) {
      for (const entry of ENCOUNTER_TABLES[mapId] ?? []) {
        expect(entry.weight, mapId).toBeGreaterThan(0);
        expect(entry.mobCount, mapId).toBeGreaterThan(0);
      }
    }
  });

  it('깊은 층이 더 위험하다 (층 자체가 난이도 축이다)', () => {
    const entranceAvg = averageMobs('ruin-entrance');
    const depthsAvg = averageMobs('ruin-depths');
    expect(depthsAvg).toBeGreaterThan(entranceAvg);
    expect(AREA_LEVELS['ruin-depths']).toBeGreaterThan(AREA_LEVELS['ruin-entrance']);
  });

  it('걸음 수 범위가 유효하다', () => {
    expect(ENCOUNTER_STEPS.minSteps).toBeGreaterThan(0);
    expect(ENCOUNTER_STEPS.maxSteps).toBeGreaterThan(ENCOUNTER_STEPS.minSteps);
  });
});

function averageMobs(mapId: 'ruin-entrance' | 'ruin-depths'): number {
  const table = ENCOUNTER_TABLES[mapId];
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  return table.reduce((sum, entry) => sum + entry.weight * entry.mobCount, 0) / total;
}
