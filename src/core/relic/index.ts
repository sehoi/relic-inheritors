/**
 * 유물 (GDD §5, ADR-004).
 *
 * **능력의 출처는 캐릭터가 아니라 유물이다.** 캐릭터 고유 스킬은 1~2개뿐이고,
 * 나머지는 전부 장착한 유물에서 온다. 그래서 "어떤 유물을 누구에게 주느냐" 가 곧 빌드다.
 *
 * 파티 4인 × 슬롯 2개 = 8슬롯. 유물 하나가 늘면 조합 공간이 곱으로 늘어난다 —
 * 이게 루프가 `data/relics.ts` 만 건드려도 게임이 깊어지는 이유이자,
 * 검증 없이 늘리면 안 되는 이유다 (ADR-005, CLAUDE.md 규칙 9).
 */

import type { ActorId, Stats } from '../battle/index.js';
import type { Element } from '../battle/damage.js';
import type { Skill } from '../battle/skill.js';
import { Problems, createDuplicateGuard } from '../validation/index.js';

export type RelicId = string;

/** 공명 조건에 쓰이는 분류 (T-024). 유물 하나가 여러 태그를 가질 수 있다. */
export const RELIC_TAGS = ['ember', 'tide', 'storm', 'stone', 'hollow', 'ward'] as const;
export type RelicTag = (typeof RELIC_TAGS)[number];

export interface Relic {
  readonly id: RelicId;
  readonly name: string;
  /** 1~5. 높을수록 강하고 침식도 크다. */
  readonly tier: number;
  readonly element: Element;
  readonly tags: readonly RelicTag[];
  /** 장착 시 더해지는 스탯. 지정하지 않은 항목은 0. */
  readonly statMods: Readonly<Partial<Stats>>;
  /** 이 유물이 공급하는 액티브 스킬. 능력의 실제 출처다. */
  readonly actives: readonly Skill[];
  /** 스킬 침식량에 곱해지는 계수 (T-026). 1이면 스킬 원래 값 그대로. */
  readonly erosionFactor: number;
  /** 이 유물이 전하는 세계관 파편. 긴 대본 대신 이걸로 서사를 전달한다 (GDD §2). */
  readonly lore: string;
}

/** 캐릭터당 슬롯 수. 파티 4인이면 8슬롯이 된다. */
export const SLOTS_PER_MEMBER = 2;

/** 액터별 슬롯. `null` 은 빈 슬롯이다. */
export type Loadout = Readonly<Record<ActorId, readonly (RelicId | null)[]>>;

export function createLoadout(memberIds: readonly ActorId[]): Loadout {
  const loadout: Record<ActorId, readonly (RelicId | null)[]> = {};
  for (const id of memberIds) {
    loadout[id] = Array.from({ length: SLOTS_PER_MEMBER }, () => null);
  }
  return loadout;
}

export function slotsOf(loadout: Loadout, actorId: ActorId): readonly (RelicId | null)[] {
  const slots = loadout[actorId];
  if (slots === undefined) {
    throw new Error(
      `"${actorId}" 는 장착 슬롯을 갖고 있지 않습니다. 대상: ${Object.keys(loadout).join(', ')}`,
    );
  }
  return slots;
}

export function equippedBy(loadout: Loadout, actorId: ActorId): readonly RelicId[] {
  return slotsOf(loadout, actorId).filter((id): id is RelicId => id !== null);
}

/** 파티 전체가 장착한 유물. 공명 판정(T-024)이 이걸 본다. */
export function allEquipped(loadout: Loadout): readonly RelicId[] {
  return Object.values(loadout)
    .flat()
    .filter((id): id is RelicId => id !== null);
}

export function holderOf(loadout: Loadout, relicId: RelicId): ActorId | undefined {
  return Object.keys(loadout).find((actorId) => slotsOf(loadout, actorId).includes(relicId));
}

/**
 * 장착할 수 없는 이유. 장착 가능하면 `undefined`.
 *
 * 스킬·아이템과 같은 규약이다 — 불리언이 아니라 이유를 돌려준다. UI 가 왜 회색인지 보여줘야 하고,
 * 사유가 필요한 곳이 UI 만은 아니다.
 */
export function equipBlockReason(
  loadout: Loadout,
  actorId: ActorId,
  slot: number,
  relicId: RelicId,
  owned: readonly RelicId[],
): string | undefined {
  const slots = slotsOf(loadout, actorId);

  if (!Number.isInteger(slot) || slot < 0 || slot >= slots.length) {
    return `슬롯 번호가 범위를 벗어났다 (0~${slots.length - 1})`;
  }
  if (!owned.includes(relicId)) return '가지고 있지 않은 유물이다';

  const holder = holderOf(loadout, relicId);
  // 같은 유물을 둘이 나눠 낄 수 없다. 허용하면 유물 하나로 조합 공간을 부풀릴 수 있다.
  if (holder !== undefined && !(holder === actorId && slots[slot] === relicId)) {
    return holder === actorId ? '이미 다른 슬롯에 끼워져 있다' : `${holder}가 이미 지니고 있다`;
  }
  return undefined;
}

