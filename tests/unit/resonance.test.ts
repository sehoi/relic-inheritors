import { describe, expect, it } from 'vitest';
import type { Relic } from '../../src/core/relic/index.js';
import {
  activeResonances,
  countTags,
  isResonanceActive,
  missingForResonance,
  resonanceErosionRelief,
  resonanceStatMods,
  validateResonance,
  type Resonance,
} from '../../src/core/relic/resonance.js';
import { relic } from '../../src/data/relics.js';
import { ALL_RESONANCES, RESONANCES, resonance, resonanceRegistry } from '../../src/data/resonances.js';

const ember = relic('ember-coil'); // ember
const stone = relic('stone-seal'); // stone, ward
const core = relic('sundering-core'); // storm, hollow

describe('countTags', () => {
  it('태그를 센다', () => {
    const counts = countTags([ember, stone]);
    expect(counts.get('ember')).toBe(1);
    expect(counts.get('stone')).toBe(1);
    expect(counts.get('ward')).toBe(1);
    expect(counts.get('storm')).toBeUndefined();
  });

  it('한 유물의 여러 태그를 각각 센다', () => {
    const counts = countTags([core]);
    expect(counts.get('storm')).toBe(1);
    expect(counts.get('hollow')).toBe(1);
  });

  it('같은 태그가 여러 유물에 있으면 누적된다', () => {
    expect(countTags([ember, ember]).get('ember')).toBe(2);
  });
});

describe('isResonanceActive', () => {
  it('모든 조건을 만족해야 발동한다', () => {
    const banked = resonance('banked-fire'); // ember 1 + stone 1
    expect(isResonanceActive(banked, [ember, stone])).toBe(true);
    expect(isResonanceActive(banked, [ember])).toBe(false);
    expect(isResonanceActive(banked, [stone])).toBe(false);
  });

  it('한 유물이 혼자 조건을 만족시킬 수 있다', () => {
    // `가르는 핵` 은 storm·hollow 를 동시에 가진다. 버그가 아니라 그 유물의 값어치다.
    expect(isResonanceActive(resonance('collapsing-echo'), [core])).toBe(true);
  });

  it('개수 조건을 본다', () => {
    const twin = resonance('twin-ember'); // ember 2
    expect(isResonanceActive(twin, [ember])).toBe(false);
    expect(isResonanceActive(twin, [ember, ember])).toBe(true);
  });

  it('필요 이상이어도 발동한다', () => {
    expect(isResonanceActive(resonance('banked-fire'), [ember, stone, core])).toBe(true);
  });
});

describe('activeResonances', () => {
  it('발동 중인 것만 고른다', () => {
    const active = activeResonances(ALL_RESONANCES, [ember, stone]);
    expect(active.map((r) => r.id)).toEqual(['banked-fire']);
  });

  it('아무것도 안 끼우면 빈 목록이다', () => {
    expect(activeResonances(ALL_RESONANCES, [])).toEqual([]);
  });

  it('유물이 늘어나면 발동 공명도 줄지 않는다', () => {
    // "유물 하나가 조합 공간을 곱으로 늘린다" 는 설계의 구조적 성질 (GDD §5.2).
    // 유물을 더해서 공명이 사라지면 조합을 늘릴 이유가 없어진다.
    const steps: Relic[][] = [[], [ember], [ember, stone], [ember, stone, core]];
    const counts = steps.map((relics) => activeResonances(ALL_RESONANCES, relics).length);

    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i], `${i}단계`).toBeGreaterThanOrEqual(counts[i - 1] as number);
    }
    expect(counts.at(-1)).toBeGreaterThan(counts[0] as number);
  });
});

describe('resonanceStatMods', () => {
  it('발동한 공명의 보정을 합산한다', () => {
    const mods = resonanceStatMods([resonance('banked-fire'), resonance('collapsing-echo')]);
    expect(mods.atk).toBe(3);
    expect(mods.mag).toBe(6);
    expect(mods.res).toBe(-2);
  });

  it('발동한 것이 없으면 빈 보정이다', () => {
    expect(resonanceStatMods([])).toEqual({});
  });
});

