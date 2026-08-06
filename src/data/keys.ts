/**
 * 조작 키 배치.
 *
 * **배치와 안내가 같은 곳에서 나와야 한다.** 그러지 않으면 안내는 언젠가 거짓말이 된다 —
 * 키를 옮긴 사람이 안내문까지 고칠 이유가 없기 때문이다. 여기 적힌 것을 씬이 그대로
 * 바인딩하고 도움말 화면이 그대로 읽는다.
 *
 * **한 씬 안에서 같은 키를 두 동작에 매지 않는다.** 실제로 그런 적이 있다 —
 * 탐색 화면에서 `S` 가 아래로 걷기이면서 저장이라, 아래로 한 칸 걸을 때마다
 * 세이브 화면이 열렸다. `tests/unit/keys.test.ts` 가 기계적으로 막는다.
 */

export interface KeyBinding {
  /** 도움말에 뜨는 이름. */
  readonly label: string;
  /** Phaser 키 코드. 앞의 것이 대표 키다. */
  readonly keys: readonly string[];
  /**
   * 도움말에서 한 줄로 묶을 이름. 방향키 넷을 네 줄로 늘어놓으면 읽히지 않는다.
   * 묶어도 **바인딩은 따로 남는다** — 화면에 어떻게 보이느냐가 배치를 바꾸지는 않는다.
   */
  readonly group?: string;
}

export type SceneKeys = Readonly<Record<string, KeyBinding>>;

const MOVE = '이동';

// **십자 순서로 적는다.** 도움말이 같은 자리의 키끼리 묶으므로(`guideRows`),
// 위·아래·왼쪽·오른쪽 순으로 적으면 두 번째 줄이 `W S A D` 가 되어 눈에 걸린다.
export const OVERWORLD_KEYS = {
  up: { label: '위로', keys: ['UP', 'W'], group: MOVE },
  left: { label: '왼쪽', keys: ['LEFT', 'A'], group: MOVE },
  down: { label: '아래로', keys: ['DOWN', 'S'], group: MOVE },
  right: { label: '오른쪽', keys: ['RIGHT', 'D'], group: MOVE },
  interact: { label: '조사 · 대화', keys: ['SPACE', 'ENTER'] },
  relic: { label: '유물 장착', keys: ['R'] },
  /**
   * **`S` → `F5` → `F` 로 두 번 옮겼다.**
   *
   * `S` 는 아래로 걷기와 겹쳐 한 칸 내려갈 때마다 세이브 화면이 열렸다. `F5` 는 그 문제를
   * 풀었지만 펑션키를 누르러 손을 옮겨야 했다 — 나머지 조작이 전부 왼손 자리에 모여 있는데
   * 저장만 벗어나 있었다. `F` 는 왼손 자리이면서 이동·기존 키와 겹치지 않는다.
   */
  save: { label: '저장', keys: ['F'] },
  codex: { label: '유물 도감', keys: ['C'] },
  /**
   * 메뉴 (T-060).
   *
   * **화면마다 단축키를 하나씩 늘리는 것은 한계가 있다.** 지금도 R·F·C·H 넷인데
   * 화면이 더 생기면 외울 것만 늘어난다. `Esc` 로 여는 메뉴가 그 답이고,
   * 단축키는 **아는 사람을 위한 지름길**로 남긴다 — 없애면 익힌 손이 헛돈다.
   */
  menu: { label: '메뉴', keys: ['ESC'] },
  help: { label: '도움말', keys: ['H'] },
} as const satisfies SceneKeys;

export const MENU_KEYS = {
  up: { label: '위', keys: ['UP', 'W'], group: '고르기' },
  down: { label: '아래', keys: ['DOWN', 'S'], group: '고르기' },
  confirm: { label: '연다', keys: ['ENTER', 'SPACE'] },
  cancel: { label: '닫기', keys: ['ESC', 'Q'] },
} as const satisfies SceneKeys;

export const STATUS_KEYS = {
  up: { label: '위', keys: ['UP', 'W'], group: '고르기' },
  down: { label: '아래', keys: ['DOWN', 'S'], group: '고르기' },
  cancel: { label: '닫기', keys: ['ESC', 'Q'] },
} as const satisfies SceneKeys;

export const CODEX_KEYS = {
  up: { label: '위', keys: ['UP', 'W'], group: '넘기기' },
  down: { label: '아래', keys: ['DOWN', 'S'], group: '넘기기' },
  cancel: { label: '닫기', keys: ['ESC', 'Q'] },
} as const satisfies SceneKeys;

/**
 * 메뉴 화면들도 WASD 를 받는다.
 *
 * 탐색에서 WASD 로 걷던 사람이 메뉴에서만 방향키로 손을 옮겨야 했다. **한 게임 안에서
 * 조작을 두 벌 익히게 하지 않는다** — 화면이 바뀌었다고 손이 바뀔 이유는 없다.
 */
export const BATTLE_KEYS = {
  up: { label: '위', keys: ['UP', 'W'], group: '고르기' },
  down: { label: '아래', keys: ['DOWN', 'S'], group: '고르기' },
  confirm: { label: '결정', keys: ['ENTER', 'SPACE'] },
  cancel: { label: '취소', keys: ['ESC', 'Q'] },
} as const satisfies SceneKeys;

