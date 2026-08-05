import type { ActorId, BattleActor } from '../core/battle/index.js';
import type { Inventory } from '../core/battle/item.js';
import type { Skill } from '../core/battle/skill.js';
import type { AilmentState } from '../core/battle/status.js';
import { createRng, restoreRng, type Rng } from '../core/rng/index.js';
import { cleansedErosion, type CleansingTuning } from '../core/world/facility.js';
import {
  SAVE_VERSION,
  type SaveData,
  type SavedLocation,
  type SavedVitals,
} from '../core/save/index.js';
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
import { starterParty } from '../data/encounters.js';
import { LEVEL_CURVE } from '../data/progression.js';
import { levelOf, progressOf, type LevelProgress } from '../core/progress/level.js';
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
/** 지닌 유물. 세이브에서 복원되며, 회수 지점(T-039)이 여기를 늘린다. */
let owned: readonly string[] = STARTING_RELICS;
/** 이미 주운 회수 지점. 한 번 주우면 사라져야 한다 (GDD §6.1). */
let collectedSites: ReadonlySet<string> = new Set();

/**
 * 월드 난수. 인카운터 발생과 조우 구성이 여기서 나온다.
 * `Math.random()` 을 쓰지 않는다 (ADR-002) — 세션 시작부터의 수열이 고정이라 재현할 수 있다.
 */
export function worldRandom(): Rng {
  worldRng ??= createRng(WORLD_SEED);
  return worldRng;
}

/** 파티 누적 경험치. **레벨은 여기서 파생된다** — 둘 다 저장하면 언젠가 어긋난다. */
let partyExp = 0;
/** 은편. 여관·상점이 쓴다 (T-041a). */
let coins = 0;

export function coinCount(): number {
  return coins;
}

export function gainCoins(amount: number): void {
  if (amount > 0) coins += Math.floor(amount);
}

/**
 * 여관에서 쉰다. 실제로 쓴 은편을 돌려주고, 못 쉬면 `undefined`.
 *
 * **HP·MP 만 되돌린다. 침식은 정화소의 몫이다** — 한 자리에서 모든 것이 해결되면
 * 다른 자리에 갈 이유가 없어진다.
 */
export function restAtInn(price: number): number | undefined {
  if (price > coins) return undefined;

  const next: Record<ActorId, Vitals> = {};
  for (const member of basePartyMembers()) {
    const saved = vitals?.[member.id];
    next[member.id] = {
      hp: member.stats.maxHp,
      mp: member.stats.maxMp,
      erosion: saved?.erosion ?? 0,
      ailments: [],
    };
  }

  vitals = next;
  coins -= price;
  return price;
}

export function partyLevel(): number {
  return levelOf(partyExp, LEVEL_CURVE);
}

export function partyProgress(): LevelProgress {
  return progressOf(partyExp, LEVEL_CURVE);
}

export function totalExp(): number {
  return partyExp;
}

/**
 * 경험치를 얻는다. 레벨이 올랐으면 오른 레벨을 돌려준다.
 *
 * **레벨업은 완전 회복을 겸한다.** 유적 안에서 회복할 방법이 이것뿐이고(거점은 T-040),
 * 회복 없는 소모전은 실측에서 평균 6판 만에 전멸했다. "한 판만 더 버티면 오른다" 가
 * 탐색을 이어갈 이유가 된다.
 */
export function gainExp(amount: number): number | undefined {
  if (amount <= 0) return undefined;

  const before = partyLevel();
  partyExp += Math.floor(amount);
  const after = partyLevel();
  if (after === before) return undefined;

  // 최대치는 새 레벨 기준이다. 그래서 vitals 를 지우는 것으로 완전 회복이 된다 —
  // 여기서 숫자를 직접 채우면 유물 보정과 어긋난다.
  vitals = undefined;
  return after;
}

/** 보정이 붙지 않은 파티. 스탯 계산의 기준점이다. */
function basePartyMembers(): readonly BattleActor[] {
  return starterParty(partyLevel());
}

export function ownedRelics(): readonly string[] {
  return owned;
}

/** 유물을 새로 얻는다. 이미 지닌 것이면 아무 일도 없다. */
export function gainRelic(relicId: string): void {
  if (!owned.includes(relicId)) owned = [...owned, relicId];
}

export function collected(): ReadonlySet<string> {
  return collectedSites;
}

/**
 * 회수 지점을 줍는다. 이미 주웠으면 `undefined`.
 *
 * 주웠다는 사실과 유물을 얻는 것을 **한 곳에서** 처리한다. 나눠 두면 언젠가 한쪽만 부르게 되고,
 * 그러면 유물 없이 사라진 회수 지점이나 무한히 주울 수 있는 유물이 생긴다.
 */
