import type { BattleActor, Stats } from '../core/battle/index.js';

/**
 * 스탯 성장 곡선.
 *
 * **잠정값이다.** GDD 에 곡선이 명시되어 있지 않아 ADR-009 검증 때 쓴 선형 곡선을 그대로 옮겼다.
 * 시뮬레이터(T-019)가 이 곡선 위에서 전투 길이를 측정하므로, 곡선을 바꾸면 측정치도 바뀐다.
 * 실제 캐릭터·적 콘텐츠는 M5 에서 정해지며 그때 이 값들이 재검토된다.
 */
export interface GrowthCurve {
  readonly base: number;
  readonly perLevel: number;
}

export type StatCurves = Readonly<Record<keyof Stats, GrowthCurve>>;

export const PARTY_CURVES: StatCurves = {
  maxHp: { base: 30, perLevel: 12 },
  maxMp: { base: 10, perLevel: 2 },
  atk: { base: 8, perLevel: 2 },
  def: { base: 5, perLevel: 1.5 },
  mag: { base: 8, perLevel: 2 },
  res: { base: 5, perLevel: 1.5 },
  agi: { base: 8, perLevel: 1 },
  luk: { base: 5, perLevel: 0.5 },
};

export const MOB_CURVES: StatCurves = {
  maxHp: { base: 25, perLevel: 9 },
  maxMp: { base: 8, perLevel: 1.5 },
  atk: { base: 6, perLevel: 1.8 },
  def: { base: 4, perLevel: 1.4 },
  mag: { base: 6, perLevel: 1.8 },
  res: { base: 4, perLevel: 1.4 },
  agi: { base: 7, perLevel: 0.9 },
  luk: { base: 3, perLevel: 0.4 },
};

/** 보스는 같은 레벨 잡몹에 배율을 곱한다. HP 배율이 큰 이유는 보스전을 길게 만들기 위해서다. */
export const BOSS_MULTIPLIERS: Readonly<Record<keyof Stats, number>> = {
  maxHp: 8,
  maxMp: 2,
  atk: 1.4,
  def: 1.3,
  mag: 1.4,
  res: 1.3,
  agi: 1.1,
  luk: 1.2,
};

export function statsAtLevel(
  curves: StatCurves,
  level: number,
  multipliers?: Readonly<Record<keyof Stats, number>>,
): Stats {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`레벨은 1 이상의 정수여야 합니다 (받은 값: ${level}).`);
  }

  const at = (key: keyof Stats): number => {
    const curve = curves[key];
    const raw = curve.base + curve.perLevel * level;
    return Math.round(raw * (multipliers?.[key] ?? 1));
  };

  return {
    maxHp: at('maxHp'),
    maxMp: at('maxMp'),
    atk: at('atk'),
    def: at('def'),
    mag: at('mag'),
    res: at('res'),
    agi: at('agi'),
    luk: at('luk'),
  };
}

/** 시뮬레이션용 전투 참가자를 만든다. HP·MP 는 최대치로 시작한다. */
export function makeCombatant(
  id: string,
  side: BattleActor['side'],
  stats: Stats,
  overrides: Partial<BattleActor> = {},
): BattleActor {
  return {
    id,
    name: id,
    side,
    stats,
    hp: stats.maxHp,
    mp: stats.maxMp,
    erosion: 0,
    ...overrides,
  };
}
