import { createRegistry } from '../core/data/registry.js';
import type { Item } from '../core/battle/item.js';

/**
 * 전투 중 쓰는 아이템.
 *
 * 넷이 각각 **다른 종류의 되돌리기**를 담당한다 — 피해, 상태이상, 침식, 죽음.
 * 하나라도 빠지면 그 축은 되돌릴 수 없는 축이 되고, 전투 설계의 자유도가 줄어든다.
 *
 * 상점·가격·소지 한도는 M4(거점)에서 붙는다.
 */
export const ITEMS: Readonly<Record<string, Item>> = {
  herb: {
    id: 'herb',
    name: '약초',
    effect: { kind: 'heal', amount: 40 },
  },

  antidote: {
    id: 'antidote',
    name: '해독제',
    // 마비·수면까지 함께 푼다. 상태이상마다 전용 아이템을 두면 가방만 복잡해진다.
    effect: { kind: 'cure', ailments: ['poison', 'paralysis', 'sleep'] },
  },

  'clear-bell': {
    id: 'clear-bell',
    name: '맑은 종',
    effect: { kind: 'cure', ailments: ['silence', 'confusion'] },
  },

  'cleansing-stone': {
    id: 'cleansing-stone',
    name: '정화석',
    // 전투 중 침식을 씻는 유일한 수단. 거점 정화소보다 효율은 나쁘게 잡는다.
    effect: { kind: 'cleanse', erosion: 40 },
  },

  'ashen-ember': {
    id: 'ashen-ember',
    name: '잿불',
    // 절반이 아니라 절반 이하로 일으킨다 — 부활이 값싸면 전멸의 긴장이 사라진다.
    effect: { kind: 'revive', hpRatio: 0.35 },
  },
};

export const itemRegistry = createRegistry('아이템', ITEMS, (item) => item.id);

export function item(id: string): Item {
  return itemRegistry.get(id);
}
