import { createRegistry } from '../core/data/registry.js';
import type { Item } from '../core/battle/item.js';

/**
 * 전투 중 쓰는 아이템 (GDD §8 — 20종, T-053).
 *
 * 아이템은 **자원을 소비해 규칙을 되돌리는 수단**이다. 다섯 축이 각각 다른 것을 되돌린다 —
 * HP, MP, 상태이상, 침식, 죽음. 하나라도 빠지면 그 축은 되돌릴 수 없는 축이 되고,
 * 전투 설계의 자유도가 줄어든다.
 *
 * ## 축 안에서는 등급으로 나눈다
 *
 * 같은 것을 되돌리되 **양과 값이 다르다.** 이게 20종을 채우는 방식이고, 새 효과를
 * 억지로 만드는 것보다 낫다 — 효과가 늘면 전투 규칙이 늘지만 등급이 늘면 선택이 는다.
 *
 * 등급 간 효율은 **위로 갈수록 좋아진다** (약초 40/8은편 = 5, 정수 180/30 = 6).
 * 그러지 않으면 싼 것을 여러 개 사는 것이 언제나 정답이고, 등급이 장식이 된다.
 * 대신 소지 한도(9)가 있어 싼 것만으로는 긴 소모전을 버틸 수 없다.
 *
 * ## MP 를 되돌리는 축이 새로 생겼다
 *
 * 그전에는 **승리 시 적 하나당 1** 이 유일한 MP 공급원이었다 (T-046). 능력이 유물에서
 * 나오는 게임에서(ADR-004) MP 가 마르면 남는 것은 기본 공격뿐인데, 그 상태를 되돌릴
 * 수단이 전투 안에 없었다.
 */
export const ITEMS: Readonly<Record<string, Item>> = {
  // ── HP ──────────────────────────────────────────────────────────────────
  'torn-leaf': {
    id: 'torn-leaf',
    name: '찢은 잎',
    // 가장 싼 것. 첫 전투부터 살 수 있어야 아이템이라는 축이 처음부터 존재한다.
    effect: { kind: 'heal', hp: 18 },
  },

  herb: {
    id: 'herb',
    name: '약초',
    effect: { kind: 'heal', hp: 40 },
  },

  salve: {
    id: 'salve',
    name: '고약',
    effect: { kind: 'heal', hp: 90 },
  },

  essence: {
    id: 'essence',
    name: '정수',
    effect: { kind: 'heal', hp: 180 },
  },

  'dawn-dew': {
    id: 'dawn-dew',
    name: '새벽 이슬',
    // 후반 한 명을 통째로 되돌린다. 여관 값에 맞먹어 "지금 여기서" 가 값의 근거다.
    effect: { kind: 'heal', hp: 320 },
  },

  // ── MP ──────────────────────────────────────────────────────────────────
  'dry-leaf': {
    id: 'dry-leaf',
    name: '마른 잎',
    effect: { kind: 'heal', mp: 10 },
  },

  'spring-water': {
    id: 'spring-water',
    name: '샘물',
    effect: { kind: 'heal', mp: 26 },
  },

  'deep-draught': {
    id: 'deep-draught',
    name: '깊은 잔',
    effect: { kind: 'heal', mp: 55 },
  },

  // ── 둘 다 ───────────────────────────────────────────────────────────────
  //
  // 한 번에 둘을 되돌리는 대신 각각은 전용품보다 못하다. 자리를 아끼는 값이
  // 효율이라는 것이 소지 한도(9)가 있는 게임에서 성립한다.
  'mixed-flask': {
    id: 'mixed-flask',
    name: '섞은 병',
    effect: { kind: 'heal', hp: 55, mp: 18 },
  },

  'twin-draught': {
    id: 'twin-draught',
    name: '겹친 잔',
    effect: { kind: 'heal', hp: 130, mp: 40 },
  },

  // ── 상태이상 ────────────────────────────────────────────────────────────
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

  panacea: {
    id: 'panacea',
    name: '만병초',
    // 다섯을 한 번에. 무엇에 걸렸는지 모를 때의 답이고, 그래서 둘을 합친 값보다 비싸다.
    effect: { kind: 'cure', ailments: ['poison', 'paralysis', 'sleep', 'silence', 'confusion'] },
  },

  // ── 침식 ────────────────────────────────────────────────────────────────
  //
  // 거점 정화소는 **비율로** 씻고(75%) 이쪽은 고정량이다. 침식이 쌓일수록 거점이
  // 확실히 유리해지는 것이 그 차이의 뜻이다 (GDD §5.4).
  'ashen-dust': {
    id: 'ashen-dust',
    name: '재 가루',
    effect: { kind: 'cleanse', erosion: 20 },
  },

  'cleansing-stone': {
    id: 'cleansing-stone',
    name: '정화석',
    effect: { kind: 'cleanse', erosion: 40 },
  },

  'clear-water': {
    id: 'clear-water',
    name: '맑은 물',
    effect: { kind: 'cleanse', erosion: 85 },
  },

  'hallowed-vial': {
    id: 'hallowed-vial',
    name: '성수병',
    effect: { kind: 'cleanse', erosion: 160 },
  },

  // ── 죽음 ────────────────────────────────────────────────────────────────
  //
  // **되돌릴 수 없는 유일한 것이라 가장 비싸다.** 싸면 "죽으면 일으키지" 가 정답이 되어
  // 소모전이라는 축이 사라진다 (T-041b 에서 테스트로 못 박았다).
  'faint-spark': {
    id: 'faint-spark',
    name: '희미한 불씨',
    effect: { kind: 'revive', hpRatio: 0.2 },
  },

  'ashen-ember': {
    id: 'ashen-ember',
    name: '잿불',
    // 절반이 아니라 절반 이하로 일으킨다 — 부활이 값싸면 전멸의 긴장이 사라진다.
    effect: { kind: 'revive', hpRatio: 0.35 },
  },

  'kindled-ember': {
    id: 'kindled-ember',
    name: '되살린 잿불',
    effect: { kind: 'revive', hpRatio: 0.45 },
  },
};

export const itemRegistry = createRegistry('아이템', ITEMS, (item) => item.id);

export function item(id: string): Item {
  return itemRegistry.get(id);
}
