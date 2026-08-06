/**
 * 세이브 스키마와 마이그레이션 (GDD §6.5, ADR-001, CLAUDE.md 규칙 7).
 *
 * **세이브는 되돌리기가 가장 비싼 자료 구조다.** 코드는 다시 짜면 되지만 남의 세이브 파일은
 * 다시 만들 수 없다. 그래서 스키마를 늘리기 전에 **올려주는 길**부터 만들어 둔다.
 *
 * 이 모듈은 저장 위치를 모른다. localStorage 든 파일이든 게임 레이어가 정한다 (ADR-001) —
 * 여기서는 "무엇이 유효한 세이브인가" 와 "옛 세이브를 어떻게 올리는가" 만 답한다.
 *
 * 시계도 모른다. `savedAt` 은 넘겨받는다 — core 가 `Date.now()` 를 부르면 테스트가
 * 재현 불가능해지고, 그건 이 프로젝트에서 가장 비싼 종류의 문제다 (ADR-002).
 */

import type { Ailment } from '../battle/status.js';
import { AILMENTS } from '../battle/status.js';
import type { Inventory } from '../battle/item.js';
import type { Direction } from '../world/movement.js';
import { DIRECTIONS } from '../world/movement.js';
import type { Attunement } from '../relic/attunement.js';
import type { Loadout, RelicId } from '../relic/index.js';
import {
  Problems,
  isRecord,
  readArray,
  readInt,
  readOneOf,
  readRecord,
  readText,
} from '../validation/index.js';

/**
 * 지금 쓰는 스키마 버전.
 *
 * **올릴 때는 `MIGRATIONS` 에 이전 버전에서 올라오는 길을 함께 넣는다.** 길이 없으면
 * `migrateSave` 가 어느 구간이 비었는지 이름을 대며 거부한다 — 조용히 통과시키면
 * 필드가 `undefined` 인 채로 게임이 돌아가다 한참 뒤에 이상해진다.
 */
export const SAVE_VERSION = 5;

export interface SavedAilment {
  readonly kind: Ailment;
  readonly turns: number;
}

/** 전투 밖으로 이어지는 값. 스탯은 저장하지 않는다 — 유물 보정이 겹쳐 쌓인다. */
export interface SavedVitals {
  readonly hp: number;
  readonly mp: number;
  readonly erosion: number;
  readonly ailments: readonly SavedAilment[];
}

export interface SavedLocation {
  readonly mapId: string;
  readonly x: number;
  readonly y: number;
  readonly facing: Direction;
}

export interface SaveData {
  readonly version: number;
  /** 저장 시각(epoch ms). 게임 레이어가 넣는다 — core 는 시계를 모른다. */
  readonly savedAt: number;
  readonly playtimeMs: number;
  readonly location: SavedLocation;
  readonly party: Readonly<Record<string, SavedVitals>>;
  readonly owned: readonly RelicId[];
  readonly loadout: Loadout;
  /** 유물별 누적 숙련도. **착용자가 아니라 유물에 귀속된다** (GDD §5.3). */
  readonly attunement: Attunement;
  readonly inventory: Inventory;
  /**
   * 월드 난수의 상태.
   *
   * 시드가 아니라 **상태**를 저장한다. 시드만 저장하면 불러온 뒤 인카운터 수열이 처음부터
   * 다시 시작해, 같은 자리에서 저장·로드를 반복하는 것으로 조우를 조작할 수 있다 (ADR-002).
   */
  readonly worldRngState: number;
  /**
   * 이미 주운 회수 지점 (v2, T-039).
   *
   * 이게 없으면 불러올 때마다 유물이 다시 놓여 있어, 저장·로드 반복이 유물 무한 획득이 된다.
   */
  readonly collectedSites: readonly string[];
  /**
   * 파티 누적 경험치 (v3, T-044).
   *
   * **레벨은 저장하지 않는다.** 경험치에서 파생시킨다 — 둘 다 저장하면 언젠가 어긋나고,
   * 어긋난 세이브는 어느 쪽이 옳은지 알 수 없다.
   */
  readonly exp: number;
  /** 은편 (v4, T-041a). */
  readonly coins: number;
  /**
   * 함께인 구성원 (v5, T-049b).
   *
   * 비어 있으면 처음 인원으로 본다 — 옛 세이브에는 이 개념이 없었다.
   */
  readonly joined: readonly string[];
}

// ── 마이그레이션 ──────────────────────────────────────────────────────────

