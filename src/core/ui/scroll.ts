/**
 * 목록 창 넘김 (T-057, ADR-001).
 *
 * **패널을 키우는 것으로는 못 푼다.** 유물이 12종일 때 6줄짜리 패널에서 절반이 잘렸는데,
 * 패널을 12줄로 키워도 유물이 20종이 되면 같은 일이 벌어진다. 목록의 길이는 콘텐츠가
 * 정하고 화면의 높이는 480x270 이 정한다 — 둘이 만나는 곳에 창이 있어야 한다.
 *
 * 순수 함수다. 화면 없이 검사할 수 있어야 잘림이 다시 생겼을 때 테스트가 잡는다.
 */

export interface ScrollWindow {
  /** 보이는 첫 항목의 인덱스. */
  readonly start: number;
  /** 보이는 마지막 항목의 **다음** 인덱스. `slice(start, end)` 로 쓴다. */
  readonly end: number;
  /** 위로 더 있는가. 화살표를 띄울지 정한다. */
  readonly more: { readonly before: boolean; readonly after: boolean };
}

/**
 * 커서를 담는 창을 구한다.
 *
 * **커서를 가운데 두려 하지 않는다.** 목록 앞뒤에서는 창이 끝에 붙어야 남는 자리가 없다 —
 * 가운데 정렬은 첫 항목을 고를 때 위쪽 절반을 빈칸으로 만든다. 커서가 창 밖으로 나갈 때만
 * 창이 따라 움직이는 편이 눈에 덜 튄다.
 */
export function scrollWindow(total: number, cursor: number, rows: number): ScrollWindow {
  if (!Number.isInteger(rows) || rows < 1) {
    throw new RangeError(`창의 줄 수는 1 이상의 정수여야 합니다 (받은 값: ${rows}).`);
  }

  if (total <= rows) {
    return { start: 0, end: total, more: { before: false, after: false } };
  }

  const clamped = Math.min(Math.max(cursor, 0), total - 1);
  // 커서를 창 안에 넣는 가장 가까운 시작점.
  const start = Math.min(Math.max(clamped - rows + 1, 0), Math.min(clamped, total - rows));
  const end = start + rows;

  return { start, end, more: { before: start > 0, after: end < total } };
}

/**
 * 창에 맞춰 잘라낸 줄과, 위아래에 더 있음을 알리는 표시.
 *
 * 표시가 없으면 **잘린 목록이 짧은 목록으로 읽힌다** — 유물이 여섯 개뿐이라고 믿게 된다.
 * 그게 이 함수가 존재하는 이유다.
 */
export function windowedLines(
  lines: readonly string[],
  cursor: number,
  rows: number,
): { readonly lines: readonly string[]; readonly window: ScrollWindow } {
  const window = scrollWindow(lines.length, cursor, rows);
  return { lines: lines.slice(window.start, window.end), window };
}
