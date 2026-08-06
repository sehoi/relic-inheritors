import { describe, expect, it } from 'vitest';
import { scrollWindow, windowedLines } from '../../src/core/ui/scroll.js';

/**
 * 목록 창 넘김 (T-057).
 *
 * **잘린 목록은 짧은 목록으로 읽힌다.** 유물 12종이 6줄짜리 패널에 담겨 있었는데,
 * 화면만 보면 여섯 개가 전부인 줄 안다. 없는 것과 안 보이는 것이 구분되지 않았다.
 */

describe('창 넘김', () => {
  it('다 들어가면 그대로 보여준다', () => {
    expect(scrollWindow(4, 0, 6)).toEqual({
      start: 0,
      end: 4,
      more: { before: false, after: false },
    });
  });

  it('넘치면 커서가 든 만큼만 보여준다', () => {
    const window = scrollWindow(12, 0, 6);
    expect(window.start).toBe(0);
    expect(window.end).toBe(6);
    expect(window.more.after, '아래에 더 있다고 알려야 한다').toBe(true);
  });

  it('커서가 창 아래로 나가면 창이 따라간다', () => {
    expect(scrollWindow(12, 6, 6)).toEqual({
      start: 1,
      end: 7,
      more: { before: true, after: true },
    });
  });

  it('끝에서는 창이 끝에 붙는다', () => {
    // 가운데 정렬하면 마지막 항목을 고를 때 아래 절반이 빈칸이 된다.
    expect(scrollWindow(12, 11, 6)).toEqual({
      start: 6,
      end: 12,
      more: { before: true, after: false },
    });
  });

  it('처음에서는 위로 더 있다고 하지 않는다', () => {
    expect(scrollWindow(12, 2, 6).more.before).toBe(false);
  });

  it('창은 늘 같은 줄 수를 채운다', () => {
    // 줄 수가 들쭉날쭉하면 커서 위치 계산이 어긋난다 (세이브 화면에서 겪은 문제다).
    for (let cursor = 0; cursor < 12; cursor += 1) {
      const window = scrollWindow(12, cursor, 6);
      expect(window.end - window.start, `커서 ${cursor}`).toBe(6);
    }
  });

  it('커서는 언제나 창 안에 있다', () => {
    // 이게 깨지면 커서가 보이지 않는 줄을 가리킨다 — 무엇을 고르는지 알 수 없어진다.
    for (const total of [1, 5, 12, 40]) {
      for (const rows of [1, 3, 6, 20]) {
        for (let cursor = 0; cursor < total; cursor += 1) {
          const window = scrollWindow(total, cursor, rows);
          expect(cursor, `${total}개 · ${rows}줄 · 커서 ${cursor}`).toBeGreaterThanOrEqual(
            window.start,
          );
          expect(cursor).toBeLessThan(window.end);
        }
      }
    }
  });

  it('빈 목록도 터지지 않는다', () => {
    expect(scrollWindow(0, 0, 6)).toEqual({
      start: 0,
      end: 0,
      more: { before: false, after: false },
    });
  });

  it('줄 수가 0 이하면 거부한다', () => {
    expect(() => scrollWindow(5, 0, 0)).toThrow(RangeError);
  });
});

describe('windowedLines', () => {
  const lines = Array.from({ length: 12 }, (_, i) => `줄 ${i}`);

  it('창만큼만 잘라준다', () => {
    const result = windowedLines(lines, 8, 5);
    expect(result.lines).toEqual(['줄 4', '줄 5', '줄 6', '줄 7', '줄 8']);
    expect(result.window.more).toEqual({ before: true, after: true });
  });
});