/** 버전 N 짜리 자료를 N+1 로 올린다. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * 출발 버전 → 올려주는 함수.
 *
 * **비어 있지 않게 하는 것이 규칙이다** (CLAUDE.md 규칙 7). `SAVE_VERSION` 을 올리면
 * 여기에 그 단계를 함께 넣는다 — 없으면 `migrateSave` 가 어느 구간이 비었는지 이름을 대며 거부한다.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /**
   * v1 → v2 · 회수 지점 (T-039).
   *
   * v1 세이브에는 회수 지점이라는 개념이 없었다. **빈 목록으로 채운다** —
   * "아무것도 줍지 않았다" 로 보면 옛 세이브의 플레이어가 유물을 다시 주울 수 있게 되는데,
   * 그건 손해가 아니라 이득이라 안전한 쪽이다. 반대로 "전부 주웠다" 로 보면
   * 아직 못 가본 층의 유물을 영영 잃는다.
   */
  1: (data) => ({ ...data, collectedSites: [] }),

  /**
   * v2 → v3 · 레벨과 경험치 (T-044).
   *
   * v2 세이브의 파티는 지역 레벨(6)에 고정돼 있었다. 경험치 0으로 올리면 **레벨 1로 떨어진다** —
   * 세지던 파티가 갑자기 약해지는 셈이라, 그전에 도달해 있던 만큼을 쳐준다.
   *
   * 정확한 환산은 불가능하다(그때는 경험치라는 개념이 없었다). 넉넉한 쪽으로 준다 —
   * 덜 주면 옛 세이브가 못 이기는 전투에 갇히지만, 더 주는 것은 앞당겨질 뿐이다.
   */
  2: (data) => ({ ...data, exp: LEGACY_EXP }),

  /**
   * v3 → v4 · 은편 (T-041a).
   *
   * 그전에는 통화가 없었으므로 **0으로 시작한다.** 여기서 넉넉히 주고 싶은 유혹이 있지만,
   * 은편은 전투로 벌면 되는 것이라 없다고 해서 막다른 길이 되지 않는다.
   * (경험치는 달랐다 — 레벨이 떨어지면 못 이기는 전투에 갇힌다.)
   */
  3: (data) => ({ ...data, coins: 0 }),

  /**
   * v4 → v5 · 파티 구성원 (T-049b).
   *
   * 그전에는 인원이 고정이었다. **`party` 에 이미 누가 있는지를 그대로 쓴다** —
   * 빈 목록으로 두면 복원할 때 처음 인원으로 되돌아가, 이미 만난 동료가 사라진다.
   * 마이그레이션은 있는 정보를 버리지 않는 쪽을 고른다.
   */
  4: (data) => ({
    ...data,
    joined: isRecord(data['party']) ? Object.keys(data['party']) : [],
  }),
};

/**
 * v2 이전 세이브에 쳐주는 경험치.
 *
 * 그 시절 파티는 항상 지역 레벨 6이었다. 레벨 6에 해당하는 누적치를 준다 —
 * `data/` 의 곡선을 core 가 알 수 없으므로 값을 여기 박아둔다. 곡선이 바뀌어도
 * **옛 세이브가 받는 양은 바뀌지 않아야 한다** — 마이그레이션은 과거를 다루는 코드이고,
 * 과거는 나중에 바뀐 설정을 모른다.
 */
const LEGACY_EXP = 1_100;

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

function readVersion(raw: unknown): { data: Record<string, unknown>; version: number } {
  if (!isRecord(raw)) {
    throw new SaveError('세이브 최상위는 객체여야 합니다.');
  }
  const version = raw['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SaveError(`version 이 1 이상의 정수가 아닙니다 (받은 값: ${String(version)}).`);
  }
  return { data: raw, version };
}

/**
 * 옛 세이브를 현재 버전까지 한 단계씩 올린다.
 *
 * **미래 버전은 거부한다.** 최신 빌드에서 저장한 파일을 옛 빌드가 열면 모르는 필드를
 * 조용히 버리게 되고, 그 상태로 다시 저장하면 데이터가 사라진다. 여는 것을 막는 편이 싸다.
 */
export function migrateSave(
  raw: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  target: number = SAVE_VERSION,
): Record<string, unknown> {
  const { data, version } = readVersion(raw);

  if (version > target) {
    throw new SaveError(
      `이 세이브는 더 새로운 버전입니다 (세이브 v${version}, 지금 v${target}). ` +
        `최신 빌드에서 열어야 데이터가 보존됩니다.`,
    );
  }

  let current = data;
  for (let from = version; from < target; from += 1) {
    const step = migrations[from];
    if (step === undefined) {
      throw new SaveError(
        `v${from} → v${from + 1} 마이그레이션이 없습니다. ` +
          `SAVE_VERSION 을 올렸다면 MIGRATIONS 에 그 단계를 함께 넣으세요 (CLAUDE.md 규칙 7).`,
      );
    }
    current = { ...step(current), version: from + 1 };
  }

  return current;
}