describe('missingForResonance', () => {
  it('무엇이 몇 개 더 필요한지 알려준다', () => {
    expect(missingForResonance(resonance('banked-fire'), [ember])).toEqual([
      { tag: 'stone', count: 1 },
    ]);
  });

  it('발동 중이면 빈 목록이다', () => {
    expect(missingForResonance(resonance('banked-fire'), [ember, stone])).toEqual([]);
  });

  it('여러 조건이 모자라면 모두 알려준다', () => {
    expect(missingForResonance(resonance('collapsing-echo'), [])).toHaveLength(2);
  });
});

describe('resonanceErosionRelief (T-026)', () => {
  const relief = (value: number): Resonance => ({
    ...resonance('banked-fire'),
    erosionRelief: value,
  });

  it('완화가 없으면 1 이다', () => {
    expect(resonanceErosionRelief([])).toBe(1);
    expect(resonanceErosionRelief([resonance('twin-ember')])).toBe(1);
  });

  it('여럿이면 곱한다', () => {
    // 더하면 완화 몇 개로 침식을 음수까지 밀어낼 수 있다.
    expect(resonanceErosionRelief([relief(0.5), relief(0.5)])).toBe(0.25);
  });

  it('아무리 쌓아도 양수로 남는다', () => {
    const many = Array.from({ length: 20 }, () => relief(0.5));
    expect(resonanceErosionRelief(many)).toBeGreaterThan(0);
  });
});

describe('validateResonance', () => {
  const valid = resonance('banked-fire');

  it('정상 공명을 통과시킨다', () => {
    expect(() => validateResonance(valid)).not.toThrow();
  });

  it('조건 없는 공명을 거부한다 (그건 그냥 전역 보정이다)', () => {
    expect(() => validateResonance({ ...valid, conditions: [] })).toThrow(/조건 없는/);
  });

  it('효과가 하나도 없는 공명을 거부한다', () => {
    const { erosionRelief: _drop, ...noRelief } = valid;
    expect(() => validateResonance({ ...noRelief, statMods: {} })).toThrow(/아무 효과도/);
  });

  it('침식 완화만 있어도 통과한다 (스탯 보정이 유일한 효과 종류가 아니다)', () => {
    expect(() =>
      validateResonance({ ...valid, statMods: {}, erosionRelief: 0.9 }),
    ).not.toThrow();
  });

  it('침식 완화 범위를 검사한다', () => {
    // 1을 넘으면 완화가 아니라 가중이다 — 이름이 거짓말이 된다.
    expect(() => validateResonance({ ...valid, erosionRelief: 1.2 })).toThrow(/erosionRelief/);
    expect(() => validateResonance({ ...valid, erosionRelief: 0 })).toThrow(/erosionRelief/);
  });

  it('같은 태그를 두 번 요구할 수 없다', () => {
    const duped: Resonance = {
      ...valid,
      conditions: [
        { tag: 'ember', count: 1 },
        { tag: 'ember', count: 2 },
      ],
    };
    expect(() => validateResonance(duped)).toThrow(/중복/);
  });

  it('개수는 1 이상의 정수여야 한다', () => {
    expect(() =>
      validateResonance({ ...valid, conditions: [{ tag: 'ember', count: 0 }] }),
    ).toThrow(/count/);
  });
});

describe('공명 데이터', () => {
  it('레지스트리로 조회된다', () => {
    expect(resonance('banked-fire').name).toBe('묻어둔 불');
    expect(() => resonance('nope')).toThrow(/banked-fire/);
    expect(resonanceRegistry.ids().sort()).toEqual(Object.keys(RESONANCES).sort());
  });

  it('모든 공명이 스키마를 통과한다', () => {
    for (const entry of ALL_RESONANCES) {
      expect(() => validateResonance(entry), entry.id).not.toThrow();
    }
  });

  it('시작 유물만으로 발동하는 공명이 최소 하나 있다', () => {
    // 하나도 발동하지 않으면 플레이어가 공명이라는 개념을 만나지 못한다.
    const starting = [relic('ember-coil'), relic('stone-seal')];
    expect(activeResonances(ALL_RESONANCES, starting).length).toBeGreaterThan(0);
  });
});
