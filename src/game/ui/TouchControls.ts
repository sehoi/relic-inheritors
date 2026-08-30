import type { SceneKeys } from '../../data/keys.js';

/**
 * 터치 조작 (모바일).
 *
 * 이 게임은 처음부터 키보드 전제로 설계됐다(GDD·아키텍처 어디에도 터치 언급이 없다).
 * 새 입력 경로를 만드는 대신 **키보드 이벤트를 흉내낸다** — Phaser 의 KeyboardPlugin 이
 * `event.keyCode` 만으로 키를 식별하므로(`window`에 진짜 `keydown`/`keyup` 을 뿌리면),
 * 씬 쪽의 `JustDown`/`isDown`/`keydown-X` 코드를 단 한 줄도 바꾸지 않고 그대로 먹는다.
 *
 * 버튼 구성은 `data/keys.ts` 에서 그대로 뽑는다 — 조작 안내(`KeyGuide`)와 같은 이유로,
 * 손으로 다시 나열하면 배치가 바뀔 때 여기만 낡는다. 씬은 `setKeys(SCENE_KEYS)` 한 줄만
 * 부르면 된다.
 *
 * `@media (pointer: coarse)` 로만 보인다 — 마우스/키보드 기기에서는 아예 안 그려진다.
 */

const KEY_CODES: Readonly<Record<string, number>> = {
  UP: 38,
  DOWN: 40,
  LEFT: 37,
  RIGHT: 39,
  ENTER: 13,
  SPACE: 32,
  ESC: 27,
  DELETE: 46,
  W: 87,
  A: 65,
  S: 83,
  D: 68,
  C: 67,
  F: 70,
  R: 82,
  H: 72,
  Q: 81,
};

const DIRECTIONS = ['up', 'left', 'down', 'right'] as const;
type Direction = (typeof DIRECTIONS)[number];
const ARROW: Readonly<Record<Direction, string>> = { up: '▲', left: '◀', down: '▼', right: '▶' };

function dispatchKey(type: 'keydown' | 'keyup', code: string): void {
  const keyCode = KEY_CODES[code];
  if (keyCode === undefined) return;

  const event = new KeyboardEvent(type, { bubbles: true, cancelable: true });
  // `KeyboardEvent` 생성자는 `keyCode` 를 안 받는다(표준상 읽기 전용). Phaser 는
  // `event.key`/`.code` 가 아니라 `event.keyCode` 만 본다 — 그래서 강제로 덮는다.
  Object.defineProperty(event, 'keyCode', { get: () => keyCode });
  window.dispatchEvent(event);
}

