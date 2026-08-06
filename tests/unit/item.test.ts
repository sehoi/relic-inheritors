import { describe, expect, it } from 'vitest';
import type { BattleActor } from '../../src/core/battle/index.js';
import {
  applyItemEffect,
  consume,
  countOf,
  itemBlockReason,
} from '../../src/core/battle/item.js';
import { ITEMS, item, itemRegistry } from '../../src/data/items.js';

const actor = (overrides: Partial<BattleActor> = {}): BattleActor => ({
  id: 'hero',
  name: 'hero',
  side: 'party',
  stats: { maxHp: 100, maxMp: 20, atk: 40, def: 20, mag: 30, res: 15, agi: 10, luk: 0 },
  hp: 100,
  mp: 20,
  erosion: 0,
  ...overrides,
});

const herb = item('herb');
const antidote = item('antidote');
const stone = item('cleansing-stone');
const ember = item('ashen-ember');

describe('인벤토리', () => {
  it('개수를 센다', () => {
    expect(countOf({ herb: 3 }, 'herb')).toBe(3);
    expect(countOf({}, 'herb')).toBe(0);
  });

  it('소비하면 하나 줄고, 0이 되면 키가 사라진다', () => {
    expect(consume({ herb: 3 }, 'herb')).toEqual({ herb: 2 });
    expect(consume({ herb: 1 }, 'herb')).toEqual({});
  });

  it('없는 것을 소비하면 던진다', () => {
    expect(() => consume({}, 'herb')).toThrow(RangeError);
  });

  it('원본을 변경하지 않는다', () => {
    const inventory = { herb: 2 };
    consume(inventory, 'herb');
    expect(inventory).toEqual({ herb: 2 });
  });
});

describe('itemBlockReason', () => {
  const hurt = actor({ hp: 50 });

  it('가지고 있지 않으면 막는다', () => {
    expect(itemBlockReason({}, herb, hurt)).toMatch(/없다/);
  });

  it('온전한 대상에게 회복을 막는다 (아이템을 헛되이 소모하지 않는다)', () => {
    expect(itemBlockReason({ herb: 1 }, herb, actor())).toMatch(/온전/);
    expect(itemBlockReason({ herb: 1 }, herb, hurt)).toBeUndefined();
  });

  it('치료할 상태이상이 없으면 막는다', () => {
    expect(itemBlockReason({ antidote: 1 }, antidote, hurt)).toMatch(/상태이상이 없다/);

    const poisoned = actor({ ailments: [{ kind: 'poison', turns: 3 }] });
    expect(itemBlockReason({ antidote: 1 }, antidote, poisoned)).toBeUndefined();
  });

  it('침식이 없으면 정화석을 막는다', () => {
    expect(itemBlockReason({ 'cleansing-stone': 1 }, stone, hurt)).toMatch(/침식이 없다/);
    expect(
      itemBlockReason({ 'cleansing-stone': 1 }, stone, actor({ erosion: 30 })),
    ).toBeUndefined();
  });

  it('쓰러진 대상에게는 부활만 통한다', () => {
    const down = actor({ hp: 0 });
    expect(itemBlockReason({ herb: 1 }, herb, down)).toMatch(/이미 쓰러졌다/);
    expect(itemBlockReason({ 'ashen-ember': 1 }, ember, down)).toBeUndefined();
  });

  it('멀쩡한 대상에게 부활을 쓸 수 없다', () => {
    expect(itemBlockReason({ 'ashen-ember': 1 }, ember, hurt)).toMatch(/쓰러지지 않았다/);
  });
});

describe('applyItemEffect', () => {
  it('회복은 최대치에 막히고 실제 회복량을 보고한다', () => {
    const outcome = applyItemEffect(actor({ hp: 80 }), herb);
    expect(outcome.actor.hp).toBe(100);
    expect(outcome.healed).toBe(20); // 40 을 요청했지만 20만 들어갔다
  });

  it('해독은 해당하는 상태이상만 지운다', () => {
    const sick = actor({
      ailments: [
        { kind: 'poison', turns: 3 },
        { kind: 'silence', turns: 2 },
      ],
    });
    const outcome = applyItemEffect(sick, antidote);

    expect(outcome.cured).toEqual(['poison']);
    expect(outcome.actor.ailments).toEqual([{ kind: 'silence', turns: 2 }]);
  });

  it('정화석은 남은 침식만큼만 씻는다', () => {
    const outcome = applyItemEffect(actor({ erosion: 25 }), stone);
    expect(outcome.actor.erosion).toBe(0);
    expect(outcome.cleansed).toBe(25); // 40 을 씻을 수 있지만 25뿐이었다
  });

  it('부활은 최대 HP 의 비율로 일으킨다', () => {
    const outcome = applyItemEffect(actor({ hp: 0 }), ember);
    expect(outcome.revived).toBe(true);
    expect(outcome.actor.hp).toBe(35);
  });

  it('원본을 변경하지 않는다', () => {
    const original = actor({ hp: 50 });
    applyItemEffect(original, herb);
    expect(original.hp).toBe(50);
  });
});

describe('아이템 데이터', () => {
  it('레지스트리로 조회된다', () => {
    expect(item('herb').name).toBe('약초');
    expect(() => item('nope')).toThrow(/herb/);
  });

  it('키와 id 가 일치한다', () => {
    expect(itemRegistry.ids().sort()).toEqual(Object.keys(ITEMS).sort());
  });

  it('네 종류의 되돌리기를 모두 갖춘다', () => {
    // 하나라도 빠지면 그 축은 되돌릴 수 없는 축이 된다.
    const kinds = new Set(Object.values(ITEMS).map((entry) => entry.effect.kind));
    expect(kinds).toEqual(new Set(['heal', 'cure', 'cleanse', 'revive']));
  });

  it('효과 수치가 양수다', () => {
    for (const entry of Object.values(ITEMS)) {
      const { effect } = entry;
      if (effect.kind === 'heal') {
        // 아무것도 주지 않는 회복 아이템은 쓸 수 없는 물건이다 — 어느 쪽이든 하나는 줘야 한다.
        expect((effect.hp ?? 0) + (effect.mp ?? 0), entry.id).toBeGreaterThan(0);
      }
      if (effect.kind === 'cleanse') expect(effect.erosion, entry.id).toBeGreaterThan(0);
      if (effect.kind === 'revive') {
        expect(effect.hpRatio, entry.id).toBeGreaterThan(0);
        // 부활이 값싸면 전멸의 긴장이 사라진다.
        expect(effect.hpRatio, entry.id).toBeLessThan(0.5);
      }
      if (effect.kind === 'cure') expect(effect.ailments.length, entry.id).toBeGreaterThan(0);
    }
  });

  it('모든 상태이상에 치료 수단이 있다', () => {
    const curable = new Set(
      Object.values(ITEMS).flatMap((entry) =>
        entry.effect.kind === 'cure' ? [...entry.effect.ailments] : [],
      ),
    );
    expect(curable).toEqual(new Set(['poison', 'paralysis', 'sleep', 'silence', 'confusion']));
  });
});
