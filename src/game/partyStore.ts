import type { ActorId, BattleActor } from '../core/battle/index.js';
import type { Inventory } from '../core/battle/item.js';
import type { Skill } from '../core/battle/skill.js';
import type { AilmentState } from '../core/battle/status.js';
import { createRng, type Rng } from '../core/rng/index.js';
import {
  activesOf,
  allEquipped,
  applyStatMods,
  createLoadout,
  equip,
  equippedBy,
  sumStatMods,
  type Loadout,
} from '../core/relic/index.js';
import {
  activeResonances,
  resonanceErosionRelief,
  resonanceStatMods,
  type Resonance,
} from '../core/relic/resonance.js';
import { ALL_RESONANCES } from '../data/resonances.js';
import { AREA_LEVELS, starterParty } from '../data/encounters.js';
import { STARTING_MAP } from '../data/maps.js';
import {
  gainAll,
  rankOfRelic,
  type Attunement,
} from '../core/relic/attunement.js';
import { ATTUNEMENT, STARTING_RELICS, relic } from '../data/relics.js';

/**
 * 전투 밖에서도 이어지는 파티 상태.
 *
 * HP·MP·침식은 전투가 끝나도 남는다 (GDD §5.4). 씬은 오갈 때마다 새로 만들어지므로
 * 상태를 어딘가에 두어야 하는데, **세이브(M4)가 생기기 전까지는 메모리에 둔다.**
 * 새로고침하면 초기화된다 — 그건 세이브가 할 일이지 이 모듈이 할 일이 아니다.
 *
 * **기본 스탯과 유물 보정을 분리해 보관한다.** 보정이 적용된 스탯을 저장하면
 * 전투를 치를 때마다 보정이 겹쳐 쌓인다. 저장하는 것은 "지금 얼마나 다쳤는가" 뿐이다.
 */

const INITIAL_INVENTORY: Inventory = {
  herb: 3,
  antidote: 1,
  'clear-bell': 1,
  'cleansing-stone': 1,
  'ashen-ember': 1,
};

/** 전투 사이에 이어지는 값. 스탯은 매번 기본값 + 유물 보정으로 다시 계산한다. */
interface Vitals {
  readonly hp: number;
  readonly mp: number;
  readonly erosion: number;
  readonly ailments: readonly AilmentState[];
}

const WORLD_SEED = 20_260_805;

let vitals: Readonly<Record<ActorId, Vitals>> | undefined;
/** 유물별 누적 숙련도. **유물에 귀속되므로 착용자를 바꿔도 유지된다** (GDD §5.3). */
let attunement: Attunement = {};
let inventory: Inventory = INITIAL_INVENTORY;
let loadout: Loadout | undefined;
let worldRng: Rng | undefined;

/**
 * 월드 난수. 인카운터 발생과 조우 구성이 여기서 나온다.
 * `Math.random()` 을 쓰지 않는다 (ADR-002) — 세션 시작부터의 수열이 고정이라 재현할 수 있다.
 */
export function worldRandom(): Rng {
  worldRng ??= createRng(WORLD_SEED);
  return worldRng;
}

/** 보정이 붙지 않은 파티. 스탯 계산의 기준점이다. */
function basePartyMembers(): readonly BattleActor[] {
  return starterParty(AREA_LEVELS[STARTING_MAP]);
}

export function ownedRelics(): readonly string[] {
  return STARTING_RELICS;
}

/**
 * 파티 구성원. 장착 화면(T-029)이 누구에게 슬롯이 있는지 알아야 한다.
 *
 * 보정이 붙지 않은 형태를 돌려준다 — 슬롯 주인을 묻는 자리에 계산된 스탯은 필요 없고,
 * 필요해지는 순간 `partyForBattle()` 이 있다.
 */
export function partyMembers(): readonly BattleActor[] {
  return basePartyMembers();
}

/**
 * 처음에는 가진 유물을 **한 명씩 돌아가며** 나눠 준다. 장착 UI 는 T-029.
 *
 * 한 사람에게 몰아주지 않는 이유는, 유물이 능력의 출처라서(ADR-004) 몰아주면
 * 나머지가 기본 공격만 하는 허수아비가 되기 때문이다.
 */
function defaultLoadout(): Loadout {
  const members = basePartyMembers();
  let next = createLoadout(members.map((member) => member.id));

  ownedRelics().forEach((relicId, index) => {
    const member = members[index % members.length];
    const slot = Math.floor(index / members.length);
    if (member === undefined || slot >= 2) return;
    next = equip(next, member.id, slot, relicId, ownedRelics());
  });

  return next;
}

export function getLoadout(): Loadout {
  loadout ??= defaultLoadout();
  return loadout;
}

export function setLoadout(next: Loadout): void {
  loadout = next;
}

