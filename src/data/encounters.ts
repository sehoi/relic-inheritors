import type { AiProfile } from '../core/battle/ai.js';
import type { ActorId, BattleActor, Stats } from '../core/battle/index.js';
import { ROSTER, type PartyMemberTemplate } from './party.js';
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
  /**
   * 적의 겉모습. 생략하면 id 에서 잡몹 종류를 읽는다 (`mobTile`).
   *
   * **보스는 id 규칙이 다르다.** `sanctum-warden` 을 `-` 로 잘라 잡몹 종류를 찾으면
   * 없는 종류라 기본값(유령)이 나온다 — 실제로 그렇게 나왔다. 조우가 겉모습을
   * 직접 들고 다니면 id 를 파싱하는 규칙에 기대지 않아도 된다.
   */
  readonly enemyTiles?: Readonly<Record<ActorId, number>>;
}

/**
 * 파티를 만든다. **인원과 역할은 `data/party.ts` 가 정한다** — 여기 적어두면
 * 시뮬레이터와 게임이 서로 다른 편성을 쓰게 된다 (실제로 그랬다).
 */
export function starterParty(
  level: number,
  members: readonly PartyMemberTemplate[] = ROSTER,
): BattleActor[] {
  const base = statsAtLevel(PARTY_CURVES, level);

  return members.map((member) => {
    const stats = { ...base };
    for (const [key, scale] of Object.entries(member.statScale ?? {}) as [keyof Stats, number][]) {
      stats[key] = Math.round(base[key] * scale);
    }
    return makeCombatant(member.id, 'party', stats, { name: member.name });
  });
}

/**
 * 잡몹 (GDD §8 — 6종, T-050).
 *
 * **세 축을 함께 움직인다.** 속성 약점만 다르면 적이 여섯이어도 싸움은 하나다.
 *
 * 1. **속성** — 무엇으로 때려야 잘 드는가. 조합을 바꿀 이유가 된다
 * 2. **스탯 배율** — 단단한가 빠른가. 같은 레벨이어도 체감이 다르다
 * 3. **AI** — 무엇을 하는 놈인가 (`data/ai.ts`). 이게 없으면 앞의 둘은 숫자놀음이다
 *
 * 배율의 합은 대체로 1 근처로 맞춘다 — 한 축을 올리면 다른 축을 내린다.
 * 그러지 않으면 "그냥 센 놈" 이 되어 난이도가 종류 수만큼 곱해진다.
 */
const MOB_TEMPLATES = {
  /** 기준이 되는 놈. 다른 다섯을 여기에 견줘 읽는다. */
  remnant: {
    name: '각인 잔재',
    tile: 108,
    affinity: { thunder: 1.5, earth: 0.5 },
    ai: 'brute',
    statScale: {},
  },

  warden: {
    name: '무너진 파수꾼',
    tile: 122,
    affinity: { fire: 1.4 },
    ai: 'brute',
    statScale: { maxHp: 1.15, agi: 0.9 },
  },

  /** 독을 묻힌다. 얇은 대신 오래 끌면 손해가 쌓인다. */
  creeper: {
    name: '스며든 것',
    tile: 109,
    affinity: { fire: 1.5, water: 0.6 },
    ai: 'tainter',
    statScale: { maxHp: 0.9, mag: 1.2, def: 0.9 },
  },

  /** 벽. 혼자면 지루하고 둘이면 시간이 없다 — 표에서 비중을 낮게 준다. */
  husk: {
    name: '마른 껍데기',
    tile: 110,
    affinity: { water: 1.5, thunder: 0.7 },
    ai: 'bulwark',
    statScale: { maxHp: 1.4, def: 1.35, atk: 0.85, agi: 0.7 },
  },

  /**
   * 빠르고 약한 쪽만 노린다. 얇아서 먼저 잡을 수 있고, 두면 한 사람이 무너진다.
   *
   * **화력은 낮게 잡는다.** 이 놈의 위협은 "빨리 잡아야 한다" 이지 "많이 아프다" 가
   * 아니다. 처음 잡은 `atk 1.1` 로는 시작 지역 전멸률이 0% → 5% 로 올랐는데,
   * 파티가 둘뿐인 구간에서 한 사람에게 피해가 몰리면 그대로 무너지기 때문이다.
   * 집중 공격이라는 성격은 그대로 두고 한 대의 무게만 덜었다.
   */
  wisp: {
    name: '떠도는 불씨',
    // 111 은 사람 얼굴이었다. 시트에서 번호만 보고 고르면 이런 일이 나고,
    // 화면을 보기 전에는 테스트가 전부 초록이다 (`?mobs=all`).
    tile: 120,
    affinity: { earth: 1.5, fire: 0.5 },
    ai: 'stalker',
    statScale: { maxHp: 0.65, agi: 1.5, atk: 0.9, def: 0.8 },
  },

  /** 막지 않고 세게 친다. 침묵을 걸어오므로 유물 게임을 직접 막는다. */
  maw: {
    name: '삼키는 입',
    tile: 123,
    affinity: { earth: 1.4, thunder: 0.7 },
    ai: 'ravager',
    statScale: { maxHp: 1.1, atk: 1.3, def: 0.85, res: 0.9 },
  },
} as const;

