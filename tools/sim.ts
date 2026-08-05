/**
 * 밸런스 시뮬레이터 CLI.
 *
 * ```
 * npm run sim
 * ```
 *
 * 판정하지 않고 **숫자만 보여준다.** 합격·불합격은 `tests/balance/` 가 정한다.
 * 튜닝값을 만질 때 이걸 돌려 결과를 눈으로 확인하고, 테스트로 못을 박는 순서로 쓴다.
 */

import { seedRange, simulateMany, type SimSummary } from '../src/core/battle/simulate.js';
import { sweep } from '../src/core/battle/sweep.js';
import {
  adoptionRates,
  choiceBuildSize,
  exactBuilds,
  exclusionPenalty,
  rankSpread,
  shareInBand,
  thinBuilds,
  topBuilds,
} from '../src/core/relic/builds.js';
import { TOTAL_SLOTS } from '../src/data/party.js';
import { BATTLE_TUNING } from '../src/data/battle.js';
import { BUILD_SWEEP, RELIC_INVARIANTS } from '../src/data/invariants.js';
import { RELICS, relic } from '../src/data/relics.js';
import {
  BUILD_SKEWS,
  SAMPLE_LEVELS,
  bossFight,
  mobFight,
  relicFight,
} from '../src/data/scenarios.js';

const TRIALS = 300;
const seeds = seedRange(1, TRIALS);

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const pad = (value: string | number, width: number): string => String(value).padStart(width);

function row(label: string, summary: SimSummary): string {
  return [
    pad(label, 16),
    pad(pct(summary.winRate), 7),
    pad(summary.avgTurns.toFixed(1), 7),
    pad(summary.avgRounds.toFixed(1), 7),
    pad(pct(summary.avgPartyHpRatio), 8),
    pad(summary.totalOverloads, 7),
    pad(summary.timeouts, 7),
  ].join(' ');
}

const header = [
  pad('시나리오', 16),
  pad('승률', 7),
  pad('턴', 7),
  pad('라운드', 7),
  pad('남은HP', 8),
  pad('폭주', 7),
  pad('타임아웃', 7),
].join(' ');

console.log(`전투 시뮬레이션 — 시드 ${TRIALS}개, 균형 편성\n`);
console.log(header);
console.log('-'.repeat(header.length));

for (const level of SAMPLE_LEVELS) {
  console.log(row(`잡몹 Lv${level}`, simulateMany(mobFight(level), seeds, BATTLE_TUNING)));
  console.log(row(`보스 Lv${level}`, simulateMany(bossFight(level), seeds, BATTLE_TUNING)));
}

console.log('\n\n빌드 편향 — 잡몹 Lv20 기준\n');
console.log(header);
console.log('-'.repeat(header.length));

for (const [name, skew] of Object.entries(BUILD_SKEWS)) {
  console.log(row(name, simulateMany(mobFight(20, skew), seeds, BATTLE_TUNING)));
}

console.log('\n\n보스전 빌드 편향 — Lv20\n');
console.log(header);
console.log('-'.repeat(header.length));

for (const [name, skew] of Object.entries(BUILD_SKEWS)) {
  console.log(row(name, simulateMany(bossFight(20, skew), seeds, BATTLE_TUNING)));
}

console.log('\n\n유물별 — 보스 Lv20 (침식 계수가 폭주 횟수로 드러난다)\n');
console.log(header);
console.log('-'.repeat(header.length));

for (const entry of Object.values(RELICS)) {
  console.log(
    row(
      `${entry.name} ×${entry.erosionFactor}`,
      simulateMany(relicFight(20, [relic(entry.id)], { opponent: 'boss' }), seeds, BATTLE_TUNING),
    ),
  );
}

console.log(
  `\n\n유물 조합 훑기 — 파티 Lv${BUILD_SWEEP.partyLevel} vs 잡몹 Lv${BUILD_SWEEP.enemyLevel}\n`,
);

const relicIds = Object.keys(RELICS);
const buildSize = choiceBuildSize(relicIds.length, TOTAL_SLOTS);
const allBuilds = exactBuilds(relicIds, buildSize);
const builds = thinBuilds(allBuilds, BUILD_SWEEP.maxBuilds);

console.log(
  `유물 ${relicIds.length}종 · 슬롯을 채우는 조합 크기 ${buildSize} · ` +
    (builds.length < allBuilds.length
      ? `${allBuilds.length}개 중 ${builds.length}개를 고르게 솎아 잰다`
      : `${builds.length}개 전부`),
);

const scored = sweep(
  builds,
  (build) =>
    relicFight(BUILD_SWEEP.partyLevel, build.relics.map(relic), {
      opponent: BUILD_SWEEP.opponent,
      enemyLevel: BUILD_SWEEP.enemyLevel,
    }),
  seeds,
  BATTLE_TUNING,
).map((entry) => ({ build: entry.item, winRate: entry.summary.winRate }));

const rates = scored.map((row) => row.winRate);
console.log(
  `격차 ${pct(rankSpread(rates, RELIC_INVARIANTS.dominanceRank))} (상한 ${pct(RELIC_INVARIANTS.maxRankSpread)})  ` +
    `밴드 ${pct(shareInBand(rates, RELIC_INVARIANTS.healthyBand.low, RELIC_INVARIANTS.healthyBand.high))} ` +
    `(하한 ${pct(RELIC_INVARIANTS.minBandShare)})\n`,
);

for (const row of [...scored].sort((a, b) => b.winRate - a.winRate)) {
  console.log(`  ${pad(pct(row.winRate), 8)}  ${row.build.id}`);
}

const good = topBuilds(scored, RELIC_INVARIANTS.goodBuildRatio);
console.log(`\n좋은 조합(상위 ${pct(RELIC_INVARIANTS.goodBuildRatio)}): ${good.map((b) => b.id).join(' | ')}`);
console.log(
  `채택률(하한 ${pct(RELIC_INVARIANTS.minAdoption)}): ${[...adoptionRates(good, Object.keys(RELICS))]
    .map(([id, rate]) => `${id} ${pct(rate)}`)
    .join(', ')}`,
);

// 채택률의 반대쪽 — 빼면 얼마나 손해인가. 높으면 사실상 필수 유물이다 (T-035).
console.log(
  `\n필수도(상한 ${pct(RELIC_INVARIANTS.maxExclusionPenalty)}, 빼고 짠 최고 조합과의 차이):`,
);
for (const relicId of relicIds) {
  const penalty = exclusionPenalty(scored, relicId);
  console.log(
    `  ${pad(penalty === undefined ? '측정 불가' : pct(penalty), 10)}  ${relicId}`,
  );
}

console.log('\n판정은 `npm run test` 의 tests/balance 가 한다. 여기 숫자는 참고용이다.');
