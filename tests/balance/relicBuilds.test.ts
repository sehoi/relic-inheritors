import { describe, expect, it } from 'vitest';
import { seedRange } from '../../src/core/battle/simulate.js';
import { sweep } from '../../src/core/battle/sweep.js';
import {
  adoptionRates,
  enumerateBuilds,
  groupBySize,
  rankSpread,
  shareInBand,
  thinBuilds,
  topBuilds,
  type RelicBuild,
} from '../../src/core/relic/builds.js';
import { SLOTS_PER_MEMBER, type Relic } from '../../src/core/relic/index.js';
import { BATTLE_TUNING } from '../../src/data/battle.js';
import { BUILD_SWEEP, RELIC_INVARIANTS } from '../../src/data/invariants.js';
import { RELICS, relic } from '../../src/data/relics.js';
import { relicFight } from '../../src/data/scenarios.js';

/**
 * 유물 조합 불변식 (GDD §5.5 불변식 1·2·4, T-027).
 *
 * T-019 에서 `it.todo` 로 남겨둔 셋이다. 유물이 없으면 "조합별 승률" 자체가 존재하지 않아
 * 측정할 수 없었다.
 *
 * **이 파일은 두 가지를 다르게 다룬다.**
 *
 * 1. **기구 검사** — 지배 전략과 사장된 유물을 일부러 심고, 불변식이 그걸 **잡아내는지** 본다.
 *    이게 없으면 초록이 "문제가 없다" 는 뜻인지 "아무것도 재지 않았다" 는 뜻인지 알 수 없다.
 * 2. **실제 데이터 검사** — `data/relics.ts` 를 훑는다.
 *
 * ⚠️ **지금 유물은 3종, 슬롯은 4개다.** 슬롯이 남아 조합에 기회비용이 없으므로 분해능이 낮다.
 * 유물이 슬롯보다 많아지는 T-028 에서 다시 재야 하고, 아래 마지막 테스트가 그걸 강제한다.
 */

const seeds = seedRange(1, BUILD_SWEEP.trials);

interface Scored {
  readonly build: RelicBuild;
  readonly winRate: number;
}

function scoreBuilds(catalog: Readonly<Record<string, Relic>>): readonly Scored[] {
  const ids = Object.keys(catalog);
  const builds = thinBuilds(
    enumerateBuilds(ids, Math.min(ids.length, SLOTS_PER_MEMBER * 2)),
    BUILD_SWEEP.maxBuilds,
  );

  return sweep(
    builds,
    (build) =>
      relicFight(
        BUILD_SWEEP.partyLevel,
        build.relics.map((id) => catalog[id] as Relic),
        { opponent: BUILD_SWEEP.opponent, enemyLevel: BUILD_SWEEP.enemyLevel },
      ),
    seeds,
    BATTLE_TUNING,
  ).map((entry) => ({ build: entry.item, winRate: entry.summary.winRate }));
}

/** 잴 수 있는 크기 묶음만. 조합이 하나뿐인 묶음은 통과해도 실패해도 뜻이 없다. */
function measurableClasses(scored: readonly Scored[]): readonly (readonly Scored[])[] {
  return [...groupBySize(scored).values()].filter(
    (group) => group.length >= RELIC_INVARIANTS.minClassSize,
  );
}

const describeRates = (rows: readonly Scored[]): string =>
  [...rows]
    .sort((a, b) => b.winRate - a.winRate)
    .map((row) => `${(row.winRate * 100).toFixed(1)}% ${row.build.id}`)
    .join('\n  ');

// ── 기구 검사 ─────────────────────────────────────────────────────────────

describe('기구 검사 · 불변식에 이빨이 있는가', () => {
  const base = relic('ember-coil');

  it('지배 전략을 심으면 불변식 1 이 잡아낸다', () => {
    const scored = scoreBuilds({
      weak: { ...base, id: 'weak', statMods: { mag: 1 } },
      mid: { ...base, id: 'mid', statMods: { mag: 4 } },
      king: { ...base, id: 'king', statMods: { mag: 40, atk: 40, def: 20, maxHp: 60 } },
    });

    const worst = Math.max(
      ...measurableClasses(scored).map((group) =>
        rankSpread(group.map((row) => row.winRate), RELIC_INVARIANTS.dominanceRank),
      ),
    );

    expect(worst, `기구가 지배 전략을 놓쳤습니다:\n  ${describeRates(scored)}`).toBeGreaterThan(
      RELIC_INVARIANTS.maxRankSpread,
    );
  });

  it('사장된 유물을 심으면 불변식 4 가 잡아낸다', () => {
    const rigged = {
      alpha: { ...base, id: 'alpha', statMods: { mag: 8 } },
      beta: { ...base, id: 'beta', statMods: { atk: 8 } },
      cursed: { ...base, id: 'cursed', statMods: { mag: -8, atk: -8, def: -8, maxHp: -60 } },
    };

    const scored = scoreBuilds(rigged);
    const good = topBuilds(scored, RELIC_INVARIANTS.goodBuildRatio);
    const adoption = adoptionRates(good, Object.keys(rigged));

    expect(
      adoption.get('cursed'),
      `좋은 조합: ${good.map((b) => b.id).join(' | ')}\n  ${describeRates(scored)}`,
    ).toBeLessThan(RELIC_INVARIANTS.minAdoption);
  });

  it('조합 크기를 섞으면 격차가 부풀려진다 (그래서 크기별로 잰다)', () => {
    // ADR-013 의 근거. 이 테스트가 초록이면 "크기별 비교" 가 실제로 다른 답을 낸다는 뜻이고,
    // 빨개지면 그 구분이 더 이상 필요 없다는 뜻이다 — 어느 쪽이든 알아야 한다.
    const scored = scoreBuilds(RELICS);
    const mixed = rankSpread(scored.map((r) => r.winRate), RELIC_INVARIANTS.dominanceRank);
    const worstClass = Math.max(
      ...measurableClasses(scored).map((group) =>
        rankSpread(group.map((row) => row.winRate), RELIC_INVARIANTS.dominanceRank),
      ),
    );

    expect(
      mixed,
      `섞어서 ${(mixed * 100).toFixed(1)}%p / 크기별 최악 ${(worstClass * 100).toFixed(1)}%p`,
    ).toBeGreaterThan(worstClass);
  });
});

