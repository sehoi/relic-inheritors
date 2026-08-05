import { describe, expect, it } from 'vitest';
import {
  adoptionRates,
  choiceBuildSize,
  enumerateBuilds,
  exactBuilds,
  exclusionPenalty,
  groupBySize,
  rankSpread,
  shareInBand,
  thinBuilds,
  topBuilds,
  type RelicBuild,
} from '../../src/core/relic/builds.js';

const ids = (builds: readonly RelicBuild[]): string[] => builds.map((b) => b.id);

describe('enumerateBuilds', () => {
  it('크기 1~maxSize 인 모든 부분집합을 만든다', () => {
    expect(ids(enumerateBuilds(['a', 'b', 'c'], 2)).sort()).toEqual([
      'a',
      'a+b',
      'a+c',
      'b',
      'b+c',
      'c',
    ]);
  });

  it('빈 조합은 만들지 않는다 (유물 없는 파티는 조합이 아니라 대조군이다)', () => {
    expect(ids(enumerateBuilds(['a'], 3))).toEqual(['a']);
  });

  it('유물 순서가 달라도 같은 조합이 된다', () => {
    // 정렬하지 않으면 같은 조합이 두 번 세어져 채택률이 거짓말을 한다.
    expect(ids(enumerateBuilds(['c', 'a'], 2))).toEqual(ids(enumerateBuilds(['a', 'c'], 2)));
  });

  it('중복된 id 를 하나로 본다', () => {
    expect(ids(enumerateBuilds(['a', 'a', 'b'], 2)).sort()).toEqual(['a', 'a+b', 'b']);
  });

  it('maxSize 가 유물 수보다 커도 터지지 않는다', () => {
    expect(enumerateBuilds(['a', 'b'], 10)).toHaveLength(3);
  });

  it('maxSize 0 을 거부한다', () => {
    expect(() => enumerateBuilds(['a'], 0)).toThrow(RangeError);
  });

  it('유물이 없으면 조합도 없다', () => {
    expect(enumerateBuilds([], 3)).toEqual([]);
  });
});

describe('exactBuilds', () => {
  it('크기가 정확히 맞는 조합만 낸다', () => {
    expect(ids(exactBuilds(['a', 'b', 'c'], 2)).sort()).toEqual(['a+b', 'a+c', 'b+c']);
  });

  it('유물보다 큰 크기를 요구하면 비어 있다', () => {
    expect(exactBuilds(['a', 'b'], 3)).toEqual([]);
  });

  it('크기 0 을 거부한다', () => {
    expect(() => exactBuilds(['a'], 0)).toThrow(RangeError);
  });
});

describe('choiceBuildSize', () => {
  it('슬롯을 채우되 가진 것을 다 끼지는 못하게 한다', () => {
    // 전부 낄 수 있으면 조합이 하나뿐이라 고를 것이 없다.
    expect(choiceBuildSize(7, 4)).toBe(4);
    expect(choiceBuildSize(3, 4)).toBe(2);
    expect(choiceBuildSize(5, 4)).toBe(4);
  });

  it('가진 것이 슬롯보다 적으면 하나는 남긴다', () => {
    expect(choiceBuildSize(2, 8)).toBe(1);
  });

  it('유물이 하나뿐이면 던진다 (고를 것이 없다)', () => {
    expect(() => choiceBuildSize(1, 4)).toThrow(RangeError);
  });

  it('슬롯이 0 이면 던진다', () => {
    expect(() => choiceBuildSize(5, 0)).toThrow(RangeError);
  });
});

describe('thinBuilds', () => {
  const many = enumerateBuilds(['a', 'b', 'c', 'd', 'e'], 5);

  it('한도 아래면 그대로 둔다', () => {
    expect(thinBuilds(many, 999)).toBe(many);
  });

  it('한도까지 줄인다', () => {
    expect(thinBuilds(many, 8)).toHaveLength(8);
  });

  it('크기 분포를 유지한다 (앞에서 자르면 작은 조합만 남는다)', () => {
    const thinned = thinBuilds(many, 6);
    const sizes = new Set(thinned.map((b) => b.relics.length));
    expect(sizes.size).toBeGreaterThan(1);
  });

  it('같은 입력에 같은 표본을 낸다 (ADR-002)', () => {
    expect(thinBuilds(many, 7)).toEqual(thinBuilds(many, 7));
  });

  it('한도 0 을 거부한다', () => {
    expect(() => thinBuilds(many, 0)).toThrow(RangeError);
  });
});

describe('groupBySize', () => {
  it('크기별로 묶고 오름차순으로 낸다', () => {
    const entries = enumerateBuilds(['a', 'b'], 2).map((build) => ({ build }));
    expect([...groupBySize(entries).keys()]).toEqual([1, 2]);
    expect(groupBySize(entries).get(1)).toHaveLength(2);
  });

  it('비어 있으면 빈 묶음이다', () => {
    expect(groupBySize([]).size).toBe(0);
  });
});

