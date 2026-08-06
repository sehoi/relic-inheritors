import { beforeEach, describe, expect, it } from 'vitest';
import {
  SLOTS_PER_MEMBER,
  activesOf,
  equip,
  equippedBy,
  unequip,
} from '../../src/core/relic/index.js';
import {
  captureSave,
  currentResonances,
  gainCoins,
  getAttunement,
  getInventory,
  getLoadout,
  ownedRelics,
  recordSkillUses,
  relicRanks,
  partyForBattle,
  partySkills,
  resetParty,
  restAtInn,
  restoreSave,
  saveInventory,
  saveParty,
  setLoadout,
  settleVictory,
  worldRandom,
} from '../../src/game/partyStore.js';
import {
  parseSave,
  validateSaveReferences,
  type SavedLocation,
} from '../../src/core/save/index.js';
import { LEVEL_UP_RECOVERY } from '../../src/data/battle.js';
import { ITEMS } from '../../src/data/items.js';
import { MAP_IDS } from '../../src/data/maps.js';
import { RELICS, relic } from '../../src/data/relics.js';
import { resonance } from '../../src/data/resonances.js';

/**
 * 유물이 능력의 출처가 되는지 확인한다 (ADR-004).
 *
 * 이 모듈은 게임 레이어지만 Phaser 를 쓰지 않으므로 헤드리스로 검사할 수 있다.
 */