// ── 실제 데이터 ───────────────────────────────────────────────────────────

describe('유물 조합 (data/relics.ts)', () => {
  const scored = scoreBuilds(RELICS);
  const classes = measurableClasses(scored);

  it('잴 수 있는 크기 묶음이 하나는 있다', () => {
    // 없으면 아래 두 테스트가 조용히 아무것도 재지 않고 통과한다.
    expect(classes.length, `조합: ${describeRates(scored)}`).toBeGreaterThan(0);
  });

  it('불변식 1 · 같은 크기 안에서 승률 1위와 5위의 차이가 25%p 이내다', () => {
    const failures = classes
      .map((group) => ({
        size: group[0]?.build.relics.length ?? 0,
        spread: rankSpread(group.map((row) => row.winRate), RELIC_INVARIANTS.dominanceRank),
        group,
      }))
      .filter((entry) => entry.spread > RELIC_INVARIANTS.maxRankSpread)
      .map(
        (entry) =>
          `크기 ${entry.size}: ${(entry.spread * 100).toFixed(1)}%p\n  ${describeRates(entry.group)}`,
      );

    expect(failures, `지배 전략이 있습니다:\n${failures.join('\n')}`).toEqual([]);
  });

  it('불변식 2 · 승률 55~85% 구간에 드는 조합이 40% 이상이다', () => {
    const failures = classes
      .map((group) => ({
        size: group[0]?.build.relics.length ?? 0,
        share: shareInBand(
          group.map((row) => row.winRate),
          RELIC_INVARIANTS.healthyBand.low,
          RELIC_INVARIANTS.healthyBand.high,
        ),
        group,
      }))
      .filter((entry) => entry.share < RELIC_INVARIANTS.minBandShare)
      .map(
        (entry) =>
          `크기 ${entry.size}: ${(entry.share * 100).toFixed(0)}%\n  ${describeRates(entry.group)}`,
      );

    expect(failures, `조합 다양성이 부족합니다:\n${failures.join('\n')}`).toEqual([]);
  });

  it('불변식 4 · 좋은 조합에 한 번도 끼지 못하는 유물이 없다', () => {
    // 여기만 크기를 섞어서 잰다 — 혼자서는 약해도 조합에서 빛나는 유물이 있다.
    const good = topBuilds(scored, RELIC_INVARIANTS.goodBuildRatio);
    const adoption = adoptionRates(good, Object.keys(RELICS));

    const dead = [...adoption]
      .filter(([, rate]) => rate < RELIC_INVARIANTS.minAdoption)
      .map(([id, rate]) => `${id} ${(rate * 100).toFixed(0)}%`);

    expect(
      dead,
      `사장된 유물: ${dead.join(', ')}\n좋은 조합: ${good.map((b) => b.id).join(' | ')}`,
    ).toEqual([]);
  });

  it('같은 입력에 같은 결과를 낸다 (ADR-002)', () => {
    expect(scoreBuilds(RELICS)).toEqual(scored);
  });
});

describe('측정의 한계', () => {
  it('유물이 슬롯 수를 넘으면 측정 지점을 다시 잡아야 한다', () => {
    // 지금은 유물 3종 < 슬롯 4개라 **조합에 기회비용이 없다** — 더 끼면 무조건 이득이다.
    // 유물이 슬롯보다 많아지는 순간 상황이 달라지고, 그때는 BUILD_SWEEP 의 난이도가
    // 여전히 승률을 가르는지 다시 재야 한다.
    //
    // 이 테스트는 T-028 에서 일부러 빨개진다. 그게 목적이다 — 조용히 지나가면
    // 낡은 측정 지점으로 새 데이터를 판정하게 된다.
    const relicCount = Object.keys(RELICS).length;
    const slots = SLOTS_PER_MEMBER * 2;

    expect(
      relicCount,
      `유물이 ${relicCount}종으로 늘었습니다 (슬롯 ${slots}개).\n` +
        `docs/DECISIONS.md ADR-013 을 읽고, npm run sim 으로 BUILD_SWEEP 난이도가 ` +
        `여전히 승률을 가르는지 확인한 뒤 이 테스트를 갱신하세요.`,
    ).toBeLessThanOrEqual(slots);
  });
});
