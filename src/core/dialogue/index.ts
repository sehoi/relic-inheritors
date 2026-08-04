/**
 * 대화 (ADR-001: 순수 TypeScript).
 *
 * 텍스트를 화면에 맞게 자르는 일과 "지금 몇 번째 쪽인가"를 여기서 다룬다.
 * 폰트 렌더링에 의존하지 않고 글자 수로 계산하므로 헤드리스로 검증할 수 있다.
 * 대신 글자 폭이 제각각인 폰트에서는 어긋날 수 있어, 본문은 고정폭 폰트를 쓴다.
 */

import { Problems, ValidationError, readText } from '../validation/index.js';

export interface DialogueLine {
  /** 말하는 사람. 없으면 나레이션. */
  readonly speaker?: string;
  readonly text: string;
}

export interface DialogueScript {
  readonly id: string;
  readonly lines: readonly DialogueLine[];
}

/** 화면 한 번에 보여줄 단위. */
export interface DialoguePage {
  readonly speaker?: string;
  readonly text: string;
}

export interface TextBoxLayout {
  readonly maxCharsPerLine: number;
  readonly maxLines: number;
}

/**
 * 대화 상자의 실제 크기.
 *
 * UI 쪽 상수처럼 보이지만 **core 에 둔다** — 줄바꿈을 계산하는 것이 core 이고,
 * 콘텐츠 검증 테스트도 이 값으로 대사가 상자에 들어가는지 확인해야 하기 때문이다.
 * 게임 레이어에 두면 유닛 테스트가 Phaser 를 끌어오게 되어 ADR-001 이 깨진다.
 *
 * 값을 바꾸면 기존 대사가 넘칠 수 있다. `tests/unit/content.test.ts` 가 그걸 잡는다.
 */
export const TEXT_BOX_LAYOUT: TextBoxLayout = { maxCharsPerLine: 34, maxLines: 2 };

const SUBJECT = '대화 스크립트';

/**
 * 한 문단을 줄 단위로 접는다.
 *
 * 공백이 있으면 단어 경계에서 접고, 한 단어가 줄보다 길면 그대로 잘라 넘긴다.
 * 한국어는 띄어쓰기가 드물어 후자가 기본 경로가 된다 — 이걸 처리하지 않으면
 * 긴 한국어 문장이 통째로 한 줄을 넘겨 화면 밖으로 나간다.
 */
export function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (maxCharsPerLine <= 0) {
    throw new RangeError(`maxCharsPerLine 은 양수여야 합니다 (받은 값: ${maxCharsPerLine}).`);
  }

  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    let current = '';

    const flush = (): void => {
      lines.push(current);
      current = '';
    };

    for (const word of paragraph.split(' ').filter((w) => w.length > 0)) {
      let remaining = word;

      while (remaining.length > maxCharsPerLine) {
        if (current.length > 0) flush();
        lines.push(remaining.slice(0, maxCharsPerLine));
        remaining = remaining.slice(maxCharsPerLine);
      }

      const candidate = current.length === 0 ? remaining : `${current} ${remaining}`;
      if (candidate.length <= maxCharsPerLine) {
        current = candidate;
      } else {
        flush();
        current = remaining;
      }
    }

    lines.push(current);
  }

  return lines;
}

/** 텍스트를 화면 한 장 분량씩 나눈다. 빈 텍스트는 보여줄 것이 없으므로 빈 배열이다. */
export function paginate(text: string, layout: TextBoxLayout): string[] {
  if (text.trim().length === 0) return [];
  if (layout.maxLines <= 0) {
    throw new RangeError(`maxLines 는 양수여야 합니다 (받은 값: ${layout.maxLines}).`);
  }

  const lines = wrapText(text, layout.maxCharsPerLine);
  const pages: string[] = [];

  for (let start = 0; start < lines.length; start += layout.maxLines) {
    pages.push(lines.slice(start, start + layout.maxLines).join('\n'));
  }

  return pages;
}

/** 대화 진행 상태. 불변이며, 진행할 때마다 새 객체를 만든다. */
export interface DialogueSession {
  readonly scriptId: string;
  readonly pages: readonly DialoguePage[];
  readonly index: number;
}

export function validateDialogueScript(script: DialogueScript): void {
  const problems = Problems.create();

  readText(script.id, 'id', problems);
  if (script.lines.length === 0) problems.add(`"${script.id}": 대사가 하나도 없습니다.`);

  script.lines.forEach((line, position) => {
    // 빈 대사는 화면에 아무것도 안 뜨고 넘어가서, 플레이 중에는 버그처럼 보인다.
    readText(line.text, `"${script.id}" lines[${position}].text`, problems);
  });

  problems.throwIfAny(SUBJECT);
}

/** 스크립트를 쪽 단위로 펼쳐 세션을 연다. */
export function openDialogue(script: DialogueScript, layout: TextBoxLayout): DialogueSession {
  validateDialogueScript(script);

  const pages: DialoguePage[] = script.lines.flatMap((line) =>
    paginate(line.text, layout).map((text) =>
      line.speaker === undefined ? { text } : { speaker: line.speaker, text },
    ),
  );

  if (pages.length === 0) {
    throw new ValidationError(SUBJECT, [`"${script.id}": 보여줄 쪽이 없습니다.`]);
  }

  return { scriptId: script.id, pages, index: 0 };
}

export function currentPage(session: DialogueSession): DialoguePage {
  const page = session.pages[session.index];
  if (page === undefined) {
    throw new RangeError(`쪽 번호가 범위를 벗어났습니다: ${session.index}/${session.pages.length}`);
  }
  return page;
}

export function isLastPage(session: DialogueSession): boolean {
  return session.index >= session.pages.length - 1;
}

/** 다음 쪽으로. 마지막 쪽이었다면 `undefined` — 대화가 끝났다는 뜻이다. */
export function advanceDialogue(session: DialogueSession): DialogueSession | undefined {
  if (isLastPage(session)) return undefined;
  return { ...session, index: session.index + 1 };
}
