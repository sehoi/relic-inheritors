import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/core/validation/index.js';
import {
  advanceDialogue,
  currentPage,
  isLastPage,
  openDialogue,
  paginate,
  validateDialogueScript,
  wrapText,
  type DialogueScript,
  type TextBoxLayout,
} from '../../src/core/dialogue/index.js';

const LAYOUT: TextBoxLayout = { maxCharsPerLine: 10, maxLines: 2 };

describe('wrapText', () => {
  it('단어 경계에서 접는다', () => {
    expect(wrapText('the glyphs remember', 10)).toEqual(['the glyphs', 'remember']);
  });

  it('줄에 딱 맞으면 접지 않는다', () => {
    expect(wrapText('0123456789', 10)).toEqual(['0123456789']);
  });

  it('한 단어가 줄보다 길면 잘라 넘긴다 (한국어의 기본 경로)', () => {
    // 띄어쓰기가 없는 긴 문장. 이걸 처리하지 않으면 화면 밖으로 나간다.
    expect(wrapText('가나다라마바사아자차카타', 5)).toEqual(['가나다라마', '바사아자차', '카타']);
  });

  it('긴 단어 앞에 쓰던 줄이 있으면 먼저 내보낸다', () => {
    expect(wrapText('ab 가나다라마바사', 5)).toEqual(['ab', '가나다라마', '바사']);
  });

  it('명시적 줄바꿈을 존중한다', () => {
    expect(wrapText('one\ntwo', 10)).toEqual(['one', 'two']);
  });

  it('빈 줄을 보존한다', () => {
    expect(wrapText('a\n\nb', 10)).toEqual(['a', '', 'b']);
  });

  it('줄 너비가 0 이하면 던진다', () => {
    expect(() => wrapText('x', 0)).toThrow(RangeError);
  });
});

describe('paginate', () => {
  it('maxLines 단위로 쪽을 나눈다', () => {
    expect(paginate('가나다라마바사아자차카타사아', LAYOUT)).toEqual([
      '가나다라마바사아자차\n카타사아',
    ]);
  });

  it('두 쪽을 넘기면 나뉜다', () => {
    const text = '0123456789'.repeat(3); // 30자, 줄당 10자 => 3줄 => 2쪽
    const pages = paginate(text, LAYOUT);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toBe('0123456789\n0123456789');
    expect(pages[1]).toBe('0123456789');
  });

  it('빈 텍스트는 보여줄 것이 없다', () => {
    expect(paginate('', LAYOUT)).toEqual([]);
    expect(paginate('   ', LAYOUT)).toEqual([]);
  });
});

describe('validateDialogueScript', () => {
  it('정상 스크립트를 통과시킨다', () => {
    expect(() =>
      validateDialogueScript({ id: 'a', lines: [{ text: '안녕' }] }),
    ).not.toThrow();
  });

  it('빈 id·빈 대사 목록·빈 텍스트를 거부한다', () => {
    expect(() => validateDialogueScript({ id: '', lines: [{ text: 'x' }] })).toThrow(ValidationError);
    expect(() => validateDialogueScript({ id: 'a', lines: [] })).toThrow(/대사가 하나도/);
    // 빈 대사는 화면에 아무것도 안 뜨고 넘어가서 플레이 중에는 버그처럼 보인다.
    expect(() => validateDialogueScript({ id: 'a', lines: [{ text: '  ' }] })).toThrow(/text/);
  });
});

describe('대화 진행', () => {
  const script: DialogueScript = {
    id: 'test',
    lines: [
      { speaker: '조사원', text: '0123456789012345678901234567890' }, // 4줄 => 2쪽
      { text: '짧은 나레이션' },
    ],
  };

  it('대사를 쪽 단위로 펼치고 화자를 물려준다', () => {
    const session = openDialogue(script, LAYOUT);
    expect(session.pages.length).toBeGreaterThan(2);
    expect(session.pages[0]?.speaker).toBe('조사원');
    expect(session.pages.at(-1)?.speaker).toBeUndefined();
  });

  it('첫 쪽에서 시작한다', () => {
    const session = openDialogue(script, LAYOUT);
    expect(session.index).toBe(0);
    expect(currentPage(session).speaker).toBe('조사원');
  });

  it('끝까지 넘기면 undefined 를 돌려준다 (대화 종료)', () => {
    let session = openDialogue(script, LAYOUT);
    const total = session.pages.length;

    for (let i = 0; i < total - 1; i += 1) {
      const next = advanceDialogue(session);
      expect(next, `${i + 1}번째 넘김에서 조기 종료`).toBeDefined();
      session = next as typeof session;
    }

    expect(isLastPage(session)).toBe(true);
    expect(advanceDialogue(session)).toBeUndefined();
  });

  it('진행해도 원래 세션을 변경하지 않는다', () => {
    const session = openDialogue(script, LAYOUT);
    advanceDialogue(session);
    expect(session.index).toBe(0);
  });

  it('보여줄 쪽이 없는 스크립트를 거부한다', () => {
    expect(() => openDialogue({ id: 'empty', lines: [{ text: ' ' }] }, LAYOUT)).toThrow(
      ValidationError,
    );
  });

  it('범위를 벗어난 쪽 조회는 던진다', () => {
    const session = openDialogue(script, LAYOUT);
    expect(() => currentPage({ ...session, index: 99 })).toThrow(RangeError);
  });
});
