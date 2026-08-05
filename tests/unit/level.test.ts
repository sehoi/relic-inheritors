import { describe, expect, it } from 'vitest';
import {
  LevelError,
  expAtLevel,
  expForEnemy,
  expToNext,
  levelOf,
  progressOf,
  validateLevelCurve,
  type LevelCurve,
} from '../../src/core/progress/level.js';
import { EXP_REWARD, LEVEL_CURVE } from '../../src/data/progression.js';
import { AREA_LEVELS } from '../../src/data/encounters.js';

const CURVE: LevelCurve = { maxLevel: 5, base: 10, growth: 2 };

describe('expToNext', () => {
  it('레벨이 오를수록 많이 필요하다', () => {
    expect(expToNext(1, CURVE)).toBe(10);
    expect(expToNext(2, CURVE)).toBe(40);
    expect(expToNext(3, CURVE)).toBe(90);
  });

  it('최고 레벨에서는 undefined 다', () => {
    expect(expToNext(5, CURVE)).toBeUndefined();
    expect(expToNext(99, CURVE)).toBeUndefined();
  });
});

describe('progressOf', () => {
  it('경험치에서 레벨과 진행도를 낸다', () => {
    expect(progressOf(0, CURVE)).toEqual({ level: 1, into: 0, need: 10 });
    expect(progressOf(9, CURVE)).toEqual({ level: 1, into: 9, need: 10 });
    expect(progressOf(10, CURVE)).toEqual({ level: 2, into: 0, need: 40 });
    expect(progressOf(35, CURVE)).toEqual({ level: 2, into: 25, need: 40 });
  });

  it('최고 레벨에서 멈춘다', () => {
    const top = progressOf(999_999, CURVE);
    expect(top.level).toBe(CURVE.maxLevel);
    expect(top.need).toBeUndefined();
  });

  it('음수를 거부한다', () => {
    expect(() => progressOf(-1, CURVE)).toThrow(LevelError);
  });

  it('expAtLevel 과 서로 맞는다', () => {
    // 둘이 어긋나면 "다음 레벨까지 얼마" 표시가 거짓말이 된다.
    for (let level = 1; level <= CURVE.maxLevel; level += 1) {
      expect(levelOf(expAtLevel(level, CURVE), CURVE), `Lv${level}`).toBe(level);
    }
  });

  it('한 점 모자라면 아직 오르지 않는다', () => {
    for (let level = 2; level <= CURVE.maxLevel; level += 1) {
      expect(levelOf(expAtLevel(level, CURVE) - 1, CURVE), `Lv${level}`).toBe(level - 1);
    }
  });
});

describe('validateLevelCurve', () => {
  it('실제 곡선이 유효하다', () => {
    expect(() => validateLevelCurve(LEVEL_CURVE)).not.toThrow();
  });

  it('growth 가 1 미만이면 거부한다 (뒤가 더 쉬워진다)', () => {
    expect(() => validateLevelCurve({ ...CURVE, growth: 0.9 })).toThrow(/growth/);
  });

  it('maxLevel 이 2 미만이면 거부한다', () => {
    expect(() => validateLevelCurve({ ...CURVE, maxLevel: 1 })).toThrow(/maxLevel/);
  });

  it('base 가 0 이하면 거부한다', () => {
    expect(() => validateLevelCurve({ ...CURVE, base: 0 })).toThrow(/base/);
  });
});

describe('실제 곡선 (초반이 빨라야 한다)', () => {
  const mobExp = expForEnemy(AREA_LEVELS['ruin-entrance'], EXP_REWARD);

  it('첫 레벨업이 첫 전투에서 온다', () => {
    // 처음 몇 판에서 레벨이 오르지 않으면 플레이어는 자기가 나아지는지 알 수 없다.
    // 유적 입구 표준 조우는 잡몹 2마리다.
    expect(mobExp * 2).toBeGreaterThanOrEqual(expToNext(1, LEVEL_CURVE) ?? 0);
  });

  it('초반 다섯 레벨이 잡몹 서른 마리 안에 온다', () => {
    expect(expAtLevel(5, LEVEL_CURVE) / mobExp).toBeLessThanOrEqual(30);
  });

  it('뒤로 갈수록 확실히 느려진다', () => {
    // 앞만 빠른 것이지 전체가 빨라지면 성장이 의미를 잃는다.
    const early = expToNext(2, LEVEL_CURVE) ?? 0;
    const late = expToNext(20, LEVEL_CURVE) ?? 0;
    expect(late).toBeGreaterThan(early * 20);
  });

  it('최고 레벨이 GDD 의 40 이다', () => {
    expect(LEVEL_CURVE.maxLevel).toBe(40);
  });
});

describe('expForEnemy', () => {
  it('적 레벨이 높을수록 많이 준다', () => {
    expect(expForEnemy(5, EXP_REWARD)).toBeGreaterThan(expForEnemy(2, EXP_REWARD));
  });

  it('최소 1은 준다 (0이면 이겨도 아무 일이 없다)', () => {
    expect(expForEnemy(1, { base: 0, perLevel: 0 })).toBe(1);
  });
});
