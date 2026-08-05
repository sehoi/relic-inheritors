import { describe, expect, it } from 'vitest';
import { chooseCommand } from '../../src/core/battle/ai.js';
import { createBattle, currentActor, isAlive, step } from '../../src/core/battle/index.js';
import { canUseSkill, isOverloaded } from '../../src/core/battle/skill.js';
import { expAtLevel, expForEnemy } from '../../src/core/progress/level.js';
import { createRng, type Rng } from '../../src/core/rng/index.js';
import { BATTLE_TUNING, VICTORY_RECOVERY } from '../../src/data/battle.js';
import { rollEncounter } from '../../src/data/encounters.js';
import type { MapId } from '../../src/data/maps.js';
import { COIN_REWARD, EXP_REWARD, LEVEL_CURVE } from '../../src/data/progression.js';
import { innPrice } from '../../src/core/world/facility.js';
import { CLEANSING, INN } from '../../src/data/facilities.js';
import {
  cleanseParty,
  gainExp,
  getInventory,
  partyLevel,
  restAtInn,
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
    defeated * expForEnemy(encounter.level, COIN_REWARD),
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
  /** 침식으로 유물이 봉인된 파티원이 있는 채로 시작한 전투의 비율. */
  readonly sealedRate: number;
  /** 거점에 들렀을 때 실제로 잘 수 있었던 비율. 들르지 않았으면 1. */
  readonly affordableRest: number;
}

/** 지금 스킬을 하나라도 쓸 수 있는 파티원 수. MP 가 마르면 0이 된다. */
function readyCount(): number {
  const skills = partySkills();
  return partyForBattle().filter((member) =>
    (skills[member.id] ?? []).some((skill) => canUseSkill(member, skill, BATTLE_TUNING.erosion)),
  ).length;
}

/**
 * `cleanseEvery` 판마다 거점에 들른다고 본다. 0이면 들르지 않는다.
 *
 * 왕복 걸음 수는 세지 않는다 — 거점으로 가는 길은 안전지대를 지나므로 전투가 끼어들지 않고,
 * 이 측정이 답하려는 것은 "정화가 소모전을 바꾸는가" 이지 "왕복이 얼마나 귀찮은가" 가 아니다.
 */
interface Visits {
  /** 몇 판마다 거점에 들르는가. 0이면 들르지 않는다. */
  readonly every?: number;
  /** 들렀을 때 여관에서 자는가. */
  readonly rest?: boolean;
}

function runAttrition(mapId: MapId, startLevel: number, visits: Visits = {}): Run {
  const survived: number[] = [];
  const reached: number[] = [];
  let battlesSeen = 0;
  let readyBattles = 0;
  let sealedBattles = 0;
  let stops = 0;
  let rests = 0;

  const every = visits.every ?? 0;

  for (let trial = 0; trial < ATTRITION.trials; trial += 1) {
    resetParty();
    if (startLevel > 1) gainExp(expAtLevel(startLevel, LEVEL_CURVE));

    const worldRng = createRng(90_000 + trial);
    let count = 0;
    for (let battle = 0; battle < ATTRITION.battles; battle += 1) {
      if (every > 0 && battle > 0 && battle % every === 0) {
        cleanseParty(CLEANSING);
        if (visits.rest === true) {
          stops += 1;
          if (restAtInn(innPrice(partyLevel(), INN)) !== undefined) rests += 1;
        }
      }

      battlesSeen += 1;
      if (readyCount() > 0) readyBattles += 1;
      if (partyForBattle().some((m) => isOverloaded(m, BATTLE_TUNING.erosion))) {
        sealedBattles += 1;
      }

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
    sealedRate: battlesSeen === 0 ? 0 : sealedBattles / battlesSeen,
    affordableRest: stops === 0 ? 1 : rests / stops,
  };
}

const describeRun = (run: Run): string =>
  `전멸 ${(run.wipeRate * 100).toFixed(0)}%, 평균 ${run.avgBattles.toFixed(1)}판, ` +
  `도달 Lv${run.avgLevel.toFixed(1)}, 스킬 가동 ${(run.skillReadyRate * 100).toFixed(0)}%, ` +
  `봉인 ${(run.sealedRate * 100).toFixed(0)}%`;

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

/**
 * 침식이 주 자원인가, 그리고 거점이 값을 하는가 (T-047).
 *
 * 위의 가동률 불변식과 짝을 이룬다 — 저쪽은 **MP 가 덜 물려야 한다**는 상한이고,
 * 이쪽은 **침식이 물려야 한다**는 하한이다. 둘이 함께 GDD §6.2 의 자원 구조를 붙든다.
 */
describe('침식이 주 자원이다', () => {
  const bare = runAttrition('ruin-depths', ATTRITION.depthsPreparedLevel);

  it('정화 없이 굴리면 유물이 실제로 봉인된다', () => {
    // 0에 가까우면 침식은 숫자만 오르내리는 장식이고, 주 자원은 사실상 없는 셈이다.
    expect(bare.sealedRate, describeRun(bare)).toBeGreaterThanOrEqual(ATTRITION.minSealedRate);
  });

  it('거점에 들르면 눈에 띄게 줄어든다', () => {
    // 그러지 않으면 거점까지 걸어올 이유가 없고, 거점이 없는 것과 같아진다.
    const cleansed = runAttrition('ruin-depths', ATTRITION.depthsPreparedLevel, {
      every: ATTRITION.cleanseEvery,
    });

    expect(
      cleansed.sealedRate,
      `정화 없음: ${describeRun(bare)}\n  ${ATTRITION.cleanseEvery}판마다: ${describeRun(cleansed)}`,
    ).toBeLessThanOrEqual(bare.sealedRate * ATTRITION.cleansedSealedRatio);
  });
});

/**
 * 거점이 소모전의 답인가 (T-041a).
 *
 * 소모전 불변식이 "준비 없이 내려가면 위험하다" 를 지킨다면, 이쪽은 **"준비하면 넘을 수 있다"**
 * 를 지킨다. 둘 중 하나만 있으면 게임은 막다른 길이거나 산책이 된다.
 */
describe('거점이 소모전의 답이다', () => {
  const rested = runAttrition('ruin-depths', ATTRITION.depthsUnpreparedLevel, {
    every: ATTRITION.cleanseEvery,
    rest: true,
  });

  it('정화하고 자고 나오면 전멸을 피한다', () => {
    // 준비 없이 내려가면 33% 가 전멸하는 레벨이다 (`소모전 불변식` 참조).
    expect(rested.wipeRate, describeRun(rested)).toBeLessThanOrEqual(ATTRITION.maxRestedWipe);
  });

  it('벌이가 숙박비를 감당한다', () => {
    // 잘 돈이 없으면 그건 난이도가 아니라 막다른 길이다 —
    // 회복하려면 싸워야 하고 싸우려면 회복해야 하는 상태에 갇힌다.
    expect(
      rested.affordableRest,
      `${(rested.affordableRest * 100).toFixed(0)}% 만 잘 수 있었다`,
    ).toBeGreaterThanOrEqual(ATTRITION.minAffordableRest);
  });
});

describe('결정론', () => {
  it('같은 조건은 같은 결과를 낸다 (ADR-002)', () => {
    expect(runAttrition('ruin-entrance', 1)).toEqual(runAttrition('ruin-entrance', 1));
  });
});
