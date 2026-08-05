import { beforeEach, describe, expect, it } from 'vitest';
import { equip, equippedBy, unequip } from '../../src/core/relic/index.js';
import {
  getLoadout,
  ownedRelics,
  partyForBattle,
  partySkills,
  resetParty,
  saveParty,
  setLoadout,
} from '../../src/game/partyStore.js';
import { relic } from '../../src/data/relics.js';

/**
 * 유물이 능력의 출처가 되는지 확인한다 (ADR-004).
 *
 * 이 모듈은 게임 레이어지만 Phaser 를 쓰지 않으므로 헤드리스로 검사할 수 있다.
 */
describe('partyStore', () => {
  beforeEach(() => {
    resetParty();
  });

  it('처음에는 가진 유물이 순서대로 끼워져 있다', () => {
    const loadout = getLoadout();
    const equipped = Object.values(loadout).flat().filter(Boolean);
    expect(equipped).toEqual([...ownedRelics()]);
  });

  it('스킬이 장착 유물에서 나온다', () => {
    const skills = partySkills();
    const vanguardSkills = skills['vanguard'] ?? [];

    // 기본 로드아웃에서 vanguard 는 ember-coil 을 낀다 → ember-lash 를 쓸 수 있다.
    expect(vanguardSkills.map((s) => s.id)).toEqual(['ember-lash']);
  });

  it('유물을 빼면 그 스킬도 사라진다', () => {
    setLoadout(unequip(getLoadout(), 'vanguard', 0));
    expect(partySkills()['vanguard']).toEqual([]);
  });

  it('유물을 바꾸면 쓸 수 있는 스킬이 바뀐다', () => {
    // stone-seal 은 기본 배분에서 caster 가 지니고 있다. 먼저 빼야 옮길 수 있다.
    let loadout = unequip(getLoadout(), 'vanguard', 0);
    loadout = unequip(loadout, 'caster', 0);
    loadout = equip(loadout, 'vanguard', 0, 'stone-seal', ownedRelics());
    setLoadout(loadout);

    expect((partySkills()['vanguard'] ?? []).map((s) => s.id)).toEqual(['stone-fist']);
  });

  it('유물 스탯 보정이 전투 스탯에 반영된다', () => {
    const withRelic = partyForBattle().find((m) => m.id === 'vanguard');

    setLoadout(unequip(getLoadout(), 'vanguard', 0));
    const without = partyForBattle().find((m) => m.id === 'vanguard');

    const mods = relic('ember-coil').statMods;
    expect((withRelic?.stats.mag ?? 0) - (without?.stats.mag ?? 0)).toBe(mods.mag);
    expect((withRelic?.stats.maxMp ?? 0) - (without?.stats.maxMp ?? 0)).toBe(mods.maxMp);
  });

  it('보정이 겹쳐 쌓이지 않는다 (전투를 여러 번 치러도)', () => {
    // 스탯을 저장하면 매 전투마다 보정이 다시 더해진다. 저장하는 것은 다친 정도뿐이다.
    const first = partyForBattle();
    saveParty(first);
    const second = partyForBattle();

    expect(second[0]?.stats).toEqual(first[0]?.stats);
  });

  it('HP·MP 는 이어지되 새 최대치를 넘지 않는다', () => {
    const party = partyForBattle();
    const hurt = party.map((m) => ({ ...m, hp: 5, mp: 1 }));
    saveParty(hurt);

    const next = partyForBattle();
    expect(next[0]?.hp).toBe(5);
    expect(next[0]?.mp).toBe(1);
  });

  it('유물을 빼서 최대치가 줄면 현재 값도 잘린다', () => {
    const full = partyForBattle();
    saveParty(full); // MP 가 최대인 상태로 저장

    setLoadout(unequip(getLoadout(), 'vanguard', 0)); // maxMp +3 이 사라진다
    const after = partyForBattle().find((m) => m.id === 'vanguard');

    expect(after?.mp).toBe(after?.stats.maxMp);
  });

  it('전멸 후 초기화하면 로드아웃과 상태가 되돌아간다', () => {
    setLoadout(unequip(getLoadout(), 'vanguard', 0));
    saveParty(partyForBattle().map((m) => ({ ...m, hp: 1 })));

    resetParty();

    expect(equippedBy(getLoadout(), 'vanguard')).toHaveLength(1);
    expect(partyForBattle()[0]?.hp).toBe(partyForBattle()[0]?.stats.maxHp);
  });
});