function injectStyleOnce(): void {
  if (document.getElementById('touch-controls-style')) return;

  const style = document.createElement('style');
  style.id = 'touch-controls-style';
  style.textContent = `
    #touch-controls { display: none; }
    @media (pointer: coarse) {
      #touch-controls { display: block; }
    }
    #touch-controls {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 1000;
      touch-action: none;
      -webkit-touch-callout: none;
      user-select: none;
    }
    #touch-controls .tc-dpad {
      position: absolute;
      left: 14px;
      bottom: 14px;
      width: 132px;
      height: 132px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(3, 1fr);
      gap: 4px;
    }
    #touch-controls .tc-vertical {
      position: absolute;
      left: 14px;
      bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    #touch-controls .tc-vertical .tc-dir {
      width: 48px;
      height: 48px;
    }
    #touch-controls .tc-actions {
      position: absolute;
      right: 14px;
      bottom: 14px;
      display: flex;
      flex-direction: row-reverse;
      align-items: flex-end;
      gap: 10px;
    }
    #touch-controls .tc-extra {
      position: absolute;
      top: 14px;
      right: 14px;
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
      max-width: 200px;
    }
    #touch-controls button {
      pointer-events: auto;
      border: 1px solid #3a3f4d;
      background: rgba(11, 12, 16, 0.6);
      color: #e8e3d3;
      font-family: monospace;
      -webkit-tap-highlight-color: transparent;
    }
    #touch-controls button:active,
    #touch-controls button.tc-pressed {
      background: rgba(200, 161, 90, 0.35);
      border-color: #c8a15a;
    }
    #touch-controls .tc-dir {
      border-radius: 10px;
      font-size: 16px;
    }
    #touch-controls .tc-primary {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      font-size: 11px;
    }
    #touch-controls .tc-pill {
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 10px;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

export class TouchControls {
  private readonly root: HTMLDivElement;

  constructor() {
    injectStyleOnce();
    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    document.body.appendChild(this.root);
  }

  /** 씬이 바뀔 때마다 부른다. 그 씬의 배치로 버튼을 통째로 다시 그린다. */
  setKeys(keys: SceneKeys): void {
    this.root.replaceChildren();

    const entries = Object.entries(keys);
    const present = DIRECTIONS.filter((d) => d in keys);

    // 메뉴류(MENU_KEYS 등)는 위/아래만 있고 좌/우가 없다. 넷이 다 있을 때만
    // 십자 D-패드를, 위/아래만 있으면 세로 두 칸을 그린다 — 그러지 않으면
    // "위"가 방향이 아니라 그냥 버튼 취급되어 확인(주 동작) 자리를 뺏는다.
    if (present.length === 4) {
      this.root.appendChild(this.buildDpad());
    } else if (present.length === 2 && present.includes('up') && present.includes('down')) {
      this.root.appendChild(this.buildVertical());
    }

    const rest = entries.filter(([id]) => !present.includes(id as Direction));
    if (rest.length === 0) return;

    // 첫 번째(대개 확인/조사)를 큼직한 원형 버튼으로, 나머지는 오른쪽 위에 작게.
    const [primary, ...secondary] = rest;
    const primaryCode = primary?.[1].keys[0];
    if (primary && primaryCode !== undefined) {
      const actions = document.createElement('div');
      actions.className = 'tc-actions';
      actions.appendChild(this.buildButton(primaryCode, primary[1].label, 'tc-primary'));
      this.root.appendChild(actions);
    }

    if (secondary.length > 0) {
      const extra = document.createElement('div');
      extra.className = 'tc-extra';
      for (const [, binding] of secondary) {
        const code = binding.keys[0];
        if (code === undefined) continue;
        extra.appendChild(this.buildButton(code, binding.label, 'tc-pill'));
      }
      this.root.appendChild(extra);
    }
  }

  destroy(): void {
    this.root.remove();
  }

  private buildDpad(): HTMLDivElement {
    const dpad = document.createElement('div');
    dpad.className = 'tc-dpad';

    const cellOf: Readonly<Record<Direction, number>> = { up: 2, left: 4, down: 8, right: 6 };
    for (let i = 1; i <= 9; i += 1) {
      const direction = DIRECTIONS.find((d) => cellOf[d] === i);
      if (direction === undefined) {
        const spacer = document.createElement('div');
        dpad.appendChild(spacer);
        continue;
      }
      dpad.appendChild(this.buildDirectionButton(direction));
    }

    return dpad;
  }

  private buildVertical(): HTMLDivElement {
    const stack = document.createElement('div');
    stack.className = 'tc-vertical';
    stack.appendChild(this.buildDirectionButton('up'));
    stack.appendChild(this.buildDirectionButton('down'));
    return stack;
  }

  private buildDirectionButton(direction: Direction): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tc-dir';
    button.textContent = ARROW[direction];
    this.wirePress(button, direction.toUpperCase());
    return button;
  }

  private buildButton(code: string, label: string, className: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    this.wirePress(button, code);
    return button;
  }

  private wirePress(button: HTMLButtonElement, code: string): void {
    const down = (event: Event): void => {
      event.preventDefault();
      button.classList.add('tc-pressed');
      dispatchKey('keydown', code);
    };
    const up = (event: Event): void => {
      event.preventDefault();
      button.classList.remove('tc-pressed');
      dispatchKey('keyup', code);
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('pointerleave', up);
  }
}

let instance: TouchControls | null = null;

/** 씬마다 새로 만들지 않는다 — 전환마다 깜빡이고, 씬은 늘 하나만 떠 있다(scene.start). */
export function getTouchControls(): TouchControls {
  instance ??= new TouchControls();
  return instance;
}
