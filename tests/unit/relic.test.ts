import { describe, expect, it } from 'vitest';
import type { Stats } from '../../src/core/battle/index.js';
import {
  SLOTS_PER_MEMBER,
  activesOf,
  allEquipped,
  applyStatMods,
  createLoadout,
  equip,
  equipBlockReason,
  equippedBy,
  holderOf,
  slotsOf,
  sumStatMods,
  unequip,
  validateRelic,
  type Relic,
} from '../../src/core/relic/index.js';
import { RELICS, STARTING_RELICS, relic, relicRegistry } from '../../src/data/relics.js';
import { skill } from '../../src/data/skills.js';

const MEMBERS = ['vanguard', 'caster'];
const OWNED = ['ember-coil', 'stone-seal', 'sundering-core'];

const base: Stats = { maxHp: 100, maxMp: 20, atk: 40, def: 20, mag: 30, res: 15, agi: 10, luk: 5 };

describe('createLoadout', () => {
  it('구성원마다 빈 슬롯을 만든다', () => {
    const loadout = createLoadout(MEMBERS);
    expect(slotsOf(loadout, 'vanguard')).toEqual([null, null]);
    expect(slotsOf(loadout, 'caster')).toHaveLength(SLOTS_PER_MEMBER);
  });

  it('없는 구성원을 조회하면 대상 목록과 함께 던진다', () => {
    expect(() => slotsOf(createLoadout(MEMBERS), 'ghost')).toThrow(/vanguard, caster/);
  });
});

describe('equip / unequip', () => {
  it('슬롯에 끼우고 뺀다', () => {
    let loadout = createLoadout(MEMBERS);
    loadout = equip(loadout, 'vanguard', 0, 'ember-coil', OWNED);

    expect(equippedBy(loadout, 'vanguard')).toEqual(['ember-coil']);
    expect(holderOf(loadout, 'ember-coil')).toBe('vanguard');

    loadout = unequip(loadout, 'vanguard', 0);
    expect(equippedBy(loadout, 'vanguard')).toEqual([]);
  });

  it('파티 전체 장착 목록을 모은다 (공명 판정의 입력)', () => {
    let loadout = createLoadout(MEMBERS);
    loadout = equip(loadout, 'vanguard', 0, 'ember-coil', OWNED);
    loadout = equip(loadout, 'caster', 1, 'sundering-core', OWNED);

    expect([...allEquipped(loadout)].sort()).toEqual(['ember-coil', 'sundering-core']);
  });

  it('같은 슬롯에 다시 끼우면 교체된다', () => {
    let loadout = createLoadout(MEMBERS);
    loadout = equip(loadout, 'vanguard', 0, 'ember-coil', OWNED);
    loadout = equip(loadout, 'vanguard', 0, 'stone-seal', OWNED);

    expect(equippedBy(loadout, 'vanguard')).toEqual(['stone-seal']);
    expect(holderOf(loadout, 'ember-coil')).toBeUndefined();
  });

  it('원본을 변경하지 않는다', () => {
    const loadout = createLoadout(MEMBERS);
    equip(loadout, 'vanguard', 0, 'ember-coil', OWNED);
    expect(equippedBy(loadout, 'vanguard')).toEqual([]);
  });

  it('범위 밖 슬롯을 거부한다', () => {
    expect(() => unequip(createLoadout(MEMBERS), 'vanguard', 5)).toThrow(RangeError);
  });
});

describe('equipBlockReason', () => {
  it('장착 가능하면 undefined 다', () => {
    expect(
      equipBlockReason(createLoadout(MEMBERS), 'vanguard', 0, 'ember-coil', OWNED),
    ).toBeUndefined();
  });

  it('가지고 있지 않은 유물을 거부한다', () => {
    expect(equipBlockReason(createLoadout(MEMBERS), 'vanguard', 0, 'ghost-relic', OWNED)).toMatch(
      /가지고 있지 않은/,
    );
  });

  it('같은 유물을 둘이 나눠 낄 수 없다', () => {
    // 허용하면 유물 하나로 조합 공간을 부풀릴 수 있다.
    const loadout = equip(createLoadout(MEMBERS), 'vanguard', 0, 'ember-coil', OWNED);
    expect(equipBlockReason(loadout, 'caster', 0, 'ember-coil', OWNED)).toMatch(/vanguard/);
  });

  it('같은 사람의 다른 슬롯에도 중복 장착할 수 없다', () => {
    const loadout = equip(createLoadout(MEMBERS), 'vanguard', 0, 'ember-coil', OWNED);
    expect(equipBlockReason(loadout, 'vanguard', 1, 'ember-coil', OWNED)).toMatch(/다른 슬롯/);
  });

  it('이미 끼워진 슬롯에 같은 유물을 다시 끼우는 것은 허용한다', () => {
    const loadout = equip(createLoadout(MEMBERS), 'vanguard', 0, 'ember-coil', OWNED);
    expect(equipBlockReason(loadout, 'vanguard', 0, 'ember-coil', OWNED)).toBeUndefined();
  });

  it('범위 밖 슬롯을 거부한다', () => {
    expect(equipBlockReason(createLoadout(MEMBERS), 'vanguard', 9, 'ember-coil', OWNED)).toMatch(
      /범위/,
    );
  });

  it('equip 은 사유를 담아 던진다', () => {
    expect(() => equip(createLoadout(MEMBERS), 'vanguard', 0, 'nope', OWNED)).toThrow(
      /가지고 있지 않은/,
    );
  });
});

