import { describe, expect, it } from 'vitest';
import {
  CARRY_LIMIT,
  buy,
  buyBlockReason,
  priceOf,
  validateStock,
  type StockEntry,
} from '../../src/core/world/shop.js';
import { HAVEN_STOCK } from '../../src/data/shop.js';
import { ITEMS, item } from '../../src/data/items.js';
import { INN } from '../../src/data/facilities.js';
import { innPrice } from '../../src/core/world/facility.js';

const STOCK: readonly StockEntry[] = [
  { itemId: 'herb', price: 8 },
  { itemId: 'ashen-ember', price: 34 },
];

describe('buyBlockReason', () => {
  it('살 수 있으면 undefined 다', () => {
    expect(buyBlockReason(STOCK, 'herb', 10, {})).toBeUndefined();
  });

  it('안 파는 물건을 거부한다', () => {
    expect(buyBlockReason(STOCK, 'nope', 999, {})).toMatch(/팔지 않는다/);
  });

  it('은편이 모자라면 얼마가 모자란지 알려준다', () => {
    expect(buyBlockReason(STOCK, 'herb', 7, {})).toMatch(/7\/8/);
  });

  it('값이 딱 맞으면 살 수 있다', () => {
    expect(buyBlockReason(STOCK, 'herb', 8, {})).toBeUndefined();
  });

  it('소지 한도를 넘으면 거부한다', () => {
    expect(buyBlockReason(STOCK, 'herb', 999, { herb: CARRY_LIMIT })).toMatch(/더 지닐 수 없다/);
  });

  it('한도 직전까지는 살 수 있다', () => {
    expect(buyBlockReason(STOCK, 'herb', 999, { herb: CARRY_LIMIT - 1 })).toBeUndefined();
  });
});

describe('buy', () => {
  it('하나 늘고 값만큼 줄어든다', () => {
    const result = buy(STOCK, 'herb', 20, { herb: 2 });
    expect(result.inventory['herb']).toBe(3);
    expect(result.coins).toBe(12);
  });

  it('처음 사는 물건도 들어간다', () => {
    expect(buy(STOCK, 'ashen-ember', 40, {}).inventory['ashen-ember']).toBe(1);
  });

  it('원본을 변경하지 않는다', () => {
    const before = { herb: 1 };
    buy(STOCK, 'herb', 20, before);
    expect(before).toEqual({ herb: 1 });
  });

  it('살 수 없으면 사유를 담아 던진다', () => {
    expect(() => buy(STOCK, 'herb', 1, {})).toThrow(/모자란다/);
  });
});

describe('priceOf', () => {
  it('안 파는 물건은 undefined 다', () => {
    expect(priceOf(STOCK, 'nope')).toBeUndefined();
  });
});

describe('validateStock', () => {
  const known = Object.keys(ITEMS);

  it('실제 상품 목록이 유효하다', () => {
    expect(() => validateStock('haven', HAVEN_STOCK, known)).not.toThrow();
  });

  it('없는 아이템을 거부한다', () => {
    // 진열해두면 사는 순간 터지는데, 원인이 상점 데이터라는 것을 짚기 어렵다.
    expect(() => validateStock('haven', [{ itemId: 'ghost', price: 1 }], known)).toThrow(
      /존재하지 않는/,
    );
  });

  it('빈 상점을 거부한다', () => {
    expect(() => validateStock('haven', [], known)).toThrow(/파는 것이 없습니다/);
  });

  it('같은 물건을 두 줄에 놓을 수 없다', () => {
    expect(() =>
      validateStock('haven', [
        { itemId: 'herb', price: 8 },
        { itemId: 'herb', price: 9 },
      ], known),
    ).toThrow(/중복/);
  });

  it('값이 0 이하면 거부한다', () => {
    expect(() => validateStock('haven', [{ itemId: 'herb', price: 0 }], known)).toThrow(/값은/);
  });
});

describe('상품 값 (콘텐츠)', () => {
  const priceOfItem = (id: string): number => priceOf(HAVEN_STOCK, id) ?? 0;

  it('부활이 가장 비싸다', () => {
    // 전멸은 되돌릴 수 없는 유일한 것이다. 싸면 "죽으면 일으키지" 가 정답이 되어
    // 소모전이라는 축이 사라진다.
    const revive = priceOfItem('ashen-ember');
    for (const entry of HAVEN_STOCK) {
      if (entry.itemId === 'ashen-ember') continue;
      expect(revive, entry.itemId).toBeGreaterThan(entry.price);
    }
  });

  it('부활이 여관보다 비싸다', () => {
    // 여관은 파티 전원을 완전히 되돌린다. 그보다 싸게 죽음을 되돌릴 수는 없다.
    expect(priceOfItem('ashen-ember')).toBeGreaterThan(innPrice(6, INN));
  });

  it('되돌리기 아이템이 회복 아이템보다 싸다', () => {
    // 해독제는 상태이상이 안 걸리면 값어치가 0 이다. 싸야 살 이유가 생긴다.
    expect(priceOfItem('antidote')).toBeLessThan(priceOfItem('herb'));
    expect(priceOfItem('clear-bell')).toBeLessThan(priceOfItem('herb'));
  });

  it('정화석이 약초보다 비싸다', () => {
    // 침식은 주 자원이고, 전투 중에 씻을 수단은 이것뿐이다.
    expect(priceOfItem('cleansing-stone')).toBeGreaterThan(priceOfItem('herb'));
  });

  it('전투에서 쓰는 아이템을 모두 판다', () => {
    // 하나라도 빠지면 그 축은 되돌릴 수 없는 축이 된다 (`core/battle/item.ts` 참조).
    for (const id of Object.keys(ITEMS)) {
      expect(priceOf(HAVEN_STOCK, id), `${item(id).name} 을(를) 팔지 않는다`).toBeDefined();
    }
  });
});
