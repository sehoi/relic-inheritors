/**
 * 상점 (GDD §6.4, ADR-001).
 *
 * 은편을 쓸 곳이다. 파는 것과 값은 데이터가 정하고, 여기서는 **살 수 있는가**만 답한다.
 *
 * 살 수 없는 이유를 불리언이 아니라 **문자열로** 돌려주는 것은 이 프로젝트의 규약이다
 * (`equipBlockReason`·`skillBlockReason`과 같다). 화면이 "왜 회색인지" 를 보여줘야 하고,
 * 사유가 필요한 곳이 화면만은 아니다.
 */

import type { Inventory } from '../battle/item.js';
import { Problems, createDuplicateGuard } from '../validation/index.js';

export interface StockEntry {
  readonly itemId: string;
  readonly price: number;
}

/** 한 종류를 이만큼 넘게 지닐 수 없다. 전투 중 아이템 메뉴가 읽히려면 자릿수가 하나여야 한다. */
export const CARRY_LIMIT = 9;

export function priceOf(stock: readonly StockEntry[], itemId: string): number | undefined {
  return stock.find((entry) => entry.itemId === itemId)?.price;
}

/** 살 수 없는 이유. 살 수 있으면 `undefined`. */
export function buyBlockReason(
  stock: readonly StockEntry[],
  itemId: string,
  coins: number,
  inventory: Inventory,
): string | undefined {
  const price = priceOf(stock, itemId);
  if (price === undefined) return '여기서 팔지 않는다';
  if (price > coins) return `은편이 모자란다 (${coins}/${price})`;
  if ((inventory[itemId] ?? 0) >= CARRY_LIMIT) return `더 지닐 수 없다 (최대 ${CARRY_LIMIT})`;
  return undefined;
}

export interface Purchase {
  readonly inventory: Inventory;
  readonly coins: number;
}

/** 하나 산다. 살 수 없으면 사유를 담아 던진다 — 호출부가 먼저 확인해야 한다. */
export function buy(
  stock: readonly StockEntry[],
  itemId: string,
  coins: number,
  inventory: Inventory,
): Purchase {
  const blocked = buyBlockReason(stock, itemId, coins, inventory);
  if (blocked !== undefined) {
    throw new Error(`"${itemId}" 를 살 수 없습니다: ${blocked}`);
  }

  const price = priceOf(stock, itemId) ?? 0;
  return {
    inventory: { ...inventory, [itemId]: (inventory[itemId] ?? 0) + 1 },
    coins: coins - price,
  };
}

/**
 * 상품 목록을 검사한다.
 *
 * **파는 물건이 실제로 존재해야 한다.** 없는 아이템을 진열하면 사는 순간 터지는데,
 * 그 원인이 상점 데이터라는 것을 런타임에서 짚기 어렵다.
 */
export function validateStock(
  shopId: string,
  stock: readonly StockEntry[],
  knownItems: readonly string[],
): void {
  const problems = Problems.create();
  const guard = createDuplicateGuard('상품', problems.scope(shopId));
  const items = new Set(knownItems);

  if (stock.length === 0) {
    problems.add(`${shopId}: 파는 것이 없습니다. 빈 상점은 들를 이유가 없습니다.`);
  }

  for (const entry of stock) {
    const at = problems.scope(`${shopId}/${entry.itemId}`);
    guard(entry.itemId);

    if (!items.has(entry.itemId)) at.add('존재하지 않는 아이템입니다.');
    if (!Number.isInteger(entry.price) || entry.price < 1) {
      at.add(`값은 1 이상의 정수여야 합니다 (받은 값: ${entry.price}).`);
    }
  }

  problems.throwIfAny('상점 상품');
}
