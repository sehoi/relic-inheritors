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

  /**
   * 전멸은 되돌릴 수 없는 유일한 것이다. 싸면 "죽으면 일으키지" 가 정답이 되어
   * 소모전이라는 축이 사라진다.
   *
   * **아이템이 20종이 되며 규칙의 모양이 바뀌었다** (T-053). 예전에는 부활 하나가
   * 나머지 전부보다 비싸면 됐는데, 등급이 생기자 "최상급 회복이 하급 부활보다 비싼" 것이
   * 자연스러워졌다 — 그건 값이 틀린 게 아니라 등급이 다른 것이다.
   * 지켜야 할 것은 **가장 비싼 것이 부활이라는 것**과 **어떤 부활도 여관보다 싸지 않다**는 것이다.
   */
  const revives = HAVEN_STOCK.filter((entry) => item(entry.itemId).effect.kind === 'revive');

  it('가장 비싼 상품이 부활이다', () => {
    const priciest = [...HAVEN_STOCK].sort((a, b) => b.price - a.price)[0];
    expect(item(priciest?.itemId ?? '').effect.kind, `가장 비싼 것: ${priciest?.itemId}`).toBe(
      'revive',
    );
  });

  it('어떤 부활도 여관보다 싸지 않다', () => {
    // 여관은 파티 전원을 완전히 되돌린다. 그보다 싸게 죽음을 되돌릴 수는 없다.
    expect(revives.length, '부활 상품이 없다').toBeGreaterThan(0);
    for (const entry of revives) {
      expect(entry.price, entry.itemId).toBeGreaterThan(innPrice(6, INN));
    }
  });

  it('다섯 축이 전부 팔린다 (T-053)', () => {
    // 되돌릴 수 없는 축이 하나라도 있으면 전투 설계의 자유도가 그만큼 줄어든다.
    // HP 와 MP 는 같은 `heal` 효과라 효과 종류만으로는 나뉘지 않는다.
    const kinds = new Set(HAVEN_STOCK.map((entry) => item(entry.itemId).effect.kind));
    expect([...kinds].sort()).toEqual(['cleanse', 'cure', 'heal', 'revive']);

    const heals = HAVEN_STOCK.map((entry) => item(entry.itemId).effect).filter(
      (effect) => effect.kind === 'heal',
    );
    expect(heals.some((effect) => (effect.hp ?? 0) > 0), 'HP 를 주는 상품이 없다').toBe(true);
    expect(heals.some((effect) => (effect.mp ?? 0) > 0), 'MP 를 주는 상품이 없다').toBe(true);
  });

  it('등급이 오를수록 은편당 회복량이 좋아진다 (T-053)', () => {
    // **그러지 않으면 싼 것을 여러 개 사는 것이 언제나 정답이고 등급이 장식이 된다.**
    const hpLine = HAVEN_STOCK.map((entry) => ({ entry, effect: item(entry.itemId).effect }))
      .filter((row) => row.effect.kind === 'heal' && (row.effect.hp ?? 0) > 0 && (row.effect.mp ?? 0) === 0)
      .map((row) => ({
        id: row.entry.itemId,
        price: row.entry.price,
        per: (row.effect.kind === 'heal' ? (row.effect.hp ?? 0) : 0) / row.entry.price,
      }))
      .sort((a, b) => a.price - b.price);

    for (let i = 1; i < hpLine.length; i += 1) {
      const prev = hpLine[i - 1];
      const cur = hpLine[i];
      expect(cur?.per ?? 0, `${cur?.id} 가 ${prev?.id} 보다 효율이 나쁘다`).toBeGreaterThanOrEqual(
        prev?.per ?? 0,
      );
    }
  });

  it('가장 싼 부활이 가장 싼 회복보다 비싸다', () => {
    // 죽게 두고 일으키는 편이 싸면 회복을 아낄 이유가 생긴다.
    const heals = HAVEN_STOCK.filter((entry) => item(entry.itemId).effect.kind === 'heal');
    const cheapestRevive = Math.min(...revives.map((entry) => entry.price));
    const cheapestHeal = Math.min(...heals.map((entry) => entry.price));

    expect(cheapestRevive).toBeGreaterThan(cheapestHeal);
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