/**
 * 전투에 내보낼 파티.
 *
 * 기본 스탯에 **장착 유물의 보정을 얹어** 만든다 (ADR-004). 이어받은 HP·MP 는
 * 새 최대치를 넘지 않게 자른다 — 유물을 빼면 최대 HP 가 줄어들 수 있다.
 */
/** 지금 발동 중인 공명. 장착 화면(T-029)과 전투가 같은 판정을 쓴다. */
export function currentResonances(): readonly Resonance[] {
  const equipped = allEquipped(getLoadout()).map((id) => relic(id));
  return activeResonances(ALL_RESONANCES, equipped);
}

export function partyForBattle(): BattleActor[] {
  const current = getLoadout();
  // 공명은 파티 **전원**에게 같은 값으로 붙는다 (GDD §5.2).
  const shared = resonanceStatMods(currentResonances());

  return basePartyMembers().map((member) => {
    const relics = equippedBy(current, member.id).map((id) => relic(id));
    const stats = applyStatMods(
      applyStatMods(member.stats, sumStatMods(relics)),
      shared,
    );
    const saved = vitals?.[member.id];

    return {
      ...member,
      stats,
      hp: Math.min(saved?.hp ?? stats.maxHp, stats.maxHp),
      mp: Math.min(saved?.mp ?? stats.maxMp, stats.maxMp),
      erosion: saved?.erosion ?? 0,
      ailments: saved?.ailments ?? [],
    };
  });
}

/**
 * 파티원이 쓸 수 있는 스킬.
 *
 * **장착한 유물에서만 나온다** (ADR-004). 캐릭터에 스킬을 직접 들려주던 배선은 이걸로 사라졌다.
 * 침식량도 여기서 정해진다 — 유물 계수(올림)와 공명 완화(내림)가 함께 곱해진다 (T-026).
 */
export function partySkills(): Readonly<Record<ActorId, readonly Skill[]>> {
  const current = getLoadout();
  const ranks = relicRanks();
  // 완화는 파티 **전원**에게 같은 값으로 걸린다. 공명이 파티 단위 효과이기 때문이다 (GDD §5.2).
  const relief = resonanceErosionRelief(currentResonances());
  const skills: Record<ActorId, readonly Skill[]> = {};

  for (const member of basePartyMembers()) {
    skills[member.id] = activesOf(
      equippedBy(current, member.id).map((id) => relic(id)),
      ranks,
      relief,
    );
  }
  return skills;
}

/** 유물별 현재 숙련 단계. 해금 판정과 장착 화면이 같이 쓴다. */
export function relicRanks(): Readonly<Record<string, number>> {
  const ranks: Record<string, number> = {};
  for (const relicId of ownedRelics()) {
    ranks[relicId] = rankOfRelic(attunement, relicId, ATTUNEMENT);
  }
  return ranks;
}

export function getAttunement(): Attunement {
  return attunement;
}

/**
 * 전투에서 쓴 스킬을 유물 숙련도로 환산한다.
 *
 * **끼운 사람이 아니라 유물에 쌓인다** (GDD §5.3). 그래서 스킬 id 를 그 스킬을 공급한
 * 유물로 되짚어야 한다 — 같은 스킬을 두 유물이 공급하면 장착한 쪽에 쌓인다.
 */
export function recordSkillUses(uses: Readonly<Record<string, number>>): void {
  const current = getLoadout();
  const byRelic: Record<string, number> = {};

  for (const relicId of allEquipped(current)) {
    const entry = relic(relicId);
    for (const active of entry.actives) {
      const count = uses[active.skill.id];
      if (count !== undefined && count > 0) {
        byRelic[relicId] = (byRelic[relicId] ?? 0) + count;
      }
    }
  }

  attunement = gainAll(attunement, byRelic, ATTUNEMENT);
}

/** 전투가 끝난 뒤 파티 쪽 상태만 되가져온다. 스탯은 저장하지 않는다 — 매번 다시 계산한다. */
export function saveParty(actors: readonly BattleActor[]): void {
  const next: Record<ActorId, Vitals> = {};
  for (const actor of actors) {
    if (actor.side !== 'party') continue;
    next[actor.id] = {
      hp: actor.hp,
      mp: actor.mp,
      erosion: actor.erosion,
      ailments: actor.ailments ?? [],
    };
  }
  vitals = next;
}

export function getInventory(): Inventory {
  return inventory;
}

export function saveInventory(next: Inventory): void {
  inventory = next;
}

/** 전멸했을 때. 세이브가 생기면 마지막 저장 지점 복원으로 바뀐다. */
export function resetParty(): void {
  vitals = undefined;
  inventory = INITIAL_INVENTORY;
  loadout = undefined;
  worldRng = undefined;
  attunement = {};
}