export const RELIC_KEYS = {
  up: { label: '위', keys: ['UP', 'W'], group: '고르기' },
  left: { label: '왼쪽', keys: ['LEFT', 'A'], group: '고르기' },
  down: { label: '아래', keys: ['DOWN', 'S'], group: '고르기' },
  right: { label: '오른쪽', keys: ['RIGHT', 'D'], group: '고르기' },
  confirm: { label: '끼우기 · 빼기', keys: ['ENTER', 'SPACE'] },
  cancel: { label: '닫기', keys: ['ESC', 'Q'] },
} as const satisfies SceneKeys;

export const SAVE_KEYS = {
  up: { label: '위', keys: ['UP', 'W'], group: '고르기' },
  down: { label: '아래', keys: ['DOWN', 'S'], group: '고르기' },
  confirm: { label: '저장 · 불러오기', keys: ['ENTER', 'SPACE'] },
  erase: { label: '지우기', keys: ['DELETE'] },
  cancel: { label: '닫기', keys: ['ESC', 'Q'] },
} as const satisfies SceneKeys;

export const SHOP_KEYS = {
  up: { label: '위', keys: ['UP', 'W'], group: '고르기' },
  down: { label: '아래', keys: ['DOWN', 'S'], group: '고르기' },
  confirm: { label: '사기', keys: ['ENTER', 'SPACE'] },
  cancel: { label: '나가기', keys: ['ESC', 'Q'] },
} as const satisfies SceneKeys;

export const TITLE_KEYS = {
  start: { label: '새로 시작', keys: ['ENTER'] },
  resume: { label: '이어하기', keys: ['C'] },
} as const satisfies SceneKeys;

/** 도움말 화면이 이 순서로 보여준다. */
export const KEY_GUIDE: readonly { readonly scene: string; readonly keys: SceneKeys }[] = [
  { scene: '탐색', keys: OVERWORLD_KEYS },
  { scene: '메뉴', keys: MENU_KEYS },
  { scene: '인물', keys: STATUS_KEYS },
  { scene: '전투', keys: BATTLE_KEYS },
  { scene: '유물', keys: RELIC_KEYS },
  { scene: '도감', keys: CODEX_KEYS },
  { scene: '저장', keys: SAVE_KEYS },
  { scene: '상점', keys: SHOP_KEYS },
  { scene: '타이틀', keys: TITLE_KEYS },
];

/** 키 코드를 화면에 쓸 이름으로. 모르는 코드는 그대로 둔다 — 틀린 이름보다 낫다. */
const KEY_NAMES: Readonly<Record<string, string>> = {
  UP: '↑',
  DOWN: '↓',
  LEFT: '←',
  RIGHT: '→',
  SPACE: 'Space',
  ENTER: 'Enter',
  ESC: 'Esc',
  DELETE: 'Del',
};

export function keyName(code: string): string {
  return KEY_NAMES[code] ?? code;
}

/** 도움말 한 줄. 같은 `group` 을 가진 바인딩은 하나로 합쳐진다. */
export interface GuideRow {
  readonly label: string;
  readonly keys: readonly string[];
}

/**
 * 화면 구석에 붙이는 한 줄 안내.
 *
 * 메뉴 화면들이 이 문장을 손으로 적어두고 있었다. 키를 옮기면 같이 고쳐야 하는데
 * 아무도 그러지 않으므로, 배치에서 만들어 낸다.
 */
export function hintLine(keys: SceneKeys): string {
  return guideRows(keys)
    .map((row) => `${row.keys.map(keyName).join('/')} ${row.label}`)
    .join('   ');
}

export function guideRows(keys: SceneKeys): readonly GuideRow[] {
  const rows: (GuideRow & { members?: KeyBinding[] })[] = [];
  const byGroup = new Map<string, number>();

  for (const binding of Object.values(keys)) {
    const group = binding.group;
    if (group === undefined) {
      rows.push({ label: binding.label, keys: [...binding.keys] });
      continue;
    }

    const at = byGroup.get(group);
    if (at === undefined) {
      byGroup.set(group, rows.length);
      rows.push({ label: group, keys: [], members: [binding] });
      continue;
    }
    (rows[at] as { members: KeyBinding[] }).members.push(binding);
  }

  // **대표 키끼리 먼저 묶는다.** 바인딩 순서대로 이으면 `↑ W ↓ S ← A → D` 가 되어
  // 방향키와 WASD 가 뒤섞인다. 자리별로 모으면 `↑ ↓ ← → W A S D` 로 읽힌다.
  return rows.map((row) => {
    const members = row.members;
    if (members === undefined) return { label: row.label, keys: row.keys };

    const depth = Math.max(...members.map((member) => member.keys.length));
    const merged: string[] = [];
    for (let i = 0; i < depth; i += 1) {
      for (const member of members) {
        const code = member.keys[i];
        if (code !== undefined && !merged.includes(code)) merged.push(code);
      }
    }
    return { label: row.label, keys: merged };
  });
}
