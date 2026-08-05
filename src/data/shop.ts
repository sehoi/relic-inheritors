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
 */
export const HAVEN_STOCK: readonly StockEntry[] = [
  { itemId: 'herb', price: 8 },
  { itemId: 'antidote', price: 6 },
  { itemId: 'clear-bell', price: 6 },
  { itemId: 'cleansing-stone', price: 15 },
  { itemId: 'ashen-ember', price: 34 },
];
