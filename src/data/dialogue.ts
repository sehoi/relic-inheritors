import { createRegistry } from '../core/data/registry.js';
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

  // ── 합류 (T-049b) ─────────────────────────────────────────────────────
  // 둘 다 **유적 안에서** 만난다. 거점에서 그냥 받으면 "찾아냈다" 가 아니라
  // "지급받았다" 가 된다.

  'join-warden': {
    id: 'join-warden',
    lines: [
      {
        speaker: '파수',
        text: '문을 지키던 사람이야. 문은 이미 열렸고, 지킬 것이 없어졌지.',
      },
      { speaker: '파수', text: '두고 온 것을 찾으러 간다면, 나도 데려가 줘.' },
      { text: '파수가 일행에 합류했다.' },
    ],
  },

  'join-warden-after': {
    id: 'join-warden-after',
    lines: [{ speaker: '파수', text: '앞은 내가 맡지. 그쪽은 뒤를 봐.' }],
  },

  'join-seeker': {
    id: 'join-seeker',
    lines: [
      {
        speaker: '탐구자',
        text: '여기까지 내려온 사람은 오랜만이네. 길을 아는 사람이 필요하지 않아?',
      },
      { text: '탐구자가 일행에 합류했다.' },
    ],
  },

  'join-seeker-after': {
    id: 'join-seeker-after',
    lines: [{ speaker: '탐구자', text: '아래로 더 내려가는 길이 있어. 아직은 못 열지만.' }],
  },
};

/** 키와 id 가 어긋나거나 중복되면 모듈을 불러오는 순간 터진다 — 늦게 아는 것보다 낫다. */
export const dialogueRegistry = createRegistry(
  '대화 스크립트',
  DIALOGUE_SCRIPTS,
  (script) => script.id,
);

export function dialogueScript(id: string): DialogueScript {
  return dialogueRegistry.get(id);
}
