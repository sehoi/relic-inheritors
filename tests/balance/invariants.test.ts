import { describe, expect, it } from 'vitest';
import { seedRange, simulateMany, type SimSetup } from '../../src/core/battle/simulate.js';
import type { Relic } from '../../src/core/relic/index.js';
import { BATTLE_TUNING } from '../../src/data/battle.js';
import { relic } from '../../src/data/relics.js';
import {
  BUILD_SKEWS,
  SAMPLE_LEVELS,
  bossFight,
  mobFight,
  relicFight,
} from '../../src/data/scenarios.js';

/**
 * 밸런스 불변식 (GDD §5.5, ADR-005).
 *
 * **자율 루프가 밸런스를 사람 없이 판정하는 수단이다.** 튜닝값을 만지거나 콘텐츠를 늘렸을 때
 * 여기가 빨개지면 무언가 무너진 것이다.
 *
 * 여기는 **편성 하나**를 여러 시드로 재는 불변식만 둔다. 조합끼리 비교하는
 * 불변식 1·2·4 는 `relicBuilds.test.ts` 에 있다 (T-027).
 *
 * 시드를 고정하므로 결과는 완전히 재현 가능하다.
 */

const SEEDS = seedRange(1, 100);
const run = (setup: SimSetup): ReturnType<typeof simulateMany> =>
  simulateMany(setup, SEEDS, BATTLE_TUNING);

describe('불변식 5 · 전투 길이', () => {
  // GDD 의 "턴"은 파티 전원이 한 번씩 행동하는 라운드를 뜻한다고 본다.
  // 개별 행동 수로 재면 파티 인원수에 비례해 의미가 흐려진다.
  it.each([...SAMPLE_LEVELS])('잡몹전 Lv%i 은 3~6 라운드다', (level) => {
    const summary = run(mobFight(level));
    expect(summary.avgRounds).toBeGreaterThanOrEqual(3);
    expect(summary.avgRounds).toBeLessThanOrEqual(6);
  });

  it.each([...SAMPLE_LEVELS])('보스전 Lv%i 은 12~25 라운드다', (level) => {
    const summary = run(bossFight(level));
    expect(summary.avgRounds).toBeGreaterThanOrEqual(12);
    expect(summary.avgRounds).toBeLessThanOrEqual(25);
  });

  it('끝나지 않는 전투가 없다', () => {
    for (const level of SAMPLE_LEVELS) {
      expect(run(mobFight(level)).timeouts, `잡몹 Lv${level}`).toBe(0);
      expect(run(bossFight(level)).timeouts, `보스 Lv${level}`).toBe(0);
    }
  });
});

describe('불변식 6 · 방어 스택 무적 부재', () => {
  it('방어 특화 파티도 보스전에서 피해를 입는다', () => {
    // 순수 감산형이었다면 방어를 쌓아 피해를 1로 고정할 수 있었다 (ADR-009).
    // 관통 하한이 그걸 막는지 시뮬레이션으로 확인한다.
    const summary = run(bossFight(20, BUILD_SKEWS.defense));
    expect(summary.avgPartyHpRatio).toBeLessThan(0.9);
  });

  it('방어를 극단으로 쌓아도 무적이 되지 않는다', () => {
    const fortress = run(bossFight(20, { def: 4, res: 4 }));
    expect(fortress.avgPartyHpRatio).toBeLessThan(1);
  });
});

describe('불변식 7 · 방어 편향 부재', () => {
  it('방어 특화의 기여가 공격 특화의 2배를 넘지 않는다', () => {
    // "총 기여" 의 대리 지표로 승률을 쓴다. 완벽하지 않지만
    // "일단 DEF 부터" 가 정답이 되는 상황은 이걸로 잡힌다.
    const offense = run(bossFight(20, BUILD_SKEWS.offense));
    const defense = run(bossFight(20, BUILD_SKEWS.defense));

    expect(defense.winRate).toBeLessThanOrEqual(offense.winRate * 2);
  });
});

describe('불변식 8 · 레벨 간 난이도 붕괴 부재 (ADR-010)', () => {
  it('보스전 승률이 레벨에 따라 무너지지 않는다', () => {
    // 처음 측정했을 때 99% → 44% → 39% 였다. 원인은 침식이 아니라
    // 보스의 MP 풀이 커질수록 고위력 스킬을 반복 시전할 수 있는 것이었다 (ADR-010).
    const rates = SAMPLE_LEVELS.map((level) => run(bossFight(level)).winRate);
    const spread = Math.max(...rates) - Math.min(...rates);

    expect(
      spread,
      `레벨별 승률: ${rates.map((r) => `${(r * 100).toFixed(0)}%`).join(' / ')}`,
    ).toBeLessThanOrEqual(0.45);
  });

  it('어떤 레벨에서도 보스전이 절망적이지 않다', () => {
    for (const level of SAMPLE_LEVELS) {
      expect(run(bossFight(level)).winRate, `Lv${level}`).toBeGreaterThan(0.3);
    }
  });
});

