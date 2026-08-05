import type { AiProfile } from '../core/battle/ai.js';
import type { ActorId, BattleActor, Stats } from '../core/battle/index.js';
import type { SimSetup } from '../core/battle/simulate.js';
import { aiProfile } from './ai.js';
import {
  BOSS_MULTIPLIERS,
  MOB_CURVES,
  PARTY_CURVES,
  makeCombatant,
  statsAtLevel,
} from './progression.js';

/**
 * 측정용 표준 시나리오.
 *
 * 밸런스 판정(GDD §5.5)과 CLI 리포트가 **같은 표본**을 써야 한다.
 * 서로 다른 편성으로 재면 "테스트는 통과하는데 리포트는 이상한" 상태가 된다.
 */

const PARTY_SIZE = 4;
const MOB_COUNT = 3;

/** 파티 스탯을 비율로 비튼다. 방어 편향 검사(GDD §5.5)에 쓴다. */
export interface StatSkew {
  readonly atk?: number;
  readonly def?: number;
  readonly mag?: number;
  readonly res?: number;
}

function skewStats(stats: Stats, skew: StatSkew): Stats {
  return {
    ...stats,
    atk: Math.round(stats.atk * (skew.atk ?? 1)),
    def: Math.round(stats.def * (skew.def ?? 1)),
    mag: Math.round(stats.mag * (skew.mag ?? 1)),
    res: Math.round(stats.res * (skew.res ?? 1)),
  };
}

function buildParty(level: number, skew: StatSkew = {}): BattleActor[] {
  const stats = skewStats(statsAtLevel(PARTY_CURVES, level), skew);
  return Array.from({ length: PARTY_SIZE }, (_, i) =>
    makeCombatant(`party-${i + 1}`, 'party', stats),
  );
}

function assignProfiles(
  actors: readonly BattleActor[],
  partyProfile: AiProfile,
  enemyProfile: AiProfile,
): Readonly<Record<ActorId, AiProfile>> {
  const profiles: Record<ActorId, AiProfile> = {};
  for (const actor of actors) {
    profiles[actor.id] = actor.side === 'party' ? partyProfile : enemyProfile;
  }
  return profiles;
}

/** 잡몹전: 파티 4 vs 잡몹 3. GDD §5.5 의 목표는 3~6턴이다. */
export function mobFight(level: number, skew: StatSkew = {}): SimSetup {
  const mobStats = statsAtLevel(MOB_CURVES, level);
  const actors = [
    ...buildParty(level, skew),
    ...Array.from({ length: MOB_COUNT }, (_, i) =>
      makeCombatant(`mob-${i + 1}`, 'enemy', mobStats),
    ),
  ];

  return { actors, profiles: assignProfiles(actors, aiProfile('striker'), aiProfile('brute')) };
}

/** 보스전: 파티 4 vs 보스 1. 목표는 12~25턴이다. */
export function bossFight(level: number, skew: StatSkew = {}): SimSetup {
  const bossStats = statsAtLevel(MOB_CURVES, level, BOSS_MULTIPLIERS);
  const actors = [
    ...buildParty(level, skew),
    makeCombatant('boss', 'enemy', bossStats, { affinity: { fire: 0.75 } }),
  ];

  return { actors, profiles: assignProfiles(actors, aiProfile('striker'), aiProfile('warden')) };
}

/** 측정 대상 레벨. 초반·중반·후반을 하나씩 본다. */
export const SAMPLE_LEVELS = [5, 20, 40] as const;

/** 방어 편향 검사용 편성. 같은 총량을 공격/방어에 다르게 배분한다. */
export const BUILD_SKEWS = {
  balanced: {} as StatSkew,
  offense: { atk: 1.5, mag: 1.5 } as StatSkew,
  defense: { def: 1.8, res: 1.8 } as StatSkew,
} as const;