// ── 검증 ──────────────────────────────────────────────────────────────────

function readVitals(raw: unknown, problems: Problems): SavedVitals | undefined {
  const record = readRecord(raw, '값', problems);
  if (record === undefined) return undefined;

  const hp = readInt(record['hp'], 'hp', problems, { min: 0 });
  const mp = readInt(record['mp'], 'mp', problems, { min: 0 });
  const erosion = readInt(record['erosion'], 'erosion', problems, { min: 0 });
  const rawAilments = readArray(record['ailments'], 'ailments', problems);
  if (hp === undefined || mp === undefined || erosion === undefined || rawAilments === undefined) {
    return undefined;
  }

  const ailments: SavedAilment[] = [];
  rawAilments.forEach((entry, position) => {
    const at = problems.scope(`ailments[${position}]`);
    const record2 = readRecord(entry, '항목', at);
    if (record2 === undefined) return;

    const kind = readOneOf(record2['kind'], 'kind', AILMENTS, at);
    const turns = readInt(record2['turns'], 'turns', at, { min: 1 });
    if (kind === undefined || turns === undefined) return;
    ailments.push({ kind, turns });
  });

  return { hp, mp, erosion, ailments };
}

function readLocation(raw: unknown, problems: Problems): SavedLocation | undefined {
  const at = problems.scope('location');
  const record = readRecord(raw, 'location', problems);
  if (record === undefined) return undefined;

  const mapId = readText(record['mapId'], 'mapId', at);
  const x = readInt(record['x'], 'x', at, { min: 0 });
  const y = readInt(record['y'], 'y', at, { min: 0 });
  const facing = readOneOf(record['facing'], 'facing', DIRECTIONS, at);

  if (mapId === undefined || x === undefined || y === undefined || facing === undefined) {
    return undefined;
  }
  return { mapId, x, y, facing };
}

/** 세이브 하나를 검증해 `SaveData` 로 만든다. 옛 버전이면 먼저 올린다. */
export function parseSave(
  raw: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): SaveData {
  const data = migrateSave(raw, migrations);
  const problems = Problems.create();

  const savedAt = readInt(data['savedAt'], 'savedAt', problems, { min: 0 });
  const playtimeMs = readInt(data['playtimeMs'], 'playtimeMs', problems, { min: 0 });
  const worldRngState = readInt(data['worldRngState'], 'worldRngState', problems, { min: 0 });
  const location = readLocation(data['location'], problems);

  const party: Record<string, SavedVitals> = {};
  const partyRaw = readRecord(data['party'], 'party', problems);
  if (partyRaw !== undefined) {
    for (const [actorId, value] of Object.entries(partyRaw)) {
      const vitals = readVitals(value, problems.scope(`party.${actorId}`));
      if (vitals !== undefined) party[actorId] = vitals;
    }
    if (Object.keys(partyRaw).length === 0) {
      problems.add('party 가 비어 있습니다. 아무도 없는 세이브는 불러올 수 없습니다.');
    }
  }

  const owned: RelicId[] = [];
  const ownedRaw = readArray(data['owned'], 'owned', problems);
  if (ownedRaw !== undefined) {
    ownedRaw.forEach((entry, position) => {
      const id = readText(entry, `owned[${position}]`, problems);
      if (id !== undefined) owned.push(id);
    });
    if (new Set(owned).size !== owned.length) {
      problems.add('owned 에 같은 유물이 두 번 들어 있습니다.');
    }
  }

  const loadout: Record<string, (RelicId | null)[]> = {};
  const loadoutRaw = readRecord(data['loadout'], 'loadout', problems);
  if (loadoutRaw !== undefined) {
    for (const [actorId, slotsRaw] of Object.entries(loadoutRaw)) {
      const at = problems.scope(`loadout.${actorId}`);
      const slots = readArray(slotsRaw, '슬롯', at);
      if (slots === undefined) continue;

      loadout[actorId] = slots.map((slot, position) => {
        if (slot === null) return null;
        if (typeof slot === 'string' && slot.length > 0) return slot;
        at.add(`슬롯 ${position} 은 유물 id 이거나 null 이어야 합니다.`);
        return null;
      });
    }
  }

  const attunement: Record<string, number> = {};
  const attunementRaw = readRecord(data['attunement'], 'attunement', problems);
  if (attunementRaw !== undefined) {
    for (const [relicId, value] of Object.entries(attunementRaw)) {
      const amount = readInt(value, `attunement.${relicId}`, problems, { min: 0 });
      if (amount !== undefined) attunement[relicId] = amount;
    }
  }

  const exp = readInt(data['exp'], 'exp', problems, { min: 0 });
  const coins = readInt(data['coins'], 'coins', problems, { min: 0 });

  const joined: string[] = [];
  const joinedRaw = readArray(data['joined'], 'joined', problems);
  if (joinedRaw !== undefined) {
    joinedRaw.forEach((entry, position) => {
      const id = readText(entry, `joined[${position}]`, problems);
      if (id !== undefined) joined.push(id);
    });
  }

  const collectedSites: string[] = [];
  const collectedRaw = readArray(data['collectedSites'], 'collectedSites', problems);
  if (collectedRaw !== undefined) {
    collectedRaw.forEach((entry, position) => {
      const id = readText(entry, `collectedSites[${position}]`, problems);
      if (id !== undefined) collectedSites.push(id);
    });
  }

  const inventory: Record<string, number> = {};
  const inventoryRaw = readRecord(data['inventory'], 'inventory', problems);
  if (inventoryRaw !== undefined) {
    for (const [itemId, value] of Object.entries(inventoryRaw)) {
      const count = readInt(value, `inventory.${itemId}`, problems, { min: 0 });
      if (count !== undefined) inventory[itemId] = count;
    }
  }

  problems.throwIfAny('세이브');

  return {
    version: SAVE_VERSION,
    savedAt: savedAt as number,
    playtimeMs: playtimeMs as number,
    location: location as SavedLocation,
    party,
    owned,
    loadout,
    attunement,
    inventory,
    worldRngState: worldRngState as number,
    collectedSites,
    exp: exp as number,
    coins: coins as number,
    joined,
  };
}

