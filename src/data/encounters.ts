import type { AiProfile } from '../core/battle/ai.js';
import type { ActorId, BattleActor } from '../core/battle/index.js';
import type { Inventory } from '../core/battle/item.js';
import type { Skill } from '../core/battle/skill.js';
import { pickWeighted, type EncounterTuning } from '../core/world/encounter.js';
import type { Rng } from '../core/rng/index.js';
import { aiProfile } from './ai.js';
import type { MapId } from './maps.js';
import { MOB_CURVES, PARTY_CURVES, makeCombatant, statsAtLevel } from './progression.js';
import { skill } from './skills.js';

/**
 * 전투 편성.
 *
 * 고유명사는 확정 전까지 쓰지 않는다 (GDD §10). 여기 이름들은 **역할을 가리키는 보통명사**다 —
 * 계승자의 진짜 이름은 세계관이 정해질 때 붙는다.
 *
 * 능력은 캐릭터가 아니라 유물에서 와야 하지만(ADR-004) 유물은 M3 다.
 * 그때까지는 스킬을 직접 들려준다 — **이 배선은 M3 에서 유물 슬롯으로 교체된다.**
 */

export interface Encounter {
  readonly actors: readonly BattleActor[];
  readonly profiles: Readonly<Record<ActorId, AiProfile>>;
  /** 파티원이 쓸 수 있는 스킬. M3 에서 장착 유물이 이 자리를 대신한다. */
  readonly partySkills: Readonly<Record<ActorId, readonly Skill[]>>;
  readonly inventory: Inventory;
}

export function starterParty(level: number): BattleActor[] {
  const stats = statsAtLevel(PARTY_CURVES, level);
  return [
    makeCombatant('vanguard', 'party', stats, { name: '전위' }),
    makeCombatant('caster', 'party', { ...stats, mag: Math.round(stats.mag * 1.3) }, {
      name: '술사',
    }),
  ];
}

const MOB_TEMPLATES = {
  remnant: { name: '각인 잔재', tile: 108, affinity: { thunder: 1.5, earth: 0.5 } },
  warden: { name: '무너진 파수꾼', tile: 122, affinity: { fire: 1.4 } },
} as const;

export type MobKind = keyof typeof MOB_TEMPLATES;

export function ruinMob(kind: MobKind, index: number, level: number): BattleActor {
  const template = MOB_TEMPLATES[kind];
  return makeCombatant(`${kind}-${index}`, 'enemy', statsAtLevel(MOB_CURVES, level), {
    name: template.name,
    affinity: template.affinity,
  });
}

/** 적 스프라이트의 타일 번호. 화면 표현이라 데이터에 함께 둔다. */
export function mobTile(actorId: ActorId): number {
  const kind = actorId.split('-')[0] as MobKind;
  return MOB_TEMPLATES[kind]?.tile ?? 108;
}

/** 유적 입구의 표준 조우. 인카운터 테이블이 이걸 고른다. */
export function ruinEncounter(
  level: number,
  mobCount = 2,
  party: readonly BattleActor[] = starterParty(level),
  inventory: Inventory = { herb: 3, antidote: 1, 'cleansing-stone': 1, 'ashen-ember': 1 },
): Encounter {
  const mobs = Array.from({ length: mobCount }, (_, i) =>
    ruinMob(i % 2 === 0 ? 'remnant' : 'warden', i + 1, level),
  );

  const actors = [...party, ...mobs];
  const profiles: Record<ActorId, AiProfile> = {};
  for (const actor of actors) {
    // 파티는 사람이 조작하지만, 프로필을 채워두면 시뮬레이터와 자동 진행이 같은 편성을 쓴다.
    profiles[actor.id] = actor.side === 'party' ? aiProfile('striker') : aiProfile('brute');
  }

  return {
    actors,
    profiles,
    partySkills: {
      vanguard: [skill('stone-fist')],
      caster: [skill('ember-lash'), skill('sundering-arc')],
    },
    inventory,
  };
}

/**
 * 지역별 인카운터 테이블 (GDD §6.1).
 *
 * 깊은 층일수록 적이 많다 — 층 자체가 난이도 축이 된다.
 */
export interface EncounterEntry {
  readonly weight: number;
  readonly mobCount: number;
}

export const ENCOUNTER_TABLES: Readonly<Record<MapId, readonly EncounterEntry[]>> = {
  'ruin-entrance': [
    { weight: 6, mobCount: 2 },
    { weight: 3, mobCount: 1 },
    { weight: 1, mobCount: 3 },
  ],
  'ruin-depths': [
    { weight: 5, mobCount: 3 },
    { weight: 4, mobCount: 2 },
    { weight: 1, mobCount: 4 },
  ],
};

/**
 * 걸음 수 범위 (GDD §6.1).
 *
 * 최소 8걸음은 안전하다 — 전투 직후 바로 또 싸우면 탐색이 성립하지 않는다.
 * 최대 20걸음 안에는 반드시 한 번. T-019 시뮬레이터가 연속 전투를 재게 되면 조정 대상이다.
 */
export const ENCOUNTER_STEPS: EncounterTuning = { minSteps: 8, maxSteps: 20 };

/** 지역 레벨. 층이 깊을수록 높다. */
export const AREA_LEVELS: Readonly<Record<MapId, number>> = {
  'ruin-entrance': 6,
  'ruin-depths': 9,
};

/** 그 지역에서 한 번 조우를 뽑는다. */
export function rollEncounter(
  mapId: MapId,
  rng: Rng,
  party?: readonly BattleActor[],
  inventory?: Inventory,
): Encounter {
  const table = ENCOUNTER_TABLES[mapId];
  const entry = pickWeighted(
    table.map((row) => ({ weight: row.weight, value: row })),
    rng,
  );
  const level = AREA_LEVELS[mapId];

  return ruinEncounter(
    level,
    entry.mobCount,
    party ?? starterParty(level),
    inventory ?? { herb: 3, antidote: 1, 'cleansing-stone': 1, 'ashen-ember': 1 },
  );
}
