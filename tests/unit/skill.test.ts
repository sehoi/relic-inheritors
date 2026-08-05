import { describe, expect, it } from 'vitest';
import type { BattleActor } from '../../src/core/battle/index.js';
import {
  applySkillCost,
  canUseSkill,
  effectivePower,
  erosionCap,
  erosionThreshold,
  isOverloaded,
  relieveErosion,
  skillBlockReason,
  type ErosionTuning,
  type Skill,
} from '../../src/core/battle/skill.js';
import { AILMENT_POWER } from '../../src/data/battle.js';
import { SKILLS, skill, skillRegistry } from '../../src/data/skills.js';

/** 최대 MP 20 인 표본 기준 임계 100. perMaxMp 0 으로 두면 고정 임계처럼 읽힌다. */
const EROSION: ErosionTuning = { base: 100, perMaxMp: 0, reliefRatio: 0.5, maxMultiplier: 2 };

/** 임계가 최대 MP 에 비례하는 실제 설정 (ADR-010). */
const SCALED: ErosionTuning = { base: 10, perMaxMp: 2.2, reliefRatio: 0.5, maxMultiplier: 2 };

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

const cheap: Skill = {
  id: 'cheap',
  name: '작은 불씨',
  mpCost: 4,
  erosion: 12,
  attack: { power: 130, element: 'fire', kind: 'magical' },
};

describe('isOverloaded', () => {
  it('임계에 닿으면 폭주 상태다', () => {
    expect(isOverloaded(actor({ erosion: 99 }), EROSION)).toBe(false);
    expect(isOverloaded(actor({ erosion: 100 }), EROSION)).toBe(true);
    expect(isOverloaded(actor({ erosion: 150 }), EROSION)).toBe(true);
  });
});

describe('skillBlockReason', () => {
  it('쓸 수 있으면 undefined 다', () => {
    expect(skillBlockReason(actor(), cheap, EROSION)).toBeUndefined();
    expect(canUseSkill(actor(), cheap, EROSION)).toBe(true);
  });

  it('MP 가 모자라면 얼마나 모자란지 알려준다', () => {
    const reason = skillBlockReason(actor({ mp: 1 }), cheap, EROSION);
    expect(reason).toMatch(/MP/);
    expect(reason).toContain('1/4');
  });

  it('폭주 중이면 유물이 봉인된다', () => {
    expect(skillBlockReason(actor({ erosion: 120 }), cheap, EROSION)).toMatch(/봉인/);
  });

  it('불리언이 아니라 이유를 돌려준다 (UI 가 왜 회색인지 보여줘야 한다)', () => {
    expect(typeof skillBlockReason(actor({ mp: 0 }), cheap, EROSION)).toBe('string');
  });
});

describe('applySkillCost', () => {
  it('MP 를 깎고 침식을 쌓는다', () => {
    const after = applySkillCost(actor(), cheap, EROSION);
    expect(after.mp).toBe(16);
    expect(after.erosion).toBe(12);
  });

  it('침식은 상한을 넘지 않는다', () => {
    const heavy: Skill = { ...cheap, erosion: 500 };
    expect(applySkillCost(actor(), heavy, EROSION).erosion).toBe(200); // 임계 100 × 배수 2
  });

  it('MP 는 음수가 되지 않는다', () => {
    expect(applySkillCost(actor({ mp: 1 }), cheap, EROSION).mp).toBe(0);
  });

  it('원본을 변경하지 않는다', () => {
    const original = actor();
    applySkillCost(original, cheap, EROSION);
    expect(original.mp).toBe(20);
    expect(original.erosion).toBe(0);
  });
});

describe('relieveErosion', () => {
  it('일부만 해소된다 — 완전히 씻기면 일부러 폭주시키는 것이 최적이 된다', () => {
    expect(relieveErosion(actor({ erosion: 100 }), EROSION).erosion).toBe(50);
    expect(relieveErosion(actor({ erosion: 121 }), EROSION).erosion).toBe(60);
  });

  it('해소 후에는 폭주 상태가 풀린다', () => {
    const relieved = relieveErosion(actor({ erosion: 100 }), EROSION);
    expect(isOverloaded(relieved, EROSION)).toBe(false);
  });
});

