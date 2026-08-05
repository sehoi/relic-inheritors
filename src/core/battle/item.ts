/**
 * 아이템 (GDD §6.3, ADR-001).
 *
 * 전투 중에 쓰는 최소 형태만 다룬다. 상점·소지 한도·정렬 같은 인벤토리 살림은 M4(거점)의 몫이다.
 *
 * 아이템은 **자원을 소비해 규칙을 되돌리는 수단**이다 — 회복은 피해를, 해독은 상태이상을,
 * 정화석은 침식을, 부활은 죽음을 되돌린다. 되돌릴 수 없는 것이 하나도 없으면 전투에 긴장이 없고,
 * 되돌릴 수 있는 것이 하나도 없으면 실수 한 번에 판이 끝난다.
 */

import { applyHeal } from './damage.js';
import type { BattleActor } from './index.js';
import { ailmentsOf, removeAilment, type Ailment } from './status.js';

export type ItemEffect =
  | { readonly kind: 'heal'; readonly amount: number }
  | { readonly kind: 'cure'; readonly ailments: readonly Ailment[] }
  | { readonly kind: 'cleanse'; readonly erosion: number }
  /** 쓰러진 대상을 최대 HP 의 비율로 일으킨다. 회복 아이템은 이걸 못 한다 (damage.ts 참조). */
  | { readonly kind: 'revive'; readonly hpRatio: number };

export interface Item {
  readonly id: string;
  readonly name: string;
  readonly effect: ItemEffect;
}

/** 소지품. 아이템 id → 남은 개수. */
export type Inventory = Readonly<Record<string, number>>;

export function countOf(inventory: Inventory, itemId: string): number {
  return inventory[itemId] ?? 0;
}

export function consume(inventory: Inventory, itemId: string): Inventory {
  const left = countOf(inventory, itemId) - 1;
  if (left < 0) {
    throw new RangeError(`"${itemId}" 를 가지고 있지 않습니다.`);
  }

  const next = { ...inventory };
  if (left === 0) delete next[itemId];
  else next[itemId] = left;
  return next;
}

/**
 * 아이템을 쓸 수 없는 이유. 쓸 수 있으면 `undefined`.
 *
 * 스킬과 마찬가지로 불리언이 아니라 이유를 돌려준다 — UI 가 왜 회색인지 보여줘야 한다.
 */
export function itemBlockReason(
  inventory: Inventory,
  item: Item,
  target: BattleActor,
): string | undefined {
  if (countOf(inventory, item.id) <= 0) return `${item.name}이(가) 없다`;

  const alive = target.hp > 0;
  if (item.effect.kind === 'revive') {
    if (alive) return '아직 쓰러지지 않았다';
    return undefined;
  }

  // 부활 외의 아이템은 쓰러진 대상에게 쓸 수 없다.
  if (!alive) return '이미 쓰러졌다';

  if (item.effect.kind === 'cure') {
    const curable = item.effect.ailments;
    const has = ailmentsOf(target).some((a) => curable.includes(a.kind));
    if (!has) return '치료할 상태이상이 없다';
  }

  if (item.effect.kind === 'cleanse' && target.erosion <= 0) return '침식이 없다';
  if (item.effect.kind === 'heal' && target.hp >= target.stats.maxHp) return '이미 온전하다';

  return undefined;
}

export interface ItemOutcome {
  readonly actor: BattleActor;
  /** 실제로 회복된 양. 최대치에 막히면 요청량보다 작다. */
  readonly healed: number;
  readonly cured: readonly Ailment[];
  /** 실제로 씻어낸 침식량. */
  readonly cleansed: number;
  readonly revived: boolean;
}

/** 효과를 적용한 결과. 무엇이 실제로 일어났는지를 함께 돌려준다 — 이벤트가 그걸 필요로 한다. */
export function applyItemEffect(target: BattleActor, item: Item): ItemOutcome {
  const none = { healed: 0, cured: [] as readonly Ailment[], cleansed: 0, revived: false };

  switch (item.effect.kind) {
    case 'heal': {
      const after = applyHeal(target, item.effect.amount);
      return { ...none, actor: after, healed: after.hp - target.hp };
    }

    case 'cure': {
      const curable = item.effect.ailments;
      const cured = ailmentsOf(target)
        .map((a) => a.kind)
        .filter((kind) => curable.includes(kind));

      const after = cured.reduce((actor, kind) => removeAilment(actor, kind), target);
      return { ...none, actor: after, cured };
    }

    case 'cleanse': {
      const cleansed = Math.min(target.erosion, item.effect.erosion);
      return { ...none, actor: { ...target, erosion: target.erosion - cleansed }, cleansed };
    }

    case 'revive': {
      const hp = Math.max(1, Math.round(target.stats.maxHp * item.effect.hpRatio));
      return { ...none, actor: { ...target, hp }, revived: true, healed: hp };
    }
  }
}