export function equip(
  loadout: Loadout,
  actorId: ActorId,
  slot: number,
  relicId: RelicId,
  owned: readonly RelicId[],
): Loadout {
  const blocked = equipBlockReason(loadout, actorId, slot, relicId, owned);
  if (blocked !== undefined) {
    throw new Error(`"${relicId}" 를 장착할 수 없습니다: ${blocked}`);
  }

  const slots = [...slotsOf(loadout, actorId)];
  slots[slot] = relicId;
  return { ...loadout, [actorId]: slots };
}

export function unequip(loadout: Loadout, actorId: ActorId, slot: number): Loadout {
  const slots = [...slotsOf(loadout, actorId)];
  if (!Number.isInteger(slot) || slot < 0 || slot >= slots.length) {
    throw new RangeError(`슬롯 번호가 범위를 벗어났습니다: ${slot}`);
  }
  slots[slot] = null;
  return { ...loadout, [actorId]: slots };
}

/** 합산 중에만 쓰는 쓰기 가능한 형태. `Stats` 는 읽기 전용이라 그대로는 누적할 수 없다. */
type MutableStatMods = { -readonly [K in keyof Stats]?: number };

/** 장착 유물의 스탯 보정을 합산한다. */
export function sumStatMods(relics: readonly Relic[]): Readonly<Partial<Stats>> {
  const total: MutableStatMods = {};
  for (const relic of relics) {
    for (const [key, value] of Object.entries(relic.statMods) as [keyof Stats, number][]) {
      total[key] = (total[key] ?? 0) + value;
    }
  }
  return total;
}

/**
 * 기본 스탯에 유물 보정을 더한다.
 *
 * 음수로 내려가지 않게 막는다 — 대가가 큰 유물이 스탯을 깎을 수 있는데,
 * 방어력이 음수가 되면 데미지 공식(ADR-009)이 이상해진다.
 */
export function applyStatMods(base: Stats, mods: Readonly<Partial<Stats>>): Stats {
  const at = (key: keyof Stats): number => Math.max(0, base[key] + (mods[key] ?? 0));
  return {
    maxHp: Math.max(1, base.maxHp + (mods.maxHp ?? 0)),
    maxMp: at('maxMp'),
    atk: at('atk'),
    def: at('def'),
    mag: at('mag'),
    res: at('res'),
    agi: at('agi'),
    luk: at('luk'),
  };
}

/** 유물이 공급하는 모든 액티브 스킬. 중복 스킬은 한 번만 나온다. */
export function activesOf(relics: readonly Relic[]): readonly Skill[] {
  const seen = new Set<string>();
  return relics.flatMap((relic) =>
    relic.actives.filter((skill) => {
      if (seen.has(skill.id)) return false;
      seen.add(skill.id);
      return true;
    }),
  );
}

export function validateRelic(relic: Relic): void {
  const problems = Problems.create();
  const at = problems.scope(`"${relic.id}"`);

  if (relic.id.trim().length === 0) problems.add('id 가 비어 있습니다.');
  if (relic.name.trim().length === 0) at.add('name 이 비어 있습니다.');
  if (!Number.isInteger(relic.tier) || relic.tier < 1 || relic.tier > 5) {
    at.add(`tier 는 1~5 여야 합니다 (받은 값: ${relic.tier}).`);
  }
  if (relic.tags.length === 0) {
    // 태그가 없으면 어떤 공명에도 기여하지 못한다 — 조합 설계에서 빠지는 유물이 된다.
    at.add('tags 가 비어 있습니다. 공명에 기여하지 못하는 유물이 됩니다.');
  }
  if (relic.actives.length === 0) at.add('actives 가 비어 있습니다. 능력의 출처가 유물입니다 (ADR-004).');
  if (relic.erosionFactor <= 0) at.add(`erosionFactor 는 양수여야 합니다 (받은 값: ${relic.erosionFactor}).`);
  if (relic.lore.trim().length === 0) at.add('lore 가 비어 있습니다. 유물이 곧 서사 단위입니다 (GDD §2).');

  const guard = createDuplicateGuard('액티브 스킬', at);
  for (const skill of relic.actives) guard(skill.id);

  problems.throwIfAny('유물');
}
