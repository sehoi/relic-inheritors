import type { BattleActor, Stats } from '../core/battle/index.js';
import type { ExpReward, LevelCurve } from '../core/progress/level.js';

/**
 * 레벨 곡선 (GDD §6.3).
 *
 * **앞을 아주 완만하게 잡았다.** 실측에서 회복 없이 6판이면 전멸했는데(플레이 피드백),
 * 레벨업이 완전 회복을 겸하므로 초반 레벨업 간격이 곧 유적에서 버티는 길이가 된다.
 *
 * `base: 6` 이면 첫 레벨업이 잡몹 두어 마리다. 지수 1.8 이 뒤를 가파르게 만들어
 * 후반에는 한 레벨이 수십 판이 된다 — 초반만 빠르고 전체가 빨라지지는 않는다.
 */
export const LEVEL_CURVE: LevelCurve = {
  maxLevel: 40,
  base: 6,
  growth: 1.8,
};

/**
 * 적 하나가 주는 경험치.
 *
 * 유적 입구(적 Lv2) 잡몹 하나가 7, 둘이면 14 — 첫 레벨업(6)이 첫 전투에서 온다.
 * 처음 몇 판에서 레벨이 오르지 않으면 플레이어는 자기가 나아지는지 알 수 없다.
 */
export const EXP_REWARD: ExpReward = {
  base: 5,
  perLevel: 1,
};

/**
 * 적 하나가 떨구는 은편 (T-041a).
 *
 * 경험치와 같은 모양으로 잡되 값은 다르다 — 둘이 같은 수치면 은편이 경험치의 그림자가 되고,
 * "돈을 벌러 간다" 와 "레벨을 올리러 간다" 가 구분되지 않는다.
 *
 * **처음 잡은 값(base 3, perLevel 0.7)은 너무 후했다.** 15판을 돌면 여관 값의 일곱 배가
 * 남아, 은편이 자원 노릇을 못 했다. 절반으로 줄여도 숙박은 여전히 늘 감당된다 —
 * 막다른 길이 되지 않으면서 남는 것이 줄어드는 구간이다.
 *
 * 상점(T-041b)이 붙으면 쓸 곳이 생기므로 그때 다시 잰다. 지금 더 조이는 것은
 * 살 것이 없는 상태에서 가격을 정하는 일이라 근거가 없다.
 */
export const COIN_REWARD: ExpReward = {
  base: 1.5,
  perLevel: 0.4,
};

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
  // MP 는 배로 주지 않는다. 보스는 액터가 하나라 MP 가 곧 강력한 스킬의 시전 횟수인데,
  // 그게 레벨에 따라 배로 늘면 후반 보스가 손댈 수 없이 강해진다 (ADR-010 실측).
  maxMp: 1,
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
