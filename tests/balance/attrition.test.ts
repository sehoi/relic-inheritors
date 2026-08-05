import { describe, expect, it } from 'vitest';
import { chooseCommand } from '../../src/core/battle/ai.js';
import { createBattle, currentActor, isAlive, step } from '../../src/core/battle/index.js';
import { canUseSkill } from '../../src/core/battle/skill.js';
import { expAtLevel, expForEnemy } from '../../src/core/progress/level.js';
import { createRng, type Rng } from '../../src/core/rng/index.js';
import { BATTLE_TUNING, VICTORY_RECOVERY } from '../../src/data/battle.js';
import { rollEncounter } from '../../src/data/encounters.js';
import type { MapId } from '../../src/data/maps.js';
import { EXP_REWARD, LEVEL_CURVE } from '../../src/data/progression.js';
import {
  gainExp,
  getInventory,
  partyForBattle,
  partyProgress,
  partySkills,
  resetParty,
  settleVictory,
} from '../../src/game/partyStore.js';
import { ATTRITION } from '../../src/data/invariants.js';

/**
 * 소모전 불변식 (GDD §5.5, T-044).
 *
 * **단판 측정으로는 이 게임의 난이도를 알 수 없다.** 유적에는 회복 수단이 없어서
 * (거점은 T-040) HP·MP·침식이 판을 넘어 쌓인다. 실제로 단판 승률이 100% 인데도
 * 연속으로는 평균 6판 만에 전멸하던 시기가 있었고, 그게 "처음부터 너무 어렵다" 는
 * 플레이 피드백의 정체였다.
 *
 * 그래서 여기서는 **회복 없이 몇 판을 이어갈 수 있는가**를 잰다.
 * 회복은 레벨업뿐이다 — 그게 지금 유적 안의 유일한 숨통이다.
 *
 * T-019 에서 `it.todo` 로 남긴 "유적 1회 완주" 불변식이 이것으로 대체됐다.
 */

/** 한 판. 실제 `BattleScene.finish` 와 같은 순서로 결과를 반영한다. */
function fight(mapId: MapId, worldRng: Rng, seed: number): boolean {
  const encounter = rollEncounter(mapId, worldRng, {
    party: partyForBattle(),
    partySkills: partySkills(),
    inventory: getInventory(),
  });

  let state = createBattle(encounter.actors, seed, BATTLE_TUNING);
  const aiRng = createRng(seed ^ 0x9e37_79b9);

  for (let turn = 0; turn < 400 && state.outcome === 'ongoing'; turn += 1) {
    const acting = currentActor(state);
    if (acting === undefined) break;
    const profile = encounter.profiles[acting.id];
    if (profile === undefined) break;
    state = step(
      state,
      chooseCommand(state, acting.id, profile, aiRng, BATTLE_TUNING),
      BATTLE_TUNING,
    ).state;
  }

  if (state.outcome !== 'victory') return false;

  // **게임과 같은 길을 지난다.** `BattleScene` 도 이 함수를 부른다 — 정산이 흩어져 있으면
  // 시뮬레이터가 게임과 다른 것을 재게 된다 (T-044 에서 실제로 그랬다).
  const defeated = state.actors.filter((a) => a.side === 'enemy' && !isAlive(a)).length;
  settleVictory(
    state.actors,
    state.inventory,
    {},
    defeated,
    defeated * expForEnemy(encounter.level, EXP_REWARD),
    VICTORY_RECOVERY,
  );
  return true;
}

interface Run {
  /** 연속 판수를 다 버틴 비율의 반대 — 전멸한 비율. */
  readonly wipeRate: number;
  readonly avgBattles: number;
  readonly avgLevel: number;
  /** 스킬을 하나라도 쓸 수 있는 상태로 시작한 전투의 비율. */
  readonly skillReadyRate: number;
}

/** 지금 스킬을 하나라도 쓸 수 있는 파티원 수. MP 가 마르면 0이 된다. */
function readyCount(): number {
  const skills = partySkills();
  return partyForBattle().filter((member) =>
    (skills[member.id] ?? []).some((skill) => canUseSkill(member, skill, BATTLE_TUNING.erosion)),
  ).length;
}

