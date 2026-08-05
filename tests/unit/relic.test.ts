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

describe('침식 계수 (T-026)', () => {
  const erosionOf = (skills: readonly { id: string; erosion: number }[], id: string): number => {
    const found = skills.find((s) => s.id === id);
    if (found === undefined) throw new Error(`${id} 가 없습니다`);
    return found.erosion;
  };

  it('계수 1 이면 스킬 원래 값 그대로다', () => {
    // ember-coil 은 계수 1. 기준점이 되는 유물이다.
    expect(erosionOf(activesOf([relic('ember-coil')]), 'ember-lash')).toBe(skill('ember-lash').erosion);
  });

  it('같은 스킬이라도 계수가 큰 유물로 쓰면 더 쌓인다', () => {
    // 이게 "강한 유물일수록 빨리 폭주한다" 의 실체다 (GDD §5.4).
    const mild = erosionOf(activesOf([relic('ember-coil')]), 'ember-lash'); // ×1.0
    const harsh = erosionOf(activesOf([relic('sundering-core')]), 'ember-lash'); // ×1.4

    expect(harsh).toBeGreaterThan(mild);
    expect(harsh).toBe(Math.round(mild * 1.4));
  });

  it('계수가 1 미만이면 덜 쌓인다', () => {
    const base = skill('stone-fist').erosion;
    expect(erosionOf(activesOf([relic('stone-seal')]), 'stone-fist')).toBeLessThan(base); // ×0.8
  });

  it('두 유물이 같은 스킬을 주면 덜 침식되는 쪽을 쓴다', () => {
    // 둘 다 끼고 있는데 굳이 위험한 쪽으로 흘려보낼 이유가 없다.
    const both = activesOf([relic('sundering-core'), relic('ember-coil')]);
    expect(erosionOf(both, 'ember-lash')).toBe(skill('ember-lash').erosion);
  });

  it('완화 배수가 침식을 낮춘다', () => {
    const full = erosionOf(activesOf([relic('ember-coil')]), 'ember-lash');
    const relieved = erosionOf(activesOf([relic('ember-coil')], {}, 0.5), 'ember-lash');
    expect(relieved).toBeLessThan(full);
  });

  it('완화를 극단으로 걸어도 0 이 되지 않는다', () => {
    // 침식을 0으로 만들 수 있으면 침식이 리스크 축이 아니게 된다.
    expect(erosionOf(activesOf([relic('ember-coil')], {}, 0.0001), 'ember-lash')).toBe(1);
  });

  it('원본 스킬 데이터를 바꾸지 않는다', () => {
    const before = skill('ember-lash').erosion;
    activesOf([relic('sundering-core')]);
    expect(skill('ember-lash').erosion).toBe(before);
  });

  it('침식 외의 값은 그대로다', () => {
    const [lash] = activesOf([relic('sundering-core')]);
    expect(lash?.mpCost).toBe(skill('ember-lash').mpCost);
    expect(lash?.attack).toEqual(skill('ember-lash').attack);
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
    const duped: Relic = {
      ...valid,
      actives: [
        { skill: skill('ember-lash'), unlockRank: 0 },
        { skill: skill('ember-lash'), unlockRank: 1 },
      ],
    };
    expect(() => validateRelic(duped)).toThrow(/중복/);
  });

  it('0단계에 쓸 수 있는 액티브가 없으면 거부한다', () => {
    // 끼워도 아무 일이 일어나지 않는 유물이 된다.
    const locked: Relic = {
      ...valid,
      actives: [{ skill: skill('ember-lash'), unlockRank: 2 }],
    };
    expect(() => validateRelic(locked)).toThrow(/0단계/);
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

  it('시작 유물이 슬롯 수보다 많다 (그래야 고를 것이 생긴다)', () => {
    // T-029 에서 뜻이 뒤집혔다. 원래는 "슬롯을 넘지 않는다" 였는데, 그러면 전부 끼는 것이
    // 유일한 답이라 장착 화면에 고를 것이 없다. 조합이 게임의 중심이라면 첫 화면부터
    // 선택이 성립해야 한다.
    expect(STARTING_RELICS.length).toBeGreaterThan(2 * SLOTS_PER_MEMBER);
  });

  it('시작 유물에 등급이 섞여 있다', () => {
    // 전부 같은 등급이면 "안전한 것 대 센 것" 이라는 축이 첫 선택에 나타나지 않는다.
    const tiers = new Set(STARTING_RELICS.map((id) => relic(id).tier));
    expect(tiers.size).toBeGreaterThan(1);
  });
});
