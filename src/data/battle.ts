import type { DamageTuning } from '../core/battle/damage.js';
import type { AilmentValue, ErosionTuning } from '../core/battle/skill.js';
import type { Ailment, AilmentState, AilmentTuning } from '../core/battle/status.js';
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

/**
 * 승리 뒤 돌아오는 것 (T-046).
 *
 * **MP 만 돌아온다. HP 는 돌아오지 않는다.**
 *
 * GDD §6.2 는 "MP 대신 **침식**이 주 자원. MP는 보조 자원으로 유지" 라고 정해뒀는데,
 * 실측해보니 정반대였다 — 지하 소모전에서 전투의 35~39%가 **아무도 스킬을 못 쓰는**
 * 상태로 시작했다 (T-045). MP 가 마르면 남는 것은 기본 공격뿐이고, 그 구간에서
 * 이 게임은 유물 게임이 아니다.
 *
 * 적 하나당 1 은 **가장 작은 알아볼 수 있는 단위**다. 비율로 주면 "MP 1 회복" 같은
 * 눈에 띄지 않는 값이 나오고, 이보다 크게 줘도 가동률은 더 오르지 않는다(98% 에서 포화).
 * 전투가 클수록 많이 돌려주는 것도 자연스럽다 — 크게 싸웠으니 크게 돌아온다.
 *
 * HP 를 함께 돌려주면 소모전이라는 축 자체가 사라진다. 그건 거점의 몫이다.
 */
export const VICTORY_RECOVERY = {
  mpPerEnemy: 1,
} as const;

/**
 * 상태이상의 표시 이름 (T-059).
 *
 * **화면에 이름이 없으면 걸었는지 알 수 없다.** 상태이상은 다섯 가지가 서로 다른 방식으로
 * 커맨드 선택을 제약하는데(`core/battle/status.ts`), 그 제약이 걸렸는지 보이지 않으면
 * 독을 묻히는 스킬과 그냥 약한 스킬이 구분되지 않는다.
 *
 * 짧게 잡았다 — 적 하나당 쓸 수 있는 폭이 60px 남짓이라 두 글자를 넘으면 겹친다.
 */
export const AILMENT_NAMES: Readonly<Record<Ailment, string>> = {
  poison: '독',
  paralysis: '마비',
  sleep: '수면',
  silence: '침묵',
  confusion: '혼란',
};

/** `독2 침묵1` — 남은 턴까지 보여준다. 한 턴 남은 것과 다섯 턴 남은 것은 다른 상황이다. */
export function describeAilments(ailments: readonly AilmentState[]): string {
  return ailments.map((a) => `${AILMENT_NAMES[a.kind]}${a.turns}`).join(' ');
}

/**
 * 레벨업이 되돌려주는 것 (T-049c).
 *
 * **예전에는 완전 회복이었다.** T-044 에서 "회복 없이 평균 6판이면 전멸" 을 고치려고
 * 넣은 값이고, 그 문제는 실제로 고쳐졌다. 그런데 T-046 의 승리 MP 회복과 겹치면서
 * **소모전이라는 축 자체가 사라졌다** — 이기는 동안은 자원이 계속 채워지니
 * 쌓여서 지는 일이 없어지고, 지는 방식이 "한 판을 진다" 하나만 남았다.
 *
 * 그 결과 두 가지가 틀어졌다:
 *
 * 1. **거점이 소모전의 답이 아니게 됐다.** 자고 나와도 전멸률이 18% → 13% 밖에 안 줄었다.
 *    한 판 지는 것은 만HP 로 시작해도 못 막기 때문이다.
 * 2. **성장이 손해가 되는 구간이 생겼다.** 경험치 곡선이 지수 1.8 이라 레벨이 높을수록
 *    레벨업이 드물다 — 회복 횟수가 줄어드는 쪽이 스탯 이득보다 컸다.
 *
 * 그래서 완전 회복을 **최대치의 일부**로 바꿨다. "한 판만 더 버티면 오른다" 는 남기되
 * (그게 T-044 가 지키려던 것이다) 판을 넘어 쌓이는 소모는 지우지 않는다.
 *
 * 상태이상은 예전처럼 함께 풀린다. 이번에 바꾼 것은 회복량 하나뿐이다 —
 * 밸런스 비교는 변수를 하나만 남기고 한다.
 */
export const LEVEL_UP_RECOVERY = {
  hpRatio: 0.7,
  mpRatio: 0.7,
} as const;

export const BATTLE_TUNING: BattleTuning = {
  turnOrder: TURN_ORDER,
  damage: DAMAGE,
  flee: FLEE,
  erosion: EROSION,
  ailment: AILMENT,
};