// ── 교차 참조 ─────────────────────────────────────────────────────────────

export interface KnownIds {
  readonly relics: readonly string[];
  readonly maps: readonly string[];
  readonly items: readonly string[];
  /**
   * 지금 존재하는 회수 지점 id. 생략하면 검사하지 않는다.
   *
   * 옛 세이브가 지워진 회수 지점을 기억하고 있어도 **해롭지 않다** — 없는 지점은 그냥
   * 발동하지 않는다. 그래서 선택 항목이다. 나머지 참조는 없으면 화면이 터지지만 이건 아니다.
   */
  readonly sites?: readonly string[];
}

/**
 * 세이브가 **지금 존재하는 것들**을 가리키는지 확인한다.
 *
 * 구조 검증과 나눠 둔 이유는 core 가 `data/` 를 모르기 때문이다 (ADR-001) —
 * 무엇이 존재하는지는 호출부가 알려준다.
 *
 * 콘텐츠를 지우면 옛 세이브가 없는 유물을 가리키게 된다. 그때 조용히 넘어가면
 * 장착 화면에서 터지는데, 원인이 세이브라는 것을 알아채기 어렵다.
 */
export function validateSaveReferences(save: SaveData, known: KnownIds): void {
  const problems = Problems.create();
  const relics = new Set(known.relics);

  if (!known.maps.includes(save.location.mapId)) {
    problems.add(`없는 맵을 가리킵니다: "${save.location.mapId}"`);
  }

  for (const relicId of save.owned) {
    if (!relics.has(relicId)) problems.add(`없는 유물을 지니고 있습니다: "${relicId}"`);
  }

  for (const [actorId, slots] of Object.entries(save.loadout)) {
    for (const slot of slots) {
      if (slot === null) continue;
      if (!relics.has(slot)) {
        problems.add(`${actorId} 가 없는 유물을 끼고 있습니다: "${slot}"`);
      } else if (!save.owned.includes(slot)) {
        // 지니지 않은 유물을 끼고 있으면 장착 화면이 그것을 목록에서 찾지 못한다.
        problems.add(`${actorId} 가 지니지 않은 유물을 끼고 있습니다: "${slot}"`);
      }
    }
  }

  for (const relicId of Object.keys(save.attunement)) {
    if (!relics.has(relicId)) problems.add(`없는 유물의 숙련도가 있습니다: "${relicId}"`);
  }

  const items = new Set(known.items);
  for (const itemId of Object.keys(save.inventory)) {
    if (!items.has(itemId)) problems.add(`없는 아이템을 지니고 있습니다: "${itemId}"`);
  }

  problems.throwIfAny('세이브 참조');
}
