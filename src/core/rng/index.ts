/**
 * 결정론적 난수 생성기 (ADR-002)
 *
 * 이 프로젝트의 모든 무작위성은 여기를 경유한다. `Math.random()` 은 ESLint가 금지한다.
 *
 * 이유: 자율 루프가 게임을 개발한다. 재현할 수 없는 버그는 루프가 고칠 수 없고,
 * 결정론 없이는 밸런스 시뮬레이션(GDD §5.5)도 성립하지 않는다.
 * 전투는 시드를 받아 시작하고 그 시드를 로그에 남기므로,
 * "시드 4821에서 3턴째 크래시" 가 그대로 회귀 테스트가 된다.
 *
 * 알고리즘은 mulberry32 — 32비트 상태, 빠르고, 게임 용도에 충분한 품질.
 * 암호학적 용도로는 절대 쓰지 말 것.
 */

export interface Rng {
  /** [0, 1) 범위의 부동소수 */
  next(): number;
  /** [min, max] 범위의 정수 (양 끝 포함) */
  int(min: number, max: number): number;
  /** 배열에서 균등하게 하나 선택 */
  pick<T>(items: readonly T[]): T;
  /** 확률 p(0~1)로 true */
  chance(probability: number): boolean;
  /** 현재 내부 상태. 세이브·로그에 기록해 재현에 사용한다. */
  getState(): number;
}

const UINT32 = 0x1_0000_0000;

function mulberry32(initialState: number): Rng {
  let state = initialState >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };

  return {
    next,

    int(min: number, max: number): number {
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        throw new RangeError(`int()의 경계는 정수여야 합니다: min=${min}, max=${max}`);
      }
      if (min > max) {
        throw new RangeError(`int()의 min이 max보다 큽니다: min=${min}, max=${max}`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError('pick()에 빈 배열이 전달되었습니다.');
      }
      const index = Math.floor(next() * items.length);
      // noUncheckedIndexedAccess 대응: 위에서 길이를 보장했으므로 존재한다.
      return items[index] as T;
    },

    chance(probability: number): boolean {
      // p<=0 이면 항상 false, p>=1 이면 항상 true. 난수를 소비하지 않는다
      // — 확률 0/1 분기가 이후 수열을 흔들면 재현성이 깨지기 때문이다.
      if (probability <= 0) return false;
      if (probability >= 1) return true;
      return next() < probability;
    },

    getState(): number {
      return state;
    },
  };
}

/** 시드로부터 새 RNG를 만든다. 같은 시드는 항상 같은 수열을 낳는다. */
export function createRng(seed: number): Rng {
  return mulberry32(seed);
}

/**
 * `getState()` 로 저장해둔 상태에서 RNG를 복원한다.
 * 세이브 파일에서 전투를 이어받거나, 버그를 그 지점부터 재현할 때 쓴다.
 */
export function restoreRng(state: number): Rng {
  return mulberry32(state);
}