describe('불변식 3 · 침식 압박 (부분)', () => {
  it('긴 전투에서는 폭주가 실제로 발생한다', () => {
    // 완전한 형태(유적 1회 완주 시 정화 1회 이상 필요)는 연속 전투가 필요하다.
    // 지금은 "침식이 실제로 물리는가" 만 확인한다.
    const summary = run(bossFight(20));
    expect(summary.totalOverloads).toBeGreaterThan(0);
  });

  it('짧은 전투에서는 폭주가 드물다 (침식이 시간에 비례해 쌓인다)', () => {
    const short = run(mobFight(20));
    const long = run(bossFight(20));
    expect(short.totalOverloads).toBeLessThan(long.totalOverloads);
  });

  // 연속 전투는 `attrition.test.ts` 가 잰다 (T-044). 회복 수단이 레벨업뿐인 지금은
  // "정화가 몇 번 필요한가" 보다 "회복 없이 몇 판을 버티는가" 가 실제로 물어야 할 것이다.
});

describe('불변식 3 · 유물 침식 계수 (T-026)', () => {
  /**
   * **계수만 다른 두 유물.** 나머지가 전부 같아야 승률·전투 길이의 차이를 침식 탓으로 돌릴 수 있다.
   *
   * ADR-010 에서 원인을 잘못 읽은 뒤로, 이 프로젝트에서 밸런스 비교는 변수를 하나만 남기고 한다.
   * 실제 유물(`data/relics.ts`)을 쓰지 않는 이유도 그것이다 — 스탯 보정과 태그가 함께 달라진다.
   */
  const probe = (id: string, erosionFactor: number): Relic => ({
    ...relic('ember-coil'),
    id,
    erosionFactor,
  });

  const mild = probe('probe-mild', 0.5);
  const harsh = probe('probe-harsh', 2);

  it('계수가 큰 유물로 싸우면 폭주가 더 자주 일어난다', () => {
    const gentle = run(relicFight(20, [mild], { opponent: 'boss' }));
    const severe = run(relicFight(20, [harsh], { opponent: 'boss' }));

    expect(
      severe.totalOverloads,
      `완화 ${gentle.totalOverloads}회 vs 가혹 ${severe.totalOverloads}회`,
    ).toBeGreaterThan(gentle.totalOverloads);
  });

  it('계수가 큰 유물은 대가를 치른다 (승률이 더 높지 않다)', () => {
    // 침식이 그냥 숫자로만 오르고 결과에 영향이 없으면 리스크 축이 아니다.
    const gentle = run(relicFight(20, [mild], { opponent: 'boss' }));
    const severe = run(relicFight(20, [harsh], { opponent: 'boss' }));

    expect(
      severe.winRate,
      `완화 ${(gentle.winRate * 100).toFixed(0)}% vs 가혹 ${(severe.winRate * 100).toFixed(0)}%`,
    ).toBeLessThanOrEqual(gentle.winRate);
  });

  it('공명의 침식 완화가 폭주를 실제로 줄인다', () => {
    const bare = run(relicFight(20, [harsh], { opponent: 'boss' }));
    const relieved = run(relicFight(20, [harsh], { opponent: 'boss', erosionRelief: 0.6 }));

    expect(
      relieved.totalOverloads,
      `완화 없음 ${bare.totalOverloads}회 vs 완화 ${relieved.totalOverloads}회`,
    ).toBeLessThan(bare.totalOverloads);
  });

  it('계수가 달라도 전투가 멈추지 않는다', () => {
    for (const sample of [mild, harsh]) {
      expect(run(relicFight(20, [sample], { opponent: 'boss' })).timeouts, sample.id).toBe(0);
    }
  });
});

describe('결정론', () => {
  it('같은 시드 목록은 같은 통계를 낳는다', () => {
    const first = run(bossFight(20));
    const second = run(bossFight(20));
    expect(first).toEqual(second);
  });
});

// 불변식 1·2·4(조합 단위)는 `tests/balance/relicBuilds.test.ts` 로 옮겼다 (T-027).
// 조합 훑기는 여기 있는 단일 편성 측정과 성격이 달라 — 무엇을 재는 파일인지 흐려진다.
