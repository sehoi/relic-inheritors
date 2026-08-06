import { createRegistry } from '../core/data/registry.js';
import type { DialogueScript } from '../core/dialogue/index.js';

/**
 * 대화 스크립트.
 *
 * 고유명사는 확정 전까지 `TODO_NAME` 플레이스홀더를 쓴다 (GDD §10).
 * 세계관은 유물과 유적에 남은 기록으로 파편적으로 전달한다 — 긴 대본을 쓰지 않는 게 설계 의도다.
 */
export const DIALOGUE_SCRIPTS: Readonly<Record<string, DialogueScript>> = {
  // ── 거점 (T-054) ──────────────────────────────────────────────────────────
  //
  // **다섯이 각각 다른 것을 말한다.** 세계관, 길, 규칙, 사람, 그리고 아무것도 아닌 것.
  // 다섯이 같은 얘기를 나눠 하면 한 사람이면 될 것을 다섯으로 늘린 것이 된다.
  //
  // 힌트를 주는 둘(`haven-veteran`, `haven-keeper`)은 **실제로 유효한 정보**를 준다 —
  // 잠긴 문과 소지 한도가 그것이다. 아니면 대화가 장식이 되고, 장식은 두 번째부터 안 읽힌다.
  //
  // ⚠️ **대사에 수를 적지 않는다.** "열셋까지 세었어" 처럼 쓰면 유물이 늘어나는 순간
  // 거짓말이 되는데, 데이터를 늘린 사람이 대사까지 고칠 이유는 없다 (T-055 에서 조작 안내가
  // 그래서 어긋나 있었다). 힌트의 값어치는 수가 아니라 **성질**에 있다 —
  // "아직 안 주워 온 게 있다" 와 "가방이 먼저 찬다" 는 수가 바뀌어도 참이다.

  'haven-archivist': {
    id: 'haven-archivist',
    lines: [
      {
        speaker: '기록자',
        text: '주워 온 것을 여기 적어 둬. 무엇이 남았는지는 세어 봐야 알거든.',
      },
      {
        speaker: '기록자',
        text: '아직 아무도 들고 온 적 없는 것도 있어. 유적이 순순히 내주지 않는 게 있는 거지.',
      },
    ],
  },

  'haven-veteran': {
    id: 'haven-veteran',
    lines: [
      {
        speaker: '먼저 다녀온 자',
        text: '내려가다 보면 각인이 박힌 문이 하나 나와. 밀어도 안 열려.',
      },
      {
        speaker: '먼저 다녀온 자',
        text: '같은 층 물가에 같은 모양이 떨어져 있더군. 나는 거기서 돌아왔지만.',
      },
    ],
  },

  'haven-keeper': {
    id: 'haven-keeper',
    lines: [
      {
        speaker: '주인',
        text: '싼 것만 잔뜩 챙기면 가방이 먼저 찬다. 자리는 정해져 있거든.',
      },
      {
        speaker: '주인',
        text: '비싼 쪽이 자리값을 한다는 뜻이지.',
      },
    ],
  },

  'haven-child': {
    id: 'haven-child',
    lines: [
      {
        speaker: '아이',
        text: '유물을 끼면 아파? 어른들은 다들 아프대.',
      },
      {
        speaker: '아이',
        text: '그럼 왜 껴?',
      },
    ],
  },

  'haven-idler': {
    id: 'haven-idler',
    lines: [
      {
        speaker: '한량',
        text: '오늘도 물이 맑네.',
      },
    ],
  },

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
