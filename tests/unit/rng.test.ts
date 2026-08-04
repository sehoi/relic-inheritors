import { describe, expect, it } from 'vitest';
import { createRng, restoreRng } from '../../src/core/rng/index.js';

const take = (n: number, fn: () => number): number[] => Array.from({ length: n }, fn);

describe('createRng', () => {
  it('같은 시드는 같은 수열을 낳는다 (ADR-002의 핵심 보장)', () => {
    const a = createRng(4821);
    const b = createRng(4821);
    expect(take(50, a.next)).toEqual(take(50, b.next));
  });

  it('다른 시드는 다른 수열을 낳는다', () => {
    const a = take(20, createRng(1).next);
    const b = take(20, createRng(2).next);
    expect(a).not.toEqual(b);
  });

  it('next()는 [0, 1) 범위를 벗어나지 않는다', () => {
    const rng = createRng(7);
    for (const value of take(2000, rng.next)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('int', () => {
  it('양 끝을 포함한 범위 안에 든다', () => {
    const rng = createRng(99);
    for (let i = 0; i < 2000; i += 1) {
      const value = rng.int(-3, 5);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(5);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('충분히 돌리면 양 끝 값이 모두 나온다', () => {
    const rng = createRng(1234);
    const seen = new Set(take(500, () => rng.int(1, 6)));
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('min === max 이면 그 값만 나온다', () => {
    const rng = createRng(5);
    expect(take(10, () => rng.int(3, 3))).toEqual(Array<number>(10).fill(3));
  });

  it('경계가 뒤집혔거나 정수가 아니면 던진다', () => {
    const rng = createRng(5);
    expect(() => rng.int(5, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 3)).toThrow(RangeError);
  });
});

describe('pick', () => {
  it('배열 안의 원소만 반환한다', () => {
    const rng = createRng(31);
    const items = ['불꽃', '서리', '뇌전'] as const;
    for (let i = 0; i < 300; i += 1) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it('빈 배열이면 던진다', () => {
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });
});

describe('chance', () => {
  it('확률 0과 1은 확정적이며 난수를 소비하지 않는다', () => {
    const rng = createRng(77);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    // 난수를 소비했다면 아래 수열이 기준과 어긋난다.
    expect(take(5, rng.next)).toEqual(take(5, createRng(77).next));
  });

  it('대략 기대한 빈도로 true를 낸다', () => {
    const rng = createRng(2024);
    const trials = 20_000;
    let hits = 0;
    for (let i = 0; i < trials; i += 1) {
      if (rng.chance(0.25)) hits += 1;
    }
    expect(hits / trials).toBeCloseTo(0.25, 1);
  });
});

describe('restoreRng', () => {
  it('저장한 상태에서 이어서 같은 수열을 낸다', () => {
    const original = createRng(555);
    take(13, original.next); // 임의 지점까지 진행

    const resumed = restoreRng(original.getState());
    expect(take(20, resumed.next)).toEqual(take(20, original.next));
  });
});