function runAttrition(mapId: MapId, startLevel: number): Run {
  const survived: number[] = [];
  const reached: number[] = [];
  let battlesSeen = 0;
  let readyBattles = 0;

  for (let trial = 0; trial < ATTRITION.trials; trial += 1) {
    resetParty();
    if (startLevel > 1) gainExp(expAtLevel(startLevel, LEVEL_CURVE));

    const worldRng = createRng(90_000 + trial);
    let count = 0;
    for (let battle = 0; battle < ATTRITION.battles; battle += 1) {
      battlesSeen += 1;
      if (readyCount() > 0) readyBattles += 1;

      if (!fight(mapId, worldRng, 9000 + trial * 100 + battle)) break;
      count += 1;
    }
    survived.push(count);
    reached.push(partyProgress().level);
  }

  const mean = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
  return {
    wipeRate: survived.filter((v) => v < ATTRITION.battles).length / ATTRITION.trials,
    avgBattles: mean(survived),
    avgLevel: mean(reached),
    skillReadyRate: battlesSeen === 0 ? 0 : readyBattles / battlesSeen,
  };
}

const describeRun = (run: Run): string =>
  `전멸 ${(run.wipeRate * 100).toFixed(0)}%, 평균 ${run.avgBattles.toFixed(1)}판, ` +
  `도달 Lv${run.avgLevel.toFixed(1)}, 스킬 가동 ${(run.skillReadyRate * 100).toFixed(0)}%`;

describe('시작 지역은 너그럽다', () => {
  const run = runAttrition('ruin-entrance', 1);

  it(`레벨 1로 시작해 ${ATTRITION.battles}판을 이어가도 거의 전멸하지 않는다`, () => {
    // 여기가 무너지면 플레이어는 게임을 배우기 전에 진다.
    // "처음부터 너무 어렵다" 는 피드백이 나왔을 때 이 값은 100% 였다.
    expect(run.wipeRate, describeRun(run)).toBeLessThanOrEqual(ATTRITION.maxEarlyWipe);
  });

  it('그동안 레벨이 실제로 오른다', () => {
    // 안 오르면 너그러운 게 아니라 아무 일도 안 일어나는 것이다.
    expect(run.avgLevel, describeRun(run)).toBeGreaterThanOrEqual(ATTRITION.minEarlyLevel);
  });
});

describe('다음 층은 단차가 있다', () => {
  it('준비 없이 내려가면 위험하다', () => {
    // 단차가 없으면 "더 깊이 갈까 돌아갈까" 라는 판단이 사라진다.
    const run = runAttrition('ruin-depths', ATTRITION.depthsUnpreparedLevel);
    expect(run.wipeRate, describeRun(run)).toBeGreaterThanOrEqual(ATTRITION.minDepthsWipe);
  });

  it('성장하면 감당된다', () => {
    // 단차가 벽이면 그건 난이도가 아니라 막다른 길이다.
    const run = runAttrition('ruin-depths', ATTRITION.depthsPreparedLevel);
    expect(run.wipeRate, describeRun(run)).toBeLessThanOrEqual(ATTRITION.maxPreparedWipe);
  });
});

/**
 * 유물 시스템이 실제로 작동하는가 (T-045).
 *
 * **능력이 유물에서 나오는 게임에서**(ADR-004) MP 가 마르면 남는 것은 기본 공격뿐이고,
 * 그 구간에서 이 게임은 유물 게임이 아니다. 승률만 보면 이 문제가 보이지 않는다 —
 * 기본 공격만으로도 이길 수는 있기 때문이다.
 */
describe('유물 시스템 가동률', () => {
  it('시작 지역에서는 거의 늘 스킬을 쓸 수 있다', () => {
    const run = runAttrition('ruin-entrance', 1);
    expect(run.skillReadyRate, describeRun(run)).toBeGreaterThanOrEqual(0.8);
  });

  it('깊은 층에서도 바닥 아래로 내려가지 않는다', () => {
    // ⚠️ 이 값은 목표가 아니라 바닥이다. 실측 61~65% — 열 판 중 넷은 아무도 스킬을 못 쓴다.
    // MP 회복 수단이 생기면(T-046) 올려야 한다.
    const run = runAttrition('ruin-depths', ATTRITION.depthsPreparedLevel);
    expect(run.skillReadyRate, describeRun(run)).toBeGreaterThanOrEqual(
      ATTRITION.minSkillReadyRate,
    );
  });
});

describe('결정론', () => {
  it('같은 조건은 같은 결과를 낸다 (ADR-002)', () => {
    expect(runAttrition('ruin-entrance', 1)).toEqual(runAttrition('ruin-entrance', 1));
  });
});
