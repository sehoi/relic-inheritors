import { describe, expect, it } from 'vitest';
import { seedRange } from '../../src/core/battle/simulate.js';
import { sweep } from '../../src/core/battle/sweep.js';
import {
  adoptionRates,
  choiceBuildSize,
  enumerateBuilds,
  exactBuilds,
  rankSpread,
  shareInBand,
  thinBuilds,
  topBuilds,
  type RelicBuild,
} from '../../src/core/relic/builds.js';
import { SLOTS_PER_MEMBER, type Relic } from '../../src/core/relic/index.js';
import { BATTLE_TUNING } from '../../src/data/battle.js';
import { BUILD_SWEEP, MEASURED_RELICS, RELIC_INVARIANTS } from '../../src/data/invariants.js';
import { RELICS, relic } from '../../src/data/relics.js';
import { relicFight } from '../../src/data/scenarios.js';

/**
 * 유물 조합 불변식 (GDD §5.5 불변식 1·2·4, T-027).
 *
 * T-019 에서 `it.todo` 로 남겨둔 셋이다. 유물이 없으면 "조합별 승률" 자체가 존재하지 않아
 * 측정할 수 없었다.
 *
 * **무엇을 재는가**: 슬롯을 채우되 가진 것을 다 끼지는 못하는 조합 —
 * 즉 **플레이어가 실제로 고르는 조합**뿐이다 (`choiceBuildSize`, ADR-013).
 *
 * **이 파일은 두 가지를 다르게 다룬다.**
 *
 * 1. **기구 검사** — 지배 전략과 사장된 유물을 일부러 심고, 불변식이 그걸 **잡아내는지** 본다.
 *    이게 없으면 초록이 "문제가 없다" 는 뜻인지 "아무것도 재지 않았다" 는 뜻인지 알 수 없다.
 * 2. **실제 데이터 검사** — `data/relics.ts` 를 훑는다.
 */

const SLOTS = SLOTS_PER_MEMBER * 2;
const seeds = seedRange(1, BUILD_SWEEP.trials);

interface Scored {
  readonly build: RelicBuild;
  readonly winRate: number;
}

function scoreBuilds(catalog: Readonly<Record<string, Relic>>): readonly Scored[] {
  const ids = Object.keys(catalog);
  const builds = thinBuilds(
    exactBuilds(ids, choiceBuildSize(ids.length, SLOTS)),
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

    expect(
      rankSpread(scored.map((row) => row.winRate), RELIC_INVARIANTS.dominanceRank),
      `기구가 지배 전략을 놓쳤습니다:\n  ${describeRates(scored)}`,
    ).toBeGreaterThan(RELIC_INVARIANTS.maxRankSpread);
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

  it('슬롯이 남는 조합을 섞으면 측정이 흐려진다 (그래서 슬롯을 채우는 조합만 잰다)', () => {
    // ADR-013 의 근거.
    //
    // 유물 3종 시절에는 이 왜곡이 **격차**로 나타났다 — 1위가 3개 조합, 5위가 1개 조합이라
    // 26.7%p 가 나왔고 그건 지배 전략이 아니라 슬롯이 남는다는 뜻이었다.
    // 유물 7종 · 적 Lv42 에서는 격차로는 더 이상 드러나지 않는다. 작은 조합이 전부 0% 라
    // 상위 5위가 어차피 전부 슬롯을 채운 조합이기 때문이다.
    //
    // 대신 **다양성**이 무너진다. 아무도 고르지 않을 조합이 절반 넘게 섞여 들어와
    // 밴드 비율을 끌어내린다. 왜곡의 모양은 바뀌었지만 왜곡은 그대로다.
    const ids = Object.keys(RELICS);
    const size = choiceBuildSize(ids.length, SLOTS);

    const band = (builds: readonly RelicBuild[]): number =>
      shareInBand(
        sweep(
          thinBuilds(builds, BUILD_SWEEP.maxBuilds),
          (build) =>
            relicFight(BUILD_SWEEP.partyLevel, build.relics.map(relic), {
              opponent: BUILD_SWEEP.opponent,
              enemyLevel: BUILD_SWEEP.enemyLevel,
            }),
          seedRange(1, 60),
          BATTLE_TUNING,
        ).map((entry) => entry.summary.winRate),
        RELIC_INVARIANTS.healthyBand.low,
        RELIC_INVARIANTS.healthyBand.high,
      );

    const mixed = band(enumerateBuilds(ids, size));
    const filled = band(exactBuilds(ids, size));

    expect(
      mixed,
      `섞어서 밴드 ${(mixed * 100).toFixed(0)}% / 슬롯을 채워서 ${(filled * 100).toFixed(0)}%`,
    ).toBeLessThan(filled);
  });
});

// ── 실제 데이터 ───────────────────────────────────────────────────────────

describe('유물 조합 (data/relics.ts)', () => {
  const scored = scoreBuilds(RELICS);

  it('잴 만큼의 조합이 있다', () => {
    // 조합이 순위 개수보다 적으면 아래 테스트들이 조용히 약해진다.
    expect(scored.length, `조합:\n  ${describeRates(scored)}`).toBeGreaterThanOrEqual(
      RELIC_INVARIANTS.dominanceRank,
    );
  });

  it('불변식 1 · 승률 1위와 5위의 차이가 25%p 이내다', () => {
    const spread = rankSpread(
      scored.map((row) => row.winRate),
      RELIC_INVARIANTS.dominanceRank,
    );

    expect(
      spread,
      `1-${RELIC_INVARIANTS.dominanceRank}위 격차 ${(spread * 100).toFixed(1)}%p — 지배 전략이 있습니다:\n  ${describeRates(scored)}`,
    ).toBeLessThanOrEqual(RELIC_INVARIANTS.maxRankSpread);
  });

  it('불변식 2 · 승률 55~85% 구간에 드는 조합이 40% 이상이다', () => {
    const share = shareInBand(
      scored.map((row) => row.winRate),
      RELIC_INVARIANTS.healthyBand.low,
      RELIC_INVARIANTS.healthyBand.high,
    );

    expect(
      share,
      `밴드 ${(share * 100).toFixed(0)}% — 조합 다양성이 부족합니다:\n  ${describeRates(scored)}`,
    ).toBeGreaterThanOrEqual(RELIC_INVARIANTS.minBandShare);
  });

  it('불변식 4 · 좋은 조합에 한 번도 끼지 못하는 유물이 없다', () => {
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
  it('유물 수가 달라지면 측정 지점을 다시 잡아야 한다', () => {
    // 유물이 늘면 승률 분포가 통째로 이동한다. 실제로 3종 → 7종에서 측정 지점을
    // Lv36 → Lv42 로 옮겨야 했다 — 옛 지점에서는 슬롯을 채운 조합이 전부 이겨
    // 아무것도 갈리지 않았다.
    //
    // 이 테스트는 유물을 늘리면 일부러 빨개진다. 그게 목적이다.
    const count = Object.keys(RELICS).length;

    expect(
      count,
      `유물이 ${count}종입니다 (측정 당시 ${MEASURED_RELICS}종).\n` +
        `docs/DECISIONS.md ADR-013 을 읽고, npm run sim 으로 BUILD_SWEEP 난이도가 ` +
        `여전히 승률을 가르는지 확인한 뒤 MEASURED_RELICS 를 갱신하세요.\n` +
        `가르는 지점은 한 레벨이 아니라 구간이어야 합니다 — 한 점만 통과하면 우연입니다.`,
    ).toBe(MEASURED_RELICS);
  });
});