describe('스탯 보정', () => {
  it('여러 유물의 보정을 합산한다', () => {
    const mods = sumStatMods([relic('ember-coil'), relic('sundering-core')]);
    expect(mods.mag).toBe(13); // 4 + 9
    expect(mods.maxMp).toBe(9); // 3 + 6
    expect(mods.res).toBe(-3);
  });

  it('보정을 기본 스탯에 더한다', () => {
    const result = applyStatMods(base, { atk: 5, def: -3 });
    expect(result.atk).toBe(45);
    expect(result.def).toBe(17);
    expect(result.mag).toBe(30);
  });

  it('음수로 내려가지 않는다 (데미지 공식이 이상해진다)', () => {
    expect(applyStatMods(base, { def: -999 }).def).toBe(0);
    expect(applyStatMods(base, { maxHp: -999 }).maxHp).toBe(1);
  });

  it('보정이 없으면 그대로다', () => {
    expect(applyStatMods(base, {})).toEqual(base);
  });
});

describe('activesOf', () => {
  it('장착 유물의 스킬을 모은다', () => {
    const skills = activesOf([relic('ember-coil'), relic('stone-seal')]);
    expect(skills.map((s) => s.id).sort()).toEqual(['ember-lash', 'stone-fist']);
  });

  it('같은 스킬이 두 유물에 있어도 한 번만 나온다', () => {
    const skills = activesOf([relic('ember-coil'), relic('sundering-core')]);
    expect(skills.filter((s) => s.id === 'ember-lash')).toHaveLength(1);
  });
});

describe('validateRelic', () => {
  const valid = relic('ember-coil');

  it('정상 유물을 통과시킨다', () => {
    expect(() => validateRelic(valid)).not.toThrow();
  });

  it('등급 범위를 검사한다', () => {
    expect(() => validateRelic({ ...valid, tier: 0 })).toThrow(/tier/);
    expect(() => validateRelic({ ...valid, tier: 6 })).toThrow(/tier/);
  });

  it('태그 없는 유물을 거부한다 (어떤 공명에도 기여하지 못한다)', () => {
    expect(() => validateRelic({ ...valid, tags: [] })).toThrow(/공명/);
  });

  it('액티브 없는 유물을 거부한다 (능력의 출처가 유물이다)', () => {
    expect(() => validateRelic({ ...valid, actives: [] })).toThrow(/actives/);
  });

  it('기록 없는 유물을 거부한다 (유물이 곧 서사 단위다)', () => {
    expect(() => validateRelic({ ...valid, lore: '  ' })).toThrow(/lore/);
  });

  it('침식 계수가 양수여야 한다', () => {
    expect(() => validateRelic({ ...valid, erosionFactor: 0 })).toThrow(/erosionFactor/);
  });

  it('같은 액티브를 중복으로 담을 수 없다', () => {
    const duped: Relic = { ...valid, actives: [skill('ember-lash'), skill('ember-lash')] };
    expect(() => validateRelic(duped)).toThrow(/중복/);
  });
});

describe('유물 데이터', () => {
  it('레지스트리로 조회된다', () => {
    expect(relic('ember-coil').name).toBe('잿불 고리');
    expect(() => relic('nope')).toThrow(/ember-coil/);
    expect(relicRegistry.ids().sort()).toEqual(Object.keys(RELICS).sort());
  });

  it('모든 유물이 스키마를 통과한다', () => {
    for (const entry of Object.values(RELICS)) {
      expect(() => validateRelic(entry), entry.id).not.toThrow();
    }
  });

  it('등급이 높을수록 침식 계수가 크다', () => {
    // 강한 유물일수록 빨리 폭주해야 "가장 센 것만 계속 쓴다" 가 정답이 되지 않는다.
    const byTier = Object.values(RELICS).sort((a, b) => a.tier - b.tier);
    for (let i = 1; i < byTier.length; i += 1) {
      const weaker = byTier[i - 1] as Relic;
      const stronger = byTier[i] as Relic;
      if (stronger.tier === weaker.tier) continue;
      expect(stronger.erosionFactor, `${stronger.id} vs ${weaker.id}`).toBeGreaterThan(
        weaker.erosionFactor,
      );
    }
  });

  it('시작 유물이 실제로 존재한다', () => {
    expect(relicRegistry.missing([...STARTING_RELICS])).toEqual([]);
  });

  it('시작 유물이 파티 슬롯 수를 넘지 않는다', () => {
    expect(STARTING_RELICS.length).toBeLessThanOrEqual(2 * SLOTS_PER_MEMBER);
  });
});
