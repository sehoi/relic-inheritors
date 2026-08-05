import type { AiProfile } from '../core/battle/ai.js';
import type { ActorId, BattleActor } from '../core/battle/index.js';
import type { Inventory } from '../core/battle/item.js';
import type { Skill } from '../core/battle/skill.js';
import { pickWeighted, type EncounterTuning } from '../core/world/encounter.js';
import type { Rng } from '../core/rng/index.js';
import { aiProfile } from './ai.js';
import type { MapId } from './maps.js';
import { MOB_CURVES, PARTY_CURVES, makeCombatant, statsAtLevel } from './progression.js';

/**
 * 전투 편성.
 *
 * 고유명사는 확정 전까지 쓰지 않는다 (GDD §10). 여기 이름들은 **역할을 가리키는 보통명사**다 —
 * 계승자의 진짜 이름은 세계관이 정해질 때 붙는다.
 *
 * **능력은 캐릭터가 아니라 유물에서 온다** (ADR-004). 이 모듈은 스킬을 만들지 않고
 * 넘겨받기만 한다 — 만드는 쪽은 `game/partyStore` 의 `partySkills()` 다.
 */

export interface Encounter {
  /** 이 조우의 적 레벨. 경험치 보상이 여기서 나온다 (T-044). */
  readonly level: number;
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

export interface EncounterOptions {
  readonly mobCount?: number;
  /** 이미 유물 보정이 적용된 파티. 만드는 쪽은 `game/partyStore` 다. */
  readonly party?: readonly BattleActor[];
  /** 파티원이 쓸 수 있는 스킬. **장착 유물에서 나온다** (ADR-004). */
  readonly partySkills?: Readonly<Record<ActorId, readonly Skill[]>>;
  readonly inventory?: Inventory;
}

/** 유적 입구의 표준 조우. 인카운터 테이블이 이걸 고른다. */
export function ruinEncounter(level: number, options: EncounterOptions = {}): Encounter {
  const mobCount = options.mobCount ?? 2;
  const party = options.party ?? starterParty(level);
  const inventory = options.inventory ?? {
    herb: 3,
    antidote: 1,
    'cleansing-stone': 1,
    'ashen-ember': 1,
  };

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
    level,
    actors,
    profiles,
    // 스킬을 여기서 들려주지 않는다. 능력의 출처는 장착 유물이다 (ADR-004).
    // 넘어오지 않으면 빈 목록 — 유물을 끼우지 않은 파티는 기본 공격만 할 수 있다.
    partySkills: options.partySkills ?? {},
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

/**
 * 인카운터가 **없는 맵도 있다** — 거점이 그렇다. 그래서 `Partial` 이다.
 *
 * 빈 표를 넣어 두는 대신 없는 쪽을 택했다. 빈 표는 "전투가 있는데 편성이 비었다" 로도
 * 읽히지만, 항목이 없는 것은 "여기서는 싸우지 않는다" 로만 읽힌다.
 */
export const ENCOUNTER_TABLES: Readonly<Partial<Record<MapId, readonly EncounterEntry[]>>> = {
  'ruin-entrance': [
    { weight: 6, mobCount: 2 },
    { weight: 3, mobCount: 1 },
    { weight: 1, mobCount: 3 },
  ],

  /**
   * **적 수가 레벨보다 훨씬 세게 먹힌다.**
   *
   * 실측(파티 Lv6, 적 Lv5): 2마리면 전멸 1%, 3마리면 100%. 한 마리 차이가 레벨 두어 개보다
   * 크다 — 파티가 2인뿐이라 행동 수 비율이 그대로 화력 차이가 되기 때문이다.
   *
   * 예전 표는 3~4마리가 중심이었다. 2마리를 중심에 두고 3마리를 가끔 섞는다.
   */
  'ruin-depths': [
    { weight: 6, mobCount: 2 },
    { weight: 3, mobCount: 3 },
    { weight: 1, mobCount: 1 },
  ],
};

/**
 * 걸음 수 범위 (GDD §6.1).
 *
 * 최소 14걸음은 안전하다 — 전투 직후 바로 또 싸우면 탐색이 성립하지 않는다.
 *
 * **8~20 에서 넓혔다.** 유적에는 회복 수단이 없어(거점은 T-040) 전투 간격이 곧 소모 속도다.
 * 실측에서 회복 없이 평균 6판이면 전멸했는데, 8걸음 간격이면 입구 홀을 한 바퀴 도는 사이에
 * 그 6판이 다 벌어진다. 맵이 60x40 인 것을 감안하면 좁았다.
 */
export const ENCOUNTER_STEPS: EncounterTuning = { minSteps: 14, maxSteps: 32 };

/**
 * 지역의 **적** 레벨. 파티 레벨과 무관하다 — 파티는 경험치로 자란다 (`core/progress/level.ts`).
 *
 * **6·9 에서 내렸다.** 파티가 레벨 1에서 시작하게 되면서 기준점이 달라졌다.
 * 입구는 처음 유물을 만지는 곳이므로 조합을 실험할 여유가 있어야 한다.
 */
export const AREA_LEVELS: Readonly<Partial<Record<MapId, number>>> = {
  'ruin-entrance': 3,
  'ruin-depths': 5,
};

/** 그 지역에서 한 번 조우를 뽑는다. */
export function rollEncounter(
  mapId: MapId,
  rng: Rng,
  options: EncounterOptions = {},
): Encounter {
  const table = ENCOUNTER_TABLES[mapId];
  const level = AREA_LEVELS[mapId];
  if (table === undefined || level === undefined) {
    // 안전지대 판정(`core/world/zone.ts`)이 먼저 걸러야 하는 상황이다. 여기까지 왔다면 배선이 틀렸다.
    throw new RangeError(`"${mapId}" 에는 인카운터가 없습니다. 안전지대 판정을 지나쳤습니다.`);
  }

  const entry = pickWeighted(
    table.map((row) => ({ weight: row.weight, value: row })),
    rng,
  );

  return ruinEncounter(level, { ...options, mobCount: entry.mobCount });
}
