import type { BattleActor } from '../core/battle/index.js';
import type { Inventory } from '../core/battle/item.js';
import { createRng, type Rng } from '../core/rng/index.js';
import { AREA_LEVELS, starterParty } from '../data/encounters.js';
import { STARTING_MAP } from '../data/maps.js';

/**
 * 전투 밖에서도 이어지는 파티 상태.
 *
 * HP·MP·침식은 전투가 끝나도 남는다 (GDD §5.4). 씬은 오갈 때마다 새로 만들어지므로
 * 상태를 어딘가에 두어야 하는데, **세이브(M4)가 생기기 전까지는 메모리에 둔다.**
 * 새로고침하면 초기화된다 — 그건 세이브가 할 일이지 이 모듈이 할 일이 아니다.
 */

const INITIAL_INVENTORY: Inventory = {
  herb: 3,
  antidote: 1,
  'clear-bell': 1,
  'cleansing-stone': 1,
  'ashen-ember': 1,
};

/**
 * 월드 난수. 인카운터 발생과 조우 구성이 여기서 나온다.
 *
 * `Math.random()` 을 쓰지 않는다 (ADR-002). 세션 시작부터의 수열이 고정이라
 * "몇 걸음째에 뭐가 나왔는지" 를 재현할 수 있다. 세이브(M4)가 생기면 이 상태도 함께 저장된다.
 */
const WORLD_SEED = 20_260_805;

let party: readonly BattleActor[] | undefined;
let inventory: Inventory = INITIAL_INVENTORY;
let worldRng: Rng | undefined;

export function worldRandom(): Rng {
  worldRng ??= createRng(WORLD_SEED);
  return worldRng;
}

export function getParty(): readonly BattleActor[] {
  party ??= starterParty(AREA_LEVELS[STARTING_MAP]);
  return party;
}

/** 전투가 끝난 뒤 파티 쪽 상태만 되가져온다. 적은 버린다. */
export function saveParty(actors: readonly BattleActor[]): void {
  party = actors.filter((actor) => actor.side === 'party');
}

export function getInventory(): Inventory {
  return inventory;
}

export function saveInventory(next: Inventory): void {
  inventory = next;
}

/** 전멸했을 때. 세이브가 생기면 마지막 저장 지점 복원으로 바뀐다. */
export function resetParty(): void {
  party = undefined;
  inventory = INITIAL_INVENTORY;
  worldRng = undefined;
}
