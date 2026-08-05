/**
 * 플레이 시간.
 *
 * 세이브 슬롯이 "얼마나 진행했는가" 를 보여주려면 필요하다. 진행 위치만으로는
 * 세 슬롯 중 어느 것이 최근 것인지 알기 어렵다.
 *
 * **시각을 인자로 받는다.** 여기서 `Date.now()` 를 부르면 테스트가 시계에 매이고,
 * 그건 이 프로젝트에서 가장 비싼 종류의 문제다 (ADR-002 의 정신).
 */

let accumulatedMs = 0;
/** 마지막으로 시간을 정산한 시각. `undefined` 면 시계가 멈춰 있다. */
let markedAt: number | undefined;

/** 시계를 돌리기 시작한다. 이미 돌고 있으면 아무 일도 없다. */
export function startClock(now: number): void {
  markedAt ??= now;
}

export function elapsedMs(now: number): number {
  if (markedAt === undefined) return accumulatedMs;
  return accumulatedMs + Math.max(0, now - markedAt);
}

/** 지금까지를 정산하고 시계를 멈춘다. 씬을 떠날 때 쓴다. */
export function stopClock(now: number): void {
  accumulatedMs = elapsedMs(now);
  markedAt = undefined;
}

/** 불러온 세이브의 플레이 시간에서 이어간다. */
export function setElapsed(ms: number, now: number): void {
  accumulatedMs = Math.max(0, ms);
  markedAt = now;
}

export function resetClock(): void {
  accumulatedMs = 0;
  markedAt = undefined;
}

/** `1시간 23분` 처럼. 초 단위는 보여주지 않는다 — 슬롯 목록에서 매초 바뀌면 산만하다. */
export function formatPlaytime(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}분` : `${hours}시간 ${minutes}분`;
}
