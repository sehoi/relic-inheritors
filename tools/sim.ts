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
import { BATTLE_TUNING } from '../src/data/battle.js';
import { BUILD_SKEWS, SAMPLE_LEVELS, bossFight, mobFight } from '../src/data/scenarios.js';

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

console.log('\n판정은 `npm run test` 의 tests/balance 가 한다. 여기 숫자는 참고용이다.');
