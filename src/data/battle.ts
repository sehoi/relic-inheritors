import type { DamageTuning } from '../core/battle/damage.js';
import type { TurnOrderTuning } from '../core/battle/index.js';

/**
 * 전투 튜닝 값.
 *
 * **코드에 하드코딩하지 않는다** (CLAUDE.md 규칙 6). 이 숫자들은 M2 의 시뮬레이터(T-019)가
 * 측정하고 조정할 대상이다. 지금 값은 초기 추정이며 근거는 ADR-009 에 있다.
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
 * 나머지는 초기 추정이며 T-019 시뮬레이터가 조정한다.
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
  minDamage: 1,
};
