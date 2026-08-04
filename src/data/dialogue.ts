import type { DialogueScript } from '../core/dialogue/index.js';

/**
 * 대화 스크립트.
 *
 * 고유명사는 확정 전까지 `TODO_NAME` 플레이스홀더를 쓴다 (GDD §10).
 * 세계관은 유물과 유적에 남은 기록으로 파편적으로 전달한다 — 긴 대본을 쓰지 않는 게 설계 의도다.
 */
export const DIALOGUE_SCRIPTS: Readonly<Record<string, DialogueScript>> = {
  'ruin-scholar': {
    id: 'ruin-scholar',
    lines: [
      {
        speaker: '조사원',
        text: '이 아래로는 각인이 아직 살아 있어. 유물을 지니지 않았다면 돌아가는 편이 좋아.',
      },
      {
        speaker: '조사원',
        text: 'TODO_NAME 이 무너진 뒤로 여기서 걸어 나온 사람은 셋뿐이야. 그중 둘은 아무 말도 하지 못했고.',
      },
    ],
  },

  'ruin-guard': {
    id: 'ruin-guard',
    lines: [
      {
        speaker: '경비',
        text: '봉인실 문은 열리지 않아. 세 개의 각인이 맞물려야 한다더군.',
      },
      {
        speaker: '경비',
        text: '뭐, 열린다고 좋을 일도 아니겠지만.',
      },
    ],
  },

  'ruin-drifter': {
    id: 'ruin-drifter',
    lines: [
      {
        speaker: '떠돌이',
        text: '기둥 뒤에서 뭔가 반짝였어. 가까이 가니 사라지더라고.',
      },
      {
        text: '떠돌이는 더 말하지 않고 벽 쪽으로 돌아섰다.',
      },
    ],
  },
};

export function dialogueScript(id: string): DialogueScript {
  const script = DIALOGUE_SCRIPTS[id];
  if (script === undefined) {
    throw new Error(
      `대화 스크립트 "${id}" 가 없습니다.\n` +
        `src/data/dialogue.ts 에 추가하세요. 현재 등록된 것: ${Object.keys(DIALOGUE_SCRIPTS).join(', ')}`,
    );
  }
  return script;
}