export function collectSite(siteId: string, relicId: string): string | undefined {
  if (collectedSites.has(siteId)) return undefined;
  collectedSites = new Set([...collectedSites, siteId]);
  gainRelic(relicId);
  return relicId;
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

export interface VictoryOutcome {
  /** 레벨이 올랐으면 오른 레벨. 안 올랐으면 undefined. */
  readonly levelledTo: number | undefined;
  /** 돌아온 MP. 0이면 아무도 회복하지 않았다. */
  readonly mpRecovered: number;
  /** 얻은 은편. */
  readonly coinsGained: number;
}

/**
 * **이겼을 때 일어나는 일 전부** (T-046).
 *
 * 저장·숙련도·MP 회복·경험치를 한 함수에 모은 이유는, 흩어져 있으면 **화면과 시뮬레이터가
 * 서로 다른 순서로 부르게 되기 때문이다.** 실제로 T-044 에서 시뮬레이터가 4인 파티를 재는 동안
 * 게임은 2인이었던 일이 있었다. 밸런스 측정이 게임과 같은 것을 재려면 같은 길을 지나야 한다.
 */
export function settleVictory(
  actors: readonly BattleActor[],
  inventory: Inventory,
  skillUses: Readonly<Record<string, number>>,
  defeatedEnemies: number,
  expGained: number,
  recovery: { readonly mpPerEnemy: number },
  coinsGained = 0,
): VictoryOutcome {
  const back = Math.max(0, recovery.mpPerEnemy * defeatedEnemies);
  let mpRecovered = 0;

  saveParty(
    actors.map((actor) => {
      if (actor.side !== 'party' || actor.hp <= 0 || back === 0) return actor;
      const mp = Math.min(actor.stats.maxMp, actor.mp + back);
      mpRecovered += mp - actor.mp;
      return { ...actor, mp };
    }),
  );

  saveInventory(inventory);
  recordSkillUses(skillUses);

  gainCoins(coinsGained);

  const levelledTo = gainExp(expGained);
  // 레벨업은 완전 회복을 겸한다. 회복된 상태를 다시 저장해야 전투 밖으로 이어진다.
  if (levelledTo !== undefined) saveParty(partyForBattle());

  return { levelledTo, mpRecovered, coinsGained: Math.max(0, Math.floor(coinsGained)) };
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

/** 전멸했을 때. 세이브 슬롯 UI(T-038)가 붙으면 마지막 저장 지점 복원이 선택지로 추가된다. */
export function resetParty(): void {
  vitals = undefined;
  inventory = INITIAL_INVENTORY;
  loadout = undefined;
  worldRng = undefined;
  attunement = {};
  owned = STARTING_RELICS;
  collectedSites = new Set();
  partyExp = 0;
  coins = 0;
}

/**
 * 정화소에서 파티의 침식을 씻는다. 실제로 줄어든 총량을 돌려준다 (T-040).
 *
 * 씻을 것이 없으면 0 — 화면이 "아무 일도 없었다" 를 말할 수 있어야 한다.
 */
export function cleanseParty(tuning: CleansingTuning): number {
  const next: Record<ActorId, Vitals> = {};
  let removed = 0;

  for (const member of basePartyMembers()) {
    const saved = vitals?.[member.id];
    const before = saved?.erosion ?? 0;
    const after = cleansedErosion(before, tuning);
    removed += before - after;

    next[member.id] = {
      hp: saved?.hp ?? member.stats.maxHp,
      mp: saved?.mp ?? member.stats.maxMp,
      erosion: after,
      ailments: saved?.ailments ?? [],
    };
  }

  vitals = next;
  return removed;
}

// ── 세이브 (T-037) ────────────────────────────────────────────────────────

/**
 * 지금 상태를 세이브 자료로 뜬다.
 *
 * **스탯은 담지 않는다.** 유물 보정이 적용된 스탯을 저장하면 불러올 때마다 보정이 겹쳐 쌓인다
 * — 저장하는 것은 "지금 얼마나 다쳤는가" 뿐이라는 이 모듈의 원칙이 세이브에도 그대로 간다.
 *
 * 시각과 플레이 시간은 넘겨받는다. 이 모듈도 시계를 갖지 않는 편이 테스트하기 쉽다.
 */
export function captureSave(
  location: SavedLocation,
  meta: { readonly savedAt: number; readonly playtimeMs: number },
): SaveData {
  const party: Record<ActorId, SavedVitals> = {};
  for (const member of basePartyMembers()) {
    const saved = vitals?.[member.id];
    const stats = member.stats;
    party[member.id] = {
      hp: saved?.hp ?? stats.maxHp,
      mp: saved?.mp ?? stats.maxMp,
      erosion: saved?.erosion ?? 0,
      ailments: (saved?.ailments ?? []).map((state) => ({
        kind: state.kind,
        turns: state.turns,
      })),
    };
  }

  return {
    version: SAVE_VERSION,
    savedAt: meta.savedAt,
    playtimeMs: meta.playtimeMs,
    location,
    party,
    owned: [...owned],
    loadout: getLoadout(),
    attunement: { ...attunement },
    inventory: { ...inventory },
    // 시드가 아니라 **상태**를 저장한다. 시드만 저장하면 불러올 때마다 인카운터 수열이
    // 처음부터 다시 시작해, 저장·로드 반복으로 조우를 조작할 수 있다 (ADR-002).
    worldRngState: worldRandom().getState(),
    collectedSites: [...collectedSites].sort(),
    exp: partyExp,
    coins,
  };
}

/**
 * 세이브를 현재 상태로 되돌린다.
 *
 * 호출부가 **먼저 검증해야 한다** (`parseSave`, `validateSaveReferences`). 여기서 다시
 * 검사하지 않는 이유는 판정이 두 곳에 있으면 반드시 어긋나기 때문이다.
 */
export function restoreSave(save: SaveData): void {
  owned = [...save.owned];
  loadout = save.loadout;
  attunement = { ...save.attunement };
  inventory = { ...save.inventory };
  worldRng = restoreRng(save.worldRngState);
  collectedSites = new Set(save.collectedSites);
  // 경험치를 먼저 넣는다 — 아래에서 vitals 를 채울 때 최대치가 레벨에 달려 있다.
  partyExp = save.exp;
  coins = save.coins;

  const next: Record<ActorId, Vitals> = {};
  for (const [actorId, saved] of Object.entries(save.party)) {
    next[actorId] = {
      hp: saved.hp,
      mp: saved.mp,
      erosion: saved.erosion,
      ailments: saved.ailments.map((state) => ({ kind: state.kind, turns: state.turns })),
    };
  }
  vitals = next;
}
