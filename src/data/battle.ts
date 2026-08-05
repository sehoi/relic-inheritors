import type { DamageTuning } from '../core/battle/damage.js';
import type { AilmentValue, ErosionTuning } from '../core/battle/skill.js';
import type { AilmentTuning } from '../core/battle/status.js';
import type { BattleTuning, FleeTuning, TurnOrderTuning } from '../core/battle/index.js';

/**
 * 전투 튜닝 값.
 *
 * **코드에 하드코딩하지 않는다** (CLAUDE.md 규칙 6). 이 숫자들은 M2 의 시뮬레이터(T-019)가
 * 측정하고 조정할 대상이다. `pierce` 와 `critMultiplier` 를 뺀 나머지는 초기 추정이다.
 */
export const TURN_ORDER: TurnOrderTuning = {
  // 흔들림이 없으면 턴 순서가 영원히 고정돼 기계적으로 느껴지고,
  // 너무 크면 민첩에 투자할 이유가 사라진다. 15%는 인접한 민첩끼리만 뒤바뀌는 폭이다.
  jitter: 0.15,
};

/**
 * 데미지 공식 상수 (ADR-009).
 *
 * `pierce` 와 `critMultiplier` 는 실제 수치 검증을 거쳐 정해졌다 —
 * 순수 감산형은 방어 스택으로 무적이 되고, 치명타 2.0 은 무작위 폭을 2.4배로 키웠다.
 */
export const DAMAGE: DamageTuning = {
  pierce: 0.2,
  defFactor: 0.5,
  varianceMin: 0.9,
  varianceMax: 1.1,
  critMultiplier: 1.5,
  critBaseChance: 0.05,
  // 행운 25면 +5%p. 행운에 투자할 이유는 주되 지배적이지는 않게.
  critLukFactor: 0.002,
  critMaxChance: 0.5,
  // 절반. 한 턴을 버리는 대가로는 이 정도가 균형점이라고 보고 시작한다.
  guardMultiplier: 0.5,
  minDamage: 1,
};

export const FLEE: FleeTuning = {
  baseChance: 0.5,
  agiFactor: 0.02,
  minChance: 0.1,
  // 100%로 두지 않는다 — 도망이 항상 통하면 모든 전투가 선택 사항이 되고,
  // 유물 조합을 고민할 이유가 사라진다.
  maxChance: 0.95,
};

/**
 * 침식 (GDD §5.4).
 *
 * `threshold` 100 은 표본 스킬 기준으로 강한 스킬 3회 또는 약한 스킬 8회쯤에서
 * 폭주가 오도록 잡은 값이다. T-019 시뮬레이터가 실제 전투 길이에 맞춰 조정한다.
 */
export const EROSION: ErosionTuning = {
  base: 10,
  // 최대 MP 1당 2.2. 스킬 하나당 (MP 4, 침식 12) 기준으로
  // "MP 를 3분의 2쯤 쓰면 폭주" 라는 모양이 레벨과 무관하게 유지된다 (ADR-010).
  perMaxMp: 2.2,
  // 0으로 두지 않는다 — 폭주가 침식을 완전히 씻어내면
  // "일부러 폭주시키고 다시 시작"이 최적 전략이 된다.
  reliefRatio: 0.5,
  maxMultiplier: 2,
};

/**
 * 상태이상 (GDD §6.2).
 *
 * 마비 40%, 혼란 50% 는 "가끔 억울하지만 대책은 세울 수 있는" 정도를 노린 초기값이다.
 * 100%에 가까우면 걸린 순간 게임이 끝나고, 낮으면 이상을 거는 스킬이 무의미해진다.
 */
export const AILMENT: AilmentTuning = {
  poisonPercent: 0.06,
  paralysisSkipChance: 0.4,
  confusionChance: 0.5,
  defaultTurns: {
    poison: 5,
    paralysis: 3,
    // 수면은 피격하면 깨므로 길어도 된다.
    sleep: 4,
    silence: 3,
    confusion: 3,
  },
};

/**
 * 상태이상 하나가 위력 몇에 해당하는가 (T-028a).
 *
 * 침식을 매길 때 쓴다. 순수 위력에만 비례시키면 상태이상 스킬이 침식당 값어치가
 * 가장 높아져, "싸고 센 것만 계속 쓴다" 가 정답이 된다.
 *
 * 침묵이 가장 비싸다 — 상대의 스킬을 통째로 봉인하므로 유물 시스템에 대한 직접적인 반격이다.
 * 독이 가장 싸다 — 시간이 걸리고 전투가 끝나면 사라진다.
 */
export const AILMENT_POWER: AilmentValue = {
  silence: 80,
  paralysis: 70,
  confusion: 60,
  sleep: 55,
  poison: 40,
};

export const BATTLE_TUNING: BattleTuning = {
  turnOrder: TURN_ORDER,
  damage: DAMAGE,
  flee: FLEE,
  erosion: EROSION,
  ailment: AILMENT,
};