describe('partyStore', () => {
  beforeEach(() => {
    resetParty();
  });

  it('처음에는 슬롯이 빠짐없이 채워져 있다', () => {
    // 지닌 유물이 슬롯보다 많으므로(T-029) 전부 끼워지지는 않는다.
    // 중요한 것은 **빈 슬롯 없이 시작한다**는 것 — 빈 슬롯으로 시작하면 첫 전투가 허수아비다.
    const equipped = Object.values(getLoadout()).flat().filter(Boolean);
    expect(equipped).toHaveLength(2 * SLOTS_PER_MEMBER);
    expect(new Set(equipped).size, '같은 유물이 두 번 끼워져 있다').toBe(equipped.length);
    for (const id of equipped) expect(ownedRelics()).toContain(id);
  });

  it('스킬이 장착 유물에서 나온다', () => {
    const holding = equippedBy(getLoadout(), 'vanguard');
    const expected = activesOf(
      holding.map((id) => relic(id)),
      relicRanks(),
    ).map((s) => s.id);

    expect(expected.length, 'vanguard 가 아무 유물도 끼지 않았다').toBeGreaterThan(0);
    expect((partySkills()['vanguard'] ?? []).map((s) => s.id)).toEqual(expected);
  });

  it('유물을 빼면 그 스킬도 사라진다', () => {
    const removed = relic(equippedBy(getLoadout(), 'vanguard')[0] as string);
    const gone = removed.actives.map((a) => a.skill.id);

    setLoadout(unequip(getLoadout(), 'vanguard', 0));

    const left = (partySkills()['vanguard'] ?? []).map((s) => s.id);
    for (const skillId of gone) expect(left, `${skillId} 가 남아 있다`).not.toContain(skillId);
  });

  it('유물을 바꾸면 쓸 수 있는 스킬이 바뀐다', () => {
    // stone-seal 은 기본 배분에서 caster 가 지니고 있다. 먼저 빼야 옮길 수 있다.
    let loadout = unequip(getLoadout(), 'vanguard', 0);
    loadout = unequip(loadout, 'caster', 0);
    loadout = equip(loadout, 'vanguard', 0, 'stone-seal', ownedRelics());
    setLoadout(loadout);

    const skills = (partySkills()['vanguard'] ?? []).map((s) => s.id);
    expect(skills).toContain('stone-fist');
    expect(skills, '뺀 유물의 스킬이 남아 있다').not.toContain('ember-lash');
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

  it('공명이 발동하고 파티 전원에게 붙는다', () => {
    // 시작 배분은 잿불 고리(ember) + 돌의 봉인(stone) → `묻어둔 불` 발동.
    expect(currentResonances().map((r) => r.id)).toEqual(['banked-fire']);

    const withResonance = partyForBattle();

    // 조건을 깨면 공명이 사라지고 보정도 함께 사라진다.
    setLoadout(unequip(getLoadout(), 'caster', 0));
    expect(currentResonances()).toEqual([]);
    const without = partyForBattle();

    const mods = resonance('banked-fire').statMods;
    for (const member of withResonance) {
      const bare = without.find((m) => m.id === member.id);
      if (member.id === 'caster') continue; // 유물 자체를 뺐으므로 다른 차이가 섞인다
      expect(member.stats.atk - (bare?.stats.atk ?? 0), member.id).toBe(mods.atk);
      expect(member.stats.def - (bare?.stats.def ?? 0), member.id).toBe(mods.def);
    }
  });

  it('숙련도가 착용자가 아니라 유물에 쌓인다 (GDD §5.3)', () => {
    // vanguard 가 잿불 고리로 불꽃 채찍을 네 번 쓴다 → 1단계.
    recordSkillUses({ 'ember-lash': 4 });
    expect(relicRanks()['ember-coil']).toBe(1);

    // 유물을 caster 에게 옮겨도 숙련도는 그대로다.
    let loadout = unequip(getLoadout(), 'vanguard', 0);
    loadout = unequip(loadout, 'caster', 0);
    loadout = equip(loadout, 'caster', 0, 'ember-coil', ownedRelics());
    setLoadout(loadout);

    expect(relicRanks()['ember-coil']).toBe(1);
    expect(getAttunement()['ember-coil']).toBe(20);
  });

  it('끼우지 않은 유물에는 쌓이지 않는다', () => {
    recordSkillUses({ 'sundering-arc': 10 }); // sundering-core 는 장착돼 있지 않다
    expect(getAttunement()['sundering-core']).toBeUndefined();
  });

  describe('승리 정산 (T-046)', () => {
    const RECOVERY = { mpPerEnemy: 1 };

    /** MP 를 바닥낸 파티. 소모전 후반의 모습이다. */
    function drained(): ReturnType<typeof partyForBattle> {
      return partyForBattle().map((m) => ({ ...m, hp: 20, mp: 0 }));
    }

    it('적을 쓰러뜨린 만큼 MP 가 돌아온다', () => {
      const result = settleVictory(drained(), getInventory(), {}, 3, 0, RECOVERY);
      expect(result.mpRecovered).toBeGreaterThan(0);
      for (const member of partyForBattle()) expect(member.mp).toBe(3);
    });

    it('HP 는 돌아오지 않는다 (소모전의 축이다)', () => {
      settleVictory(drained(), getInventory(), {}, 2, 0, RECOVERY);
      for (const member of partyForBattle()) expect(member.hp).toBe(20);
    });

    it('최대 MP 를 넘지 않는다', () => {
      const full = partyForBattle();
      settleVictory(full, getInventory(), {}, 99, 0, RECOVERY);
      for (const member of partyForBattle()) {
        expect(member.mp).toBe(member.stats.maxMp);
      }
    });

    it('쓰러진 파티원은 회복하지 않는다', () => {
      const fallen = partyForBattle().map((m) => ({ ...m, hp: 0, mp: 0 }));
      settleVictory(fallen, getInventory(), {}, 3, 0, RECOVERY);
      expect(partyForBattle()[0]?.mp).toBe(0);
    });

    it('레벨이 오르면 최대치의 일부가 돌아온다 (T-049c)', () => {
      // **완전 회복이 아니다.** 완전 회복이던 시절에는 소모전이 사라졌다 —
      // 이기는 동안 자원이 계속 채워져, 지는 방식이 "한 판을 진다" 하나만 남았다.
      const result = settleVictory(drained(), getInventory(), {}, 2, 10_000, RECOVERY);
      expect(result.levelledTo).toBeDefined();

      for (const member of partyForBattle()) {
        const healed = 20 + Math.round(member.stats.maxHp * LEVEL_UP_RECOVERY.hpRatio);
        expect(member.hp).toBe(Math.min(member.stats.maxHp, healed));
        // 바닥에서 올라왔으므로 아직 최대치는 아니어야 한다 — 그러지 않으면 다시 완전 회복이다.
        expect(member.hp).toBeLessThan(member.stats.maxHp);
      }
    });

    it('레벨업 회복이 MP 회복을 덮지 않는다', () => {
      // 레벨업 회복이 먼저 적용되면 MP 회복이 사라진 것처럼 보인다. 순서가 중요하다.
      // 완전 회복이던 시절에는 이 성질을 잴 수 없었다 — 어느 쪽이든 최대치였기 때문이다.
      const withoutKills = settleVictory(drained(), getInventory(), {}, 0, 10_000, RECOVERY);
      const mpWithoutKills = partyForBattle().map((m) => m.mp);

      resetParty();
      const withKills = settleVictory(drained(), getInventory(), {}, 3, 10_000, RECOVERY);

      expect(withoutKills.levelledTo).toBeDefined();
      expect(withKills.levelledTo).toBeDefined();
      partyForBattle().forEach((member, i) => {
        expect(member.mp).toBe((mpWithoutKills[i] ?? 0) + 3);
      });
    });

    it('숙련도와 소지품도 함께 반영된다', () => {
      settleVictory(drained(), { herb: 1 }, { 'ember-lash': 4 }, 1, 0, RECOVERY);
      expect(getInventory()).toEqual({ herb: 1 });
      expect(relicRanks()['ember-coil']).toBe(1);
    });
  });

  describe('여관 (T-049c)', () => {
    it('최대 HP 를 올려주는 유물을 껴도 가득 찬다', () => {
      // **조용히 틀리던 곳이다.** 여관이 기본 스탯으로 채우고 있어서, 최대 HP 를 올리는
      // 유물을 낀 파티는 자고 나와도 그 유물이 준 만큼이 영영 비어 있었다.
      // 화면에는 "HP 252/270" 처럼 보이는데 여관은 제 할 일을 다 했다고 말한다.
      const member = partyForBattle()[0];
      if (member === undefined) throw new Error('파티가 비어 있습니다');

      const bare = member.stats.maxHp;
      setLoadout({ ...getLoadout(), [member.id]: ['bulwark-ring', null] });

      const equipped = partyForBattle()[0];
      expect(equipped?.stats.maxHp, '유물이 최대 HP 를 올려야 이 테스트가 성립한다').toBeGreaterThan(
        bare,
      );

      saveParty(partyForBattle().map((m) => ({ ...m, hp: 1, mp: 0 })));
      gainCoins(999);
      expect(restAtInn(10)).toBe(10);

      for (const rested of partyForBattle()) {
        expect(rested.hp, rested.id).toBe(rested.stats.maxHp);
        expect(rested.mp, rested.id).toBe(rested.stats.maxMp);
      }
    });
  });

  describe('세이브 (T-037)', () => {
    const HERE: SavedLocation = { mapId: 'ruin-entrance', x: 8, y: 6, facing: 'down' };
    const META = { savedAt: 1_760_000_000_000, playtimeMs: 90_000 };

    /** 기본값과 구분되는 상태를 만든다. 전부 기본값이면 복원이 됐는지 알 수 없다. */
    function scramble(): void {
      setLoadout(unequip(getLoadout(), 'vanguard', 0));
      recordSkillUses({ 'ember-lash': 3 });
      saveParty(partyForBattle().map((m) => ({ ...m, hp: 7, mp: 2, erosion: 11 })));
      saveInventory({ herb: 1 });
      worldRandom().int(1, 100); // 난수를 소비해 상태를 옮긴다
    }

    it('뜬 세이브가 스키마를 통과한다', () => {
      scramble();
      // JSON 을 거쳐야 실제 저장 경로와 같아진다 — 직렬화되지 않는 값이 섞이면 여기서 걸린다.
      const raw: unknown = JSON.parse(JSON.stringify(captureSave(HERE, META)));
      expect(() => parseSave(raw)).not.toThrow();
    });

    it('뜬 세이브가 실제 콘텐츠만 가리킨다', () => {
      const save = parseSave(JSON.parse(JSON.stringify(captureSave(HERE, META))));
      expect(() =>
        validateSaveReferences(save, {
          relics: Object.keys(RELICS),
          maps: [...MAP_IDS],
          items: Object.keys(ITEMS),
        }),
      ).not.toThrow();
    });

    it('저장하고 불러오면 상태가 그대로 돌아온다', () => {
      scramble();
      const save = parseSave(JSON.parse(JSON.stringify(captureSave(HERE, META))));

      const before = {
        loadout: getLoadout(),
        attunement: { ...getAttunement() },
        inventory: { ...getInventory() },
        owned: [...ownedRelics()],
        party: partyForBattle().map((m) => ({ id: m.id, hp: m.hp, mp: m.mp, erosion: m.erosion })),
        resonances: currentResonances().map((r) => r.id),
      };

      resetParty();
      restoreSave(save);

      expect(getLoadout()).toEqual(before.loadout);
      expect(getAttunement()).toEqual(before.attunement);
      expect(getInventory()).toEqual(before.inventory);
      expect(ownedRelics()).toEqual(before.owned);
      expect(currentResonances().map((r) => r.id)).toEqual(before.resonances);
      expect(
        partyForBattle().map((m) => ({ id: m.id, hp: m.hp, mp: m.mp, erosion: m.erosion })),
      ).toEqual(before.party);
    });

    it('불러온 뒤 월드 난수가 이어진다 (저장·로드로 조우를 조작할 수 없다)', () => {
      // 시드만 저장했다면 여기서 수열이 처음으로 되돌아간다 (ADR-002).
      const save = parseSave(JSON.parse(JSON.stringify(captureSave(HERE, META))));
      const expected = Array.from({ length: 5 }, () => worldRandom().int(1, 1000));

      resetParty();
      restoreSave(save);

      expect(Array.from({ length: 5 }, () => worldRandom().int(1, 1000))).toEqual(expected);
    });

    it('숙련도가 세이브를 건너 살아남는다 (GDD §5.3)', () => {
      recordSkillUses({ 'ember-lash': 4 });
      const save = parseSave(JSON.parse(JSON.stringify(captureSave(HERE, META))));

      resetParty();
      expect(relicRanks()['ember-coil']).toBe(0);

      restoreSave(save);
      expect(relicRanks()['ember-coil']).toBe(1);
    });

    it('스탯은 저장하지 않는다 (불러올 때마다 보정이 겹쳐 쌓인다)', () => {
      const save = captureSave(HERE, META);
      expect(JSON.stringify(save)).not.toContain('maxHp');
    });
  });

  it('전멸 후 초기화하면 로드아웃과 상태가 되돌아간다', () => {
    setLoadout(unequip(getLoadout(), 'vanguard', 0));
    saveParty(partyForBattle().map((m) => ({ ...m, hp: 1 })));

    resetParty();

    expect(equippedBy(getLoadout(), 'vanguard')).toHaveLength(SLOTS_PER_MEMBER);
    expect(partyForBattle()[0]?.hp).toBe(partyForBattle()[0]?.stats.maxHp);
  });
});
