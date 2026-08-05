import { describe, expect, it } from 'vitest';
import type { BattleActor } from '../../src/core/battle/index.js';
import {
  applySkillCost,
  canUseSkill,
  isOverloaded,
  relieveErosion,
  skillBlockReason,
  type ErosionTuning,
  type Skill,
} from '../../src/core/battle/skill.js';
import { SKILLS, skill, skillRegistry } from '../../src/data/skills.js';

const EROSION: ErosionTuning = { threshold: 100, reliefRatio: 0.5, max: 200 };

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
    expect(applySkillCost(actor(), heavy, EROSION).erosion).toBe(EROSION.max);
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

describe('스킬 데이터', () => {
  it('레지스트리로 조회된다', () => {
    expect(skill('ember-lash').name).toBe('불꽃 채찍');
    expect(() => skill('nope')).toThrow(/ember-lash/);
  });

  it('키와 id 가 일치한다', () => {
    expect(skillRegistry.ids().sort()).toEqual(Object.keys(SKILLS).sort());
  });

  it('위력이 높을수록 침식도 크다 (비례가 무너지면 조합 설계가 무의미해진다)', () => {
    const ordered = Object.values(SKILLS).sort((a, b) => a.attack.power - b.attack.power);
    for (let i = 1; i < ordered.length; i += 1) {
      const weaker = ordered[i - 1] as Skill;
      const stronger = ordered[i] as Skill;
      expect(stronger.erosion, `${stronger.id} vs ${weaker.id}`).toBeGreaterThan(weaker.erosion);
    }
  });

  it('모든 스킬이 양수 비용을 갖는다', () => {
    for (const s of Object.values(SKILLS)) {
      expect(s.mpCost, s.id).toBeGreaterThan(0);
      expect(s.erosion, s.id).toBeGreaterThan(0);
      expect(s.attack.power, s.id).toBeGreaterThan(0);
    }
  });
});
