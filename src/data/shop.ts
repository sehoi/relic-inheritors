import type { StockEntry } from '../core/world/shop.js';

/**
 * 거점 상점의 상품 (GDD §6.4).
 *
 * ## 값을 매긴 근거
 *
 * 기준점은 **여관**이다 — Lv6 기준 은편 22 로 파티 전원의 HP·MP 가 완전히 돌아온다.
 * 아이템은 그보다 적게 회복하는 대신 **전투 중에 쓸 수 있다.** 그 차이가 값의 근거다.
 *
 * - `약초` 8 — 한 명 HP 40. 여관 셋 값이면 약초 여덟이니, 여관이 회복량으로는 훨씬 싸다.
 *   약초를 사는 이유는 양이 아니라 **죽기 전에 쓸 수 있다**는 것이다.
 * - `해독제`·`맑은 종` 6 — 회복이 아니라 되돌리기다. 안 걸리면 값어치가 0 이라 싸야 한다.
 * - `정화석` 15 — 정화소가 공짜로 해주는 일을 전투 중에 한다. 거점까지 못 돌아갈 때의 값이다.
 * - `잿불` 34 — **여관보다 비싸다.** 전멸은 되돌릴 수 없는 유일한 것이고,
 *   싸면 "죽으면 일으키지" 가 정답이 되어 소모전이라는 축이 사라진다.
 *
 * ## 등급이 오를수록 효율이 좋아진다 (T-053)
 *
 * 약초 40/8 = 5.0, 고약 90/16 = 5.6, 정수 180/30 = 6.0. **그러지 않으면 싼 것을 여러 개
 * 사는 것이 언제나 정답이고 등급이 장식이 된다.** 대신 소지 한도(9)가 있어 싼 것만으로는
 * 긴 소모전을 버틸 수 없다 — 자리를 아끼는 값이 곧 비싼 것의 값어치다.
 *
 * MP 는 HP 보다 은편당 조금 비싸다. 그전에는 승리 보상(적 하나당 1)이 유일한 공급원이라
 * **살 수 없는 자원**이었고, 살 수 있게 된 것만으로도 값어치가 크다.
 */
export const HAVEN_STOCK: readonly StockEntry[] = [
  // HP
  { itemId: 'torn-leaf', price: 4 },
  { itemId: 'herb', price: 8 },
  { itemId: 'salve', price: 16 },
  { itemId: 'essence', price: 30 },
  { itemId: 'dawn-dew', price: 50 },

  // MP
  { itemId: 'dry-leaf', price: 6 },
  { itemId: 'spring-water', price: 14 },
  { itemId: 'deep-draught', price: 27 },

  // 둘 다 — 각각은 전용품보다 못하지만 자리를 하나만 쓴다.
  { itemId: 'mixed-flask', price: 18 },
  { itemId: 'twin-draught', price: 40 },

  // 상태이상
  { itemId: 'antidote', price: 6 },
  { itemId: 'clear-bell', price: 6 },
  { itemId: 'panacea', price: 18 },

  // 침식
  { itemId: 'ashen-dust', price: 8 },
  { itemId: 'cleansing-stone', price: 15 },
  { itemId: 'clear-water', price: 30 },
  { itemId: 'hallowed-vial', price: 54 },

  // 죽음
  { itemId: 'faint-spark', price: 26 },
  { itemId: 'ashen-ember', price: 34 },
  { itemId: 'kindled-ember', price: 58 },
];
