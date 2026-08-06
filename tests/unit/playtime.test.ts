import { beforeEach, describe, expect, it } from 'vitest';
import {
  elapsedMs,
  formatPlaytime,
  resetClock,
  setElapsed,
  startClock,
  stopClock,
} from '../../src/game/playtime.js';

/**
 * 플레이 시간 (T-043).
 *
 * **시각을 인자로 받으므로 시계 없이 검사할 수 있다.** 이런 값은 화면에서 확인하기가
 * 가장 나쁜 종류다 — 틀렸는지 알려면 실제로 그만큼 기다려야 한다.
 */

const T0 = 1_000_000;
const MINUTE = 60_000;

describe('플레이 시간', () => {
  beforeEach(() => {
    resetClock();
  });

  it('시작하기 전에는 0 이다', () => {
    // 첫 부팅에서 타이틀을 보고 있는 동안은 아직 플레이가 아니다.
    expect(elapsedMs(T0 + MINUTE)).toBe(0);
  });

  it('시작한 뒤부터 흐른다', () => {
    startClock(T0);
    expect(elapsedMs(T0 + 5 * MINUTE)).toBe(5 * MINUTE);
  });

  it('두 번 시작해도 처음 시각을 지킨다', () => {
    // 씬이 다시 만들어질 때마다 `startClock` 이 불려도 시계가 되감기면 안 된다.
    startClock(T0);
    startClock(T0 + 3 * MINUTE);
    expect(elapsedMs(T0 + 5 * MINUTE)).toBe(5 * MINUTE);
  });

  it('멈추면 더 이상 흐르지 않는다', () => {
    // **타이틀은 플레이가 아니다.** 전멸하고 돌아와 한참 들여다봐도 시간이 늘면 안 된다.
    startClock(T0);
    stopClock(T0 + 5 * MINUTE);

    expect(elapsedMs(T0 + 60 * MINUTE)).toBe(5 * MINUTE);
  });

  it('멈췄다 다시 시작하면 이어간다', () => {
    startClock(T0);
    stopClock(T0 + 5 * MINUTE);
    startClock(T0 + 60 * MINUTE);

    expect(elapsedMs(T0 + 62 * MINUTE)).toBe(7 * MINUTE);
  });

  it('불러온 세이브의 시간에서 이어간다', () => {
    setElapsed(90 * MINUTE, T0);
    expect(elapsedMs(T0 + 2 * MINUTE)).toBe(92 * MINUTE);
  });

  it('저장하고 불러오면 시간이 보존된다', () => {
    // 세이브 왕복이 이 값의 유일한 쓸모다 — 슬롯 목록에서 어느 것이 최근인지 알려준다.
    startClock(T0);
    const saved = elapsedMs(T0 + 42 * MINUTE);

    resetClock();
    setElapsed(saved, T0);

    expect(elapsedMs(T0)).toBe(42 * MINUTE);
  });

  it('새로 시작하면 0 부터다', () => {
    startClock(T0);
    elapsedMs(T0 + 30 * MINUTE);

    resetClock();
    startClock(T0 + 30 * MINUTE);

    expect(elapsedMs(T0 + 31 * MINUTE)).toBe(MINUTE);
  });

  it('시각이 거꾸로 가도 줄지 않는다', () => {
    // 시스템 시계가 조정될 수 있다. 플레이 시간이 줄어드는 것은 어떤 경우에도 틀렸다.
    startClock(T0);
    expect(elapsedMs(T0 - 10 * MINUTE)).toBe(0);
  });
});

describe('formatPlaytime', () => {
  it('한 시간 미만은 분만', () => {
    expect(formatPlaytime(42 * MINUTE)).toBe('42분');
  });

  it('한 시간 이상은 시간과 분', () => {
    expect(formatPlaytime(90 * MINUTE)).toBe('1시간 30분');
  });
});