export type MobKind = keyof typeof MOB_TEMPLATES;

export const MOB_KINDS = Object.keys(MOB_TEMPLATES) as readonly MobKind[];

export function ruinMob(kind: MobKind, index: number, level: number): BattleActor {
  const template = MOB_TEMPLATES[kind];
  const base = statsAtLevel(MOB_CURVES, level);
  const stats = { ...base };
  for (const [key, scale] of Object.entries(template.statScale) as [keyof Stats, number][]) {
    stats[key] = Math.round(base[key] * scale);
  }

  return makeCombatant(`${kind}-${index}`, 'enemy', stats, {
    name: template.name,
    affinity: template.affinity,
  });
}

/** 그 잡몹이 쓰는 AI. 종류마다 무엇을 하는 놈인지가 다르다 (`data/ai.ts`). */
export function mobProfile(actorId: ActorId): AiProfile {
  const kind = actorId.split('-')[0] as MobKind;
  return aiProfile(MOB_TEMPLATES[kind]?.ai ?? 'brute');
}

/** 적 스프라이트의 타일 번호. 화면 표현이라 데이터에 함께 둔다. */
export function mobTile(actorId: ActorId): number {
  const kind = actorId.split('-')[0] as MobKind;
  return MOB_TEMPLATES[kind]?.tile ?? 108;
}

export interface EncounterOptions {
  readonly mobCount?: number;
  /** 나올 잡몹의 종류. 지역이 정한다 (`AREA_MOBS`). 생략하면 기본 둘을 번갈아 쓴다. */
  readonly kinds?: readonly MobKind[];
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

  const kinds = options.kinds ?? Array.from({ length: mobCount }, (_, i) =>
    i % 2 === 0 ? ('remnant' as const) : ('warden' as const),
  );
  const mobs = kinds.slice(0, mobCount).map((kind, i) => ruinMob(kind, i + 1, level));

