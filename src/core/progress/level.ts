/**
 * 레벨과 경험치 (GDD §6.3, ADR-001).
 *
 * **초반이 빨라야 한다.** 처음 몇 판에서 레벨이 오르지 않으면 플레이어는 자기가 나아지고 있는지
 * 알 수 없고, 유적은 회복 수단이 없어서(거점은 T-040) 그대로 소모전에 진다.
 *
 * 그래서 곡선을 앞으로 몰았다 — 1~2판이면 한 단계가 오르고, 뒤로 갈수록 완만해진다.
 *
 * **레벨업은 완전 회복을 겸한다.** 유적 안에서 회복할 방법이 이것뿐이기 때문이다.
 * 거점이 생기면 회복 수단이 늘지만, 레벨업이 숨통을 틔우는 역할은 그대로 둔다 —
 * "한 판만 더 버티면 오른다" 가 탐색을 이어갈 이유가 된다.
 */

export interface LevelCurve {
  readonly maxLevel: number;
  /** 1→2 에 필요한 경험치. 작을수록 첫 레벨업이 빠르다. */
  readonly base: number;
  /**
   * 레벨당 증가 지수. 1이면 선형, 클수록 뒤가 가팔라진다.
   *
   * 앞을 완만하게 하려면 **지수를 키우는 쪽**이 맞다 — base 를 키우면 앞이 느려지고,
   * 지수를 키우면 앞은 그대로인 채 뒤만 느려진다.
   */
  readonly growth: number;
}

export class LevelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LevelError';
  }
}

export function validateLevelCurve(curve: LevelCurve): void {
  if (!Number.isInteger(curve.maxLevel) || curve.maxLevel < 2) {
    throw new LevelError(`maxLevel 은 2 이상의 정수여야 합니다 (받은 값: ${curve.maxLevel}).`);
  }
  if (curve.base <= 0) {
    throw new LevelError(`base 는 양수여야 합니다 (받은 값: ${curve.base}).`);
  }
  if (curve.growth < 1) {
    throw new LevelError(`growth 는 1 이상이어야 합니다 (받은 값: ${curve.growth}). 1 미만이면 뒤가 더 쉬워집니다.`);
  }
}

/** 이 레벨에서 다음 레벨로 가는 데 필요한 경험치. 최고 레벨이면 `undefined`. */
export function expToNext(level: number, curve: LevelCurve): number | undefined {
  if (level >= curve.maxLevel) return undefined;
  return Math.round(curve.base * Math.pow(level, curve.growth));
}

/** 그 레벨에 도달하는 데 필요한 누적 경험치. */
export function expAtLevel(level: number, curve: LevelCurve): number {
  let total = 0;
  for (let at = 1; at < Math.min(level, curve.maxLevel); at += 1) {
    total += expToNext(at, curve) ?? 0;
  }
  return total;
}

export interface LevelProgress {
  readonly level: number;
  /** 이번 레벨에서 쌓은 양. */
  readonly into: number;
  /** 다음 레벨까지 필요한 양. 최고 레벨이면 `undefined`. */
  readonly need: number | undefined;
}

/**
 * 누적 경험치로부터 레벨과 진행도를 낸다.
 *
 * 레벨을 따로 저장하지 않고 **경험치 하나에서 파생시킨다.** 둘 다 저장하면 언젠가 어긋나고,
 * 어긋난 세이브는 어느 쪽이 옳은지 알 수 없다.
 */
export function progressOf(totalExp: number, curve: LevelCurve): LevelProgress {
  if (totalExp < 0) {
    throw new LevelError(`경험치는 음수일 수 없습니다 (받은 값: ${totalExp}).`);
  }

  let level = 1;
  let left = Math.floor(totalExp);

  while (level < curve.maxLevel) {
    const need = expToNext(level, curve) ?? 0;
    if (left < need) return { level, into: left, need };
    left -= need;
    level += 1;
  }

  return { level: curve.maxLevel, into: 0, need: undefined };
}

export function levelOf(totalExp: number, curve: LevelCurve): number {
  return progressOf(totalExp, curve).level;
}

export interface ExpReward {
  /** 적 하나가 주는 기본량. */
  readonly base: number;
  /** 적 레벨 1당 추가량. */
  readonly perLevel: number;
}

/** 쓰러뜨린 적 하나가 주는 경험치. */
export function expForEnemy(enemyLevel: number, reward: ExpReward): number {
  return Math.max(1, Math.round(reward.base + reward.perLevel * Math.max(1, enemyLevel)));
}