describe('rankSpread', () => {
  it('1위와 N위의 차이를 잰다', () => {
    expect(rankSpread([0.9, 0.8, 0.7, 0.6, 0.5], 5)).toBeCloseTo(0.4);
  });

  it('순서를 가리지 않는다', () => {
    expect(rankSpread([0.5, 0.9, 0.7], 3)).toBeCloseTo(0.4);
  });

  it('조합이 N개보다 적으면 꼴찌와 비교한다', () => {
    // 0 으로 보이면 "지배 전략이 없다" 는 거짓말이 된다.
    expect(rankSpread([0.9, 0.5], 5)).toBeCloseTo(0.4);
  });

  it('하나뿐이면 0 이다', () => {
    expect(rankSpread([0.9], 5)).toBe(0);
  });

  it('비어 있으면 던진다', () => {
    expect(() => rankSpread([], 5)).toThrow(RangeError);
  });
});

describe('shareInBand', () => {
  it('구간에 드는 비율을 낸다', () => {
    expect(shareInBand([0.5, 0.6, 0.7, 0.9], 0.55, 0.85)).toBeCloseTo(0.5);
  });

  it('경계를 포함한다', () => {
    expect(shareInBand([0.55, 0.85], 0.55, 0.85)).toBe(1);
  });

  it('비어 있으면 0 이다', () => {
    expect(shareInBand([], 0.55, 0.85)).toBe(0);
  });
});

describe('topBuilds / adoptionRates', () => {
  const scored = [
    { build: { id: 'a+b', relics: ['a', 'b'] }, winRate: 0.9 },
    { build: { id: 'b', relics: ['b'] }, winRate: 0.8 },
    { build: { id: 'a', relics: ['a'] }, winRate: 0.4 },
    { build: { id: 'c', relics: ['c'] }, winRate: 0.1 },
  ];

  it('승률 상위 비율만 남긴다', () => {
    expect(topBuilds(scored, 0.5).map((b) => b.id)).toEqual(['a+b', 'b']);
  });

  it('최소 하나는 남긴다', () => {
    expect(topBuilds(scored, 0.01)).toHaveLength(1);
  });

  it('동점은 id 순으로 끊는다 (결과가 흔들리면 테스트가 어제와 다른 말을 한다)', () => {
    const tied = [
      { build: { id: 'z', relics: ['z'] }, winRate: 0.5 },
      { build: { id: 'a', relics: ['a'] }, winRate: 0.5 },
    ];
    expect(topBuilds(tied, 0.5).map((b) => b.id)).toEqual(['a']);
  });

  it('좋은 조합 안에서의 채택률을 낸다', () => {
    const rates = adoptionRates(topBuilds(scored, 0.5), ['a', 'b', 'c']);
    expect(rates.get('a')).toBeCloseTo(0.5);
    expect(rates.get('b')).toBe(1);
    expect(rates.get('c')).toBe(0); // 좋은 조합에 한 번도 못 낀 유물
  });

  it('좋은 조합이 없으면 전부 0 이다', () => {
    expect(adoptionRates([], ['a']).get('a')).toBe(0);
  });

  it('범위 밖 비율을 거부한다', () => {
    expect(() => topBuilds(scored, 0)).toThrow(RangeError);
    expect(() => topBuilds(scored, 1.5)).toThrow(RangeError);
  });
});

describe('exclusionPenalty', () => {
  const scored = [
    { build: { id: 'a+b', relics: ['a', 'b'] }, winRate: 0.9 },
    { build: { id: 'a+c', relics: ['a', 'c'] }, winRate: 0.85 },
    { build: { id: 'b+c', relics: ['b', 'c'] }, winRate: 0.4 },
  ];

  it('그 유물을 뺀 최고 조합과의 차이를 낸다', () => {
    // a 를 빼면 최고가 0.4 로 떨어진다 — a 는 사실상 필수다.
    expect(exclusionPenalty(scored, 'a')).toBeCloseTo(0.5);
  });

  it('빼도 손해가 없으면 0 이다', () => {
    // b 를 빼도 a+c 가 0.85 로 남는다.
    expect(exclusionPenalty(scored, 'b')).toBeCloseTo(0.05);
  });

  it('그 유물이 안 들어간 조합이 없으면 잴 수 없다', () => {
    // 잴 수 없는 것과 통과한 것은 다른 상태다 — 0 을 돌려주면 거짓말이 된다.
    const always = [{ build: { id: 'a+b', relics: ['a', 'b'] }, winRate: 0.9 }];
    expect(exclusionPenalty(always, 'a')).toBeUndefined();
  });

  it('없는 유물을 물으면 손해가 0 이다', () => {
    expect(exclusionPenalty(scored, 'nope')).toBe(0);
  });

  it('조합이 비어 있으면 던진다', () => {
    expect(() => exclusionPenalty([], 'a')).toThrow(RangeError);
  });
});