  const actors = [...party, ...mobs];
  const profiles: Record<ActorId, AiProfile> = {};
  for (const actor of actors) {
    // 파티는 사람이 조작하지만, 프로필을 채워두면 시뮬레이터와 자동 진행이 같은 편성을 쓴다.
    // **적은 종류마다 다른 AI 를 쓴다** — 속성만 다르고 행동이 같으면 여섯이어도 싸움은 하나다.
    profiles[actor.id] = actor.side === 'party' ? aiProfile('striker') : mobProfile(actor.id);
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
   * 실측(파티 2인 Lv6, 적 Lv5): 2마리면 전멸 1%, 3마리면 100%. 한 마리 차이가 레벨 두어 개보다
   * 크다 — 행동 수 비율이 그대로 화력 차이가 되기 때문이다.
   *
   * **그래서 이 표는 파티 인원에 매여 있고, 인원은 이제 고정이 아니다** (T-049b —
   * 2인으로 시작해 4인이 된다). 파수가 합류해 지하를 3인으로 돌게 되자 예전 난이도가
   * 통째로 사라져서 다시 잡았다.
   *
   * **적 수가 아니라 적 레벨로 올렸다** (`AREA_LEVELS` 참조). 마릿수를 3~4로 올리면
   * 소모로 지는 게 아니라 **한 판에 몰살당한다** — 실측에서 3마리 중심은 맨몸 25% /
   * 쉬며 28% 로 거점이 아무 값도 하지 못했다. 마릿수는 단차를 만드는 대신 벽을 만든다.
   */
  'ruin-depths': [
    { weight: 6, mobCount: 2 },
    { weight: 3, mobCount: 3 },
    { weight: 1, mobCount: 1 },
  ],

  /**
   * 지하 2층 (T-052).
   *
   * 마릿수는 1층과 같게 두고 **적 레벨로만 올린다.** 마릿수는 난이도 손잡이가 아니라
   * 벽 스위치라는 것을 T-049b 에서 실측했다 — 한 마리 늘리면 소모로 지는 게 아니라
   * 한 판에 몰살당한다.
   */
  'ruin-sanctum': [
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
 * **입구는 6 에서 3 으로 내렸다.** 파티가 레벨 1에서 시작하게 되면서 기준점이 달라졌다.
 * 입구는 처음 유물을 만지는 곳이므로 조합을 실험할 여유가 있어야 한다.
 *
 * **지하는 5 에서 7 로 올렸다** (T-049b → T-049c). 파수가 합류해 지하를 3인으로 돌게 되자
 * 5 는 전멸률 0% 가 되어 층 사이의 단차가 사라졌다.
 *
 * T-049b 에서 잠깐 8 이었다. 그때는 레벨업이 완전 회복이라 소모전이 없었고, 그 상태에서
 * 위험을 만들려면 **한 판에 죽을 만큼** 올려야 했다. T-049c 에서 회복이 일부로 바뀌어
 * 소모가 실제로 쌓이게 되자 8 은 과했다 (맨몸 95%, 자고 나와도 20%).
 *
 * 실측(3인, 15판 연속, 전멸률 — 맨몸 Lv6 / 5판마다 자며 Lv6 / 성장 Lv8):
 *
 * ```
 * 적Lv    맨몸    자며    성장
 *   6       0%      0%      0%   ← 단차 없음
 *   7      65%      0%      0%   ← 여기
 *   8      95%     20%      5%   ← 자고 와도 안 되면 거점이 답이 아니다
 *   9     100%     65%     68%
 * ```
 *
 * **거점이 답이 되는 구간을 고른다.** 맨몸으로 위험한 것만으로는 부족하다 —
 * 자고 나온 파티가 넘어갈 수 있어야 "돌아갈까" 가 선택지가 된다.
 */
export const AREA_LEVELS: Readonly<Partial<Record<MapId, number>>> = {
  'ruin-entrance': 3,
  'ruin-depths': 7,
  // 지하 2층. 한 층 내려올 때마다 벌어지는 간격(3 → 7)보다 좁게 잡는다 —
  // 1층에서 2층은 층 하나지만 입구에서 1층은 "유적 밖에서 안" 이라 성격이 다르다.
  'ruin-sanctum': 10,
};

/**
 * 지역별로 나오는 잡몹 (T-050).
 *
 * **층이 깊어지면 종류가 바뀐다.** 같은 여섯이 어디서나 나오면 내려간 보람이 없고,
 * 아래층 적이 위층에도 나오면 위층의 난이도가 아래층에 끌려간다.
 *
 * 가중치를 두지 않고 목록으로만 둔다 — 마릿수는 `ENCOUNTER_TABLES` 가 정하고
 * 여기는 **무엇이 나오는가**만 답한다. 한 조우 안에서 종류가 섞이는 것이 자연스럽다.
 *
 * `husk`(벽)를 입구에 두지 않는다. 전투가 길어지는 것은 난이도가 아니라 지루함이고,
 * 처음 조작을 배우는 곳에서 그건 특히 나쁘다.
 */
export const AREA_MOBS: Readonly<Partial<Record<MapId, readonly MobKind[]>>> = {
  'ruin-entrance': ['remnant', 'warden', 'wisp'],
  'ruin-depths': ['creeper', 'husk', 'maw', 'remnant'],
  // 2층은 종류를 새로 들이지 않는다. 여섯이 전부 어딘가에 나오고 있으므로 여기서
  // 더 늘리면 **레벨과 종류가 같이 뛰어** 무엇이 어려워졌는지 알 수 없게 된다.
  'ruin-sanctum': ['creeper', 'husk', 'maw', 'wisp'],
};

/** 그 지역에서 한 번 조우를 뽑는다. */
export function rollEncounter(
  mapId: MapId,
  rng: Rng,
  options: EncounterOptions = {},
): Encounter {
  const table = ENCOUNTER_TABLES[mapId];
  const level = AREA_LEVELS[mapId];
  const pool = AREA_MOBS[mapId];
  if (table === undefined || level === undefined || pool === undefined) {
    // 안전지대 판정(`core/world/zone.ts`)이 먼저 걸러야 하는 상황이다. 여기까지 왔다면 배선이 틀렸다.
    throw new RangeError(`"${mapId}" 에는 인카운터가 없습니다. 안전지대 판정을 지나쳤습니다.`);
  }

  const entry = pickWeighted(
    table.map((row) => ({ weight: row.weight, value: row })),
    rng,
  );

  // 종류를 한 마리씩 따로 뽑는다. 조우마다 한 종류로 채우면 "이번엔 벽만 셋" 같은
  // 극단이 나오는데, 그건 다양성이 아니라 운이다.
  const kinds = Array.from({ length: entry.mobCount }, () =>
    pickWeighted(
      pool.map((kind) => ({ weight: 1, value: kind })),
      rng,
    ),
  );

  return ruinEncounter(level, { ...options, mobCount: entry.mobCount, kinds });
}
