/**
 * 적 AI (GDD §6.2, ADR-001).
 *
 * AI 는 **상태가 아니라 정책이다.** `BattleState` 에 넣지 않고 밖에서 커맨드를 만들어 넣는다.
 * 그래서 상태 머신은 AI 를 모르고, 시뮬레이터는 같은 전투에 다른 AI 를 붙여 실험할 수 있다.
 *
 * 행동은 가중치로 고르고, HP 비율로 페이즈가 바뀐다. 보스의 "체력이 절반 아래로 떨어지면
 * 사나워진다" 가 이것으로 표현된다.
 */

import type { Rng } from '../rng/index.js';
import {
  isAlive,
  validTargets,
  type BattleState,
  type BattleTuning,
  type Command,
  type ActorId,
  type BattleActor,
} from './index.js';
import { canUseSkill, type Skill } from './skill.js';
import { hasAilment } from './status.js';

/**
 * 대상 선택 방식.
 * - `random`: 균등 무작위
 * - `weakest`: 남은 HP 가 가장 적은 쪽 — 마무리를 노린다
 * - `toughest`: 남은 HP 가 가장 많은 쪽 — 벽을 먼저 깎는다
 */
export type AiTargeting = 'random' | 'weakest' | 'toughest';

export interface AiOption {
  /** 상대 가중치. 클수록 자주 고른다. 양수여야 한다. */
  readonly weight: number;
  readonly kind: 'attack' | 'guard' | 'skill';
  /** `kind: 'skill'` 일 때 필수 */
  readonly skill?: Skill;
  readonly targeting?: AiTargeting;
}

export interface AiPhase {
  readonly id: string;
  /**
   * 현재 HP 비율이 이 값 이하일 때 이 페이즈를 쓴다. 생략하면 항상 해당한다.
   * 페이즈는 **위에서부터 첫 조건 만족** 순으로 고른다 — 목록 순서가 곧 우선순위다.
   */
  readonly hpAtOrBelow?: number;
  readonly options: readonly AiOption[];
}

export interface AiProfile {
  readonly id: string;
  readonly phases: readonly AiPhase[];
}

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiError';
  }
}

export function hpRatio(actor: BattleActor): number {
  return actor.stats.maxHp === 0 ? 0 : actor.hp / actor.stats.maxHp;
}

/** 지금 적용되는 페이즈. 조건을 만족하는 것이 없으면 마지막 페이즈로 떨어진다. */
export function activePhase(actor: BattleActor, profile: AiProfile): AiPhase {
  if (profile.phases.length === 0) {
    throw new AiError(`AI 프로필 "${profile.id}" 에 페이즈가 없습니다.`);
  }

  const ratio = hpRatio(actor);
  const matched = profile.phases.find(
    (phase) => phase.hpAtOrBelow === undefined || ratio <= phase.hpAtOrBelow,
  );

  return matched ?? (profile.phases[profile.phases.length - 1] as AiPhase);
}

/**
 * 지금 실제로 쓸 수 있는 선택지만 남긴다.
 *
 * 쓸 수 없는 스킬을 고르면 `step()` 이 던진다. AI 가 규칙을 어기고 전투를 멈추는 것보다,
 * 애초에 고를 수 없게 하는 편이 낫다.
 */
export function usableOptions(
  actor: BattleActor,
  phase: AiPhase,
  tuning: BattleTuning,
): readonly AiOption[] {
  return phase.options.filter((option) => {
    if (option.weight <= 0) return false;
    if (option.kind !== 'skill') return true;

    if (option.skill === undefined) return false;
    if (hasAilment(actor, 'silence')) return false;
    return canUseSkill(actor, option.skill, tuning.erosion);
  });
}

function pickWeighted(options: readonly AiOption[], rng: Rng): AiOption {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = rng.next() * total;

  for (const option of options) {
    roll -= option.weight;
    if (roll < 0) return option;
  }
  // 부동소수 오차로 여기 도달할 수 있다. 마지막 항목으로 떨어뜨린다.
  return options[options.length - 1] as AiOption;
}

function pickTarget(
  candidates: readonly BattleActor[],
  targeting: AiTargeting,
  rng: Rng,
): BattleActor {
  switch (targeting) {
    case 'random':
      return rng.pick(candidates);

    // 동점은 id 순으로 끊는다. 정렬이 불안정하면 같은 시드로도 다른 전개가 나온다.
    case 'weakest':
      return [...candidates].sort((a, b) => a.hp - b.hp || (a.id < b.id ? -1 : 1))[0] as BattleActor;

    case 'toughest':
      return [...candidates].sort((a, b) => b.hp - a.hp || (a.id < b.id ? -1 : 1))[0] as BattleActor;
  }
}

/**
 * 이 액터가 이번 턴에 낼 커맨드를 정한다.
 *
 * 대상이 하나도 없으면 방어한다 — 던지지 않는다. 전투가 끝나가는 프레임에서
 * AI 가 예외를 던지면 그 원인을 추적하기 어렵다.
 */
export function chooseCommand(
  state: BattleState,
  actorId: ActorId,
  profile: AiProfile,
  rng: Rng,
  tuning: BattleTuning,
): Command {
  const actor = state.actors.find((a) => a.id === actorId);
  if (actor === undefined) {
    throw new AiError(`전투에 "${actorId}" 가 없습니다.`);
  }
  if (!isAlive(actor)) {
    throw new AiError(`"${actorId}" 는 이미 쓰러졌습니다.`);
  }

  const phase = activePhase(actor, profile);
  const options = usableOptions(actor, phase, tuning);

  // 쓸 수 있는 선택지가 없으면 기본 공격으로 떨어진다.
  const chosen: AiOption =
    options.length === 0 ? { weight: 1, kind: 'attack' } : pickWeighted(options, rng);

  if (chosen.kind === 'guard') {
    return { type: 'guard', actor: actorId };
  }

  const candidates = validTargets(state, actorId);
  if (candidates.length === 0) {
    return { type: 'guard', actor: actorId };
  }

  const target = pickTarget(candidates, chosen.targeting ?? 'random', rng);

  if (chosen.kind === 'skill' && chosen.skill !== undefined) {
    return { type: 'skill', actor: actorId, target: target.id, skill: chosen.skill };
  }
  return { type: 'attack', actor: actorId, target: target.id };
}
