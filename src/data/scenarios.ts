import type { AiProfile } from '../core/battle/ai.js';
import type { ActorId, BattleActor, Stats } from '../core/battle/index.js';
import type { Skill } from '../core/battle/skill.js';
import type { SimSetup } from '../core/battle/simulate.js';
import { activesOf, applyStatMods, sumStatMods, type Relic, type RelicId } from '../core/relic/index.js';
import { aiProfile } from './ai.js';
import { PARTY_SIZE } from './party.js';
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

/**
 * 표준 잡몹전의 적 수.
 *
 * **실제로 가장 자주 나오는 편성이어야 한다** (`ENCOUNTER_TABLES` 의 최대 가중치).
 * 드문 편성으로 재면 "표준" 전투 길이가 표준이 아닌 것을 가리킨다.
 *
 * 두 맵 모두 최대 가중치가 2마리다 (`ENCOUNTER_TABLES`).
 *
 * ⚠️ **조합 훑기는 이 수를 쓰지 않는다** (`BUILD_SWEEP.mobCount`). 훑기에는 승률이 갈리는
 * 편성이 필요한데 실제 조우는 그렇지 않다 — 4인 파티에게 2~3마리는 적 Lv46 까지 올려도
 * 전 조합 승률 100% 다. 훑기는 이미 적 레벨도 게임에 없는 값(37)을 쓴다.
 * **측정 지점은 인위적이어도 되지만 "표준 전투" 는 그러면 안 된다** —
 * 이쪽은 게임이 실제로 무엇인지를 가리키는 자리다.
 */
const MOB_COUNT = 2;

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

/**
 * 측정용 파티.
 *
 * **인원은 `data/party.ts` 를 따른다.** 여기 숫자를 따로 적어두었더니 게임이 2인인 동안
 * 시뮬레이터가 4인을 재고 있었다 — 그 상태의 측정은 존재하지 않는 편성에 대한 것이었다.
 */
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

// ── 유물 편성 시나리오 (T-026) ──────────────────────────────────────────────
//
// 위의 `mobFight`·`bossFight` 는 파티에게 고정 AI 프로필을 쥐여준다. 그걸로는
// **유물이 바뀌면 무엇이 달라지는가** 를 잴 수 없다 — 침식 계수도 공명도 관여하지 않는다.
// 아래는 유물 편성을 실제로 갈아끼우며 재기 위한 것이고, T-027 의 조합 훑기가 이 위에 얹힌다.

/**
 * 유물이 공급한 스킬로 싸우는 AI.
 *
 * 기본 공격에 무게를 두되 스킬도 충분히 섞는다. 스킬을 거의 안 쓰면 침식이 쌓이지 않아
 * 무엇을 재는 시나리오인지 흐려진다.
 */
function relicProfile(skills: readonly Skill[]): AiProfile {
  return {
    id: `relic:${skills.map((skill) => skill.id).join('+')}`,
    phases: [
      {
        id: 'always',
        options: [
          { weight: 6, kind: 'attack', targeting: 'weakest' },
          ...skills.map((skill) => ({
            weight: 4,
            kind: 'skill' as const,
            skill,
            targeting: 'weakest' as const,
          })),
        ],
      },
    ],
  };
}

export interface RelicFightOptions {
  /** 잡몹 3 (짧게) / 보스 1 (길게). 침식은 긴 전투에서만 물린다. */
  readonly opponent?: 'mob' | 'boss';
  readonly ranks?: Readonly<Record<RelicId, number>>;
  /** 공명 등에서 오는 파티 전체 침식 완화 배수. */
  readonly erosionRelief?: number;
  /**
   * 적 레벨. 생략하면 파티와 같다.
   *
   * 조합 훑기(GDD §5.5 불변식 1·2)에는 **승률이 갈리는 난이도**가 필요하다.
   * 전부 이기거나 전부 지는 구간에서는 조합의 차이가 승률에 나타나지 않아, 측정 자체가 성립하지 않는다.
   */
  readonly enemyLevel?: number;
  /** 적 수. 생략하면 표준 편성(`MOB_COUNT`). 조합 훑기가 여기를 따로 잡는다. */
  readonly mobCount?: number;
}

/**
 * 파티 전원이 같은 유물 편성을 낀 전투.
 *
 * 스탯 보정도 함께 적용한다 — 실제 게임이 그렇게 굴러가기 때문이다. 대신 **계수만 다른
 * 두 유물을 비교하면 보정이 상쇄되어** 침식만 남는다. ADR-010 에서 원인을 잘못 읽은 뒤로,
 * 이 프로젝트에서 밸런스 비교는 변수를 하나만 남기고 한다.
 */
export function relicFight(
  level: number,
  relics: readonly Relic[],
  options: RelicFightOptions = {},
): SimSetup {
  const skills = activesOf(relics, options.ranks ?? {}, options.erosionRelief ?? 1);
  const stats = applyStatMods(statsAtLevel(PARTY_CURVES, level), sumStatMods(relics));

  const party = Array.from({ length: PARTY_SIZE }, (_, i) =>
    makeCombatant(`party-${i + 1}`, 'party', stats),
  );

  const enemyLevel = options.enemyLevel ?? level;
  const enemies =
    options.opponent === 'boss'
      ? [
          makeCombatant('boss', 'enemy', statsAtLevel(MOB_CURVES, enemyLevel, BOSS_MULTIPLIERS), {
            affinity: { fire: 0.75 },
          }),
        ]
      : Array.from({ length: options.mobCount ?? MOB_COUNT }, (_, i) =>
          makeCombatant(`mob-${i + 1}`, 'enemy', statsAtLevel(MOB_CURVES, enemyLevel)),
        );

  const actors = [...party, ...enemies];
  const enemyProfile = aiProfile(options.opponent === 'boss' ? 'warden' : 'brute');

  return { actors, profiles: assignProfiles(actors, relicProfile(skills), enemyProfile) };
}

/** 측정 대상 레벨. 초반·중반·후반을 하나씩 본다. */
export const SAMPLE_LEVELS = [5, 20, 40] as const;

/** 방어 편향 검사용 편성. 같은 총량을 공격/방어에 다르게 배분한다. */
export const BUILD_SKEWS = {
  balanced: {} as StatSkew,
  offense: { atk: 1.5, mag: 1.5 } as StatSkew,
  defense: { def: 1.8, res: 1.8 } as StatSkew,
} as const;