describe('침식 임계 스케일링 (ADR-010)', () => {
  const withMp = (maxMp: number): BattleActor => ({
    ...actor(),
    stats: { ...actor().stats, maxMp },
  });

  it('최대 MP 가 클수록 임계가 높다', () => {
    expect(erosionThreshold(withMp(20), SCALED)).toBeCloseTo(54, 5);
    expect(erosionThreshold(withMp(50), SCALED)).toBeCloseTo(120, 5);
    expect(erosionThreshold(withMp(90), SCALED)).toBeCloseTo(208, 5);
  });

  it('"MP 를 얼마나 쓰면 폭주하는가" 가 레벨과 크게 달라지지 않는다', () => {
    // 이게 이 변경의 목적이다 (ADR-010). 고정 임계였을 때는 이 비율이
    // 저레벨 1.0(폭주 없음)에서 고레벨 0.4 이하로 무너졌다.
    //
    // 정확히 일정하지는 않다 — `base` 항이 저레벨의 임계를 일부러 끌어올려
    // 초반을 덜 가혹하게 만든다. 중요한 것은 **경향이 뒤집히지 않는 것**이다.
    const pressure = (maxMp: number): number =>
      erosionThreshold(withMp(maxMp), SCALED) / cheap.erosion / (maxMp / cheap.mpCost);

    const ratios = [20, 50, 90].map(pressure);
    const spread = Math.max(...ratios) - Math.min(...ratios);

    expect(spread, `레벨별 비율: ${ratios.map((r) => r.toFixed(2)).join(' / ')}`).toBeLessThan(0.25);
    // 어느 레벨에서도 "MP 를 다 쓰기 전에 폭주" 라는 성질은 유지된다.
    for (const ratio of ratios) expect(ratio).toBeLessThan(1);
  });

  it('상한도 임계에 비례한다', () => {
    expect(erosionCap(withMp(50), SCALED)).toBeCloseTo(240, 5);
  });

  it('perMaxMp 0 이면 고정 임계처럼 동작한다', () => {
    expect(erosionThreshold(withMp(20), EROSION)).toBe(100);
    expect(erosionThreshold(withMp(90), EROSION)).toBe(100);
  });
});

describe('스킬 데이터', () => {
  it('레지스트리로 조회된다', () => {
    expect(skill('ember-lash').name).toBe('불꽃 채찍');
    expect(() => skill('nope')).toThrow(/ember-lash/);
  });

  it('키와 id 가 일치한다', () => {
    expect(skillRegistry.ids().sort()).toEqual(Object.keys(SKILLS).sort());
  });

  it('실효 위력이 높을수록 침식도 크다 (비례가 무너지면 조합 설계가 무의미해진다)', () => {
    // **순수 위력이 아니라 실효 위력**으로 잰다. 상태이상은 위력에 잡히지 않는 값어치가 있어서,
    // 위력만 보고 침식을 매기면 상태이상 스킬이 침식당 값어치가 가장 높아진다 —
    // 그러면 "싸고 센 것만 계속 쓴다" 가 정답이 된다.
    const power = (s: Skill): number => effectivePower(s, AILMENT_POWER);
    const ordered = Object.values(SKILLS).sort((a, b) => power(a) - power(b));

    for (let i = 1; i < ordered.length; i += 1) {
      const weaker = ordered[i - 1] as Skill;
      const stronger = ordered[i] as Skill;
      expect(
        stronger.erosion,
        `${stronger.id}(실효 ${power(stronger)}) vs ${weaker.id}(실효 ${power(weaker)})`,
      ).toBeGreaterThan(weaker.erosion);
    }
  });

  it('상태이상이 실효 위력에 반영된다', () => {
    expect(effectivePower(skill('ember-lash'), AILMENT_POWER)).toBe(130); // 상태이상 없음
    expect(effectivePower(skill('hollow-bite'), AILMENT_POWER)).toBe(105 + 80 * 0.35);
  });

  it('모든 스킬이 양수 비용을 갖는다', () => {
    for (const s of Object.values(SKILLS)) {
      expect(s.mpCost, s.id).toBeGreaterThan(0);
      expect(s.erosion, s.id).toBeGreaterThan(0);
      expect(s.attack.power, s.id).toBeGreaterThan(0);
    }
  });
});
