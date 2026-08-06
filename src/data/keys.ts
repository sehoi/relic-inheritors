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
  // **`S` 에서 옮겼다.** 아래로 걷기와 겹쳐 한 칸 내려갈 때마다 세이브 화면이 열렸다.
  // `F5` 는 PC 게임의 관례이고, 무엇보다 이동 키와 겹칠 일이 없다.
  save: { label: '저장', keys: ['F5'] },
  help: { label: '도움말', keys: ['H'] },
} as const satisfies SceneKeys;

export const BATTLE_KEYS = {
  up: { label: '위', keys: ['UP'], group: '고르기' },
  down: { label: '아래', keys: ['DOWN'], group: '고르기' },
  confirm: { label: '결정', keys: ['ENTER', 'SPACE'] },
  cancel: { label: '취소', keys: ['ESC'] },
} as const satisfies SceneKeys;

export const RELIC_KEYS = {
  up: { label: '위', keys: ['UP'], group: '고르기' },
  left: { label: '왼쪽', keys: ['LEFT'], group: '고르기' },
  down: { label: '아래', keys: ['DOWN'], group: '고르기' },
  right: { label: '오른쪽', keys: ['RIGHT'], group: '고르기' },
  confirm: { label: '끼우기 · 빼기', keys: ['ENTER', 'SPACE'] },
  cancel: { label: '닫기', keys: ['ESC', 'Q'] },
} as const satisfies SceneKeys;

export const SAVE_KEYS = {
  up: { label: '위', keys: ['UP'], group: '고르기' },
  down: { label: '아래', keys: ['DOWN'], group: '고르기' },
  confirm: { label: '저장 · 불러오기', keys: ['ENTER', 'SPACE'] },
  erase: { label: '지우기', keys: ['DELETE'] },
  cancel: { label: '닫기', keys: ['ESC', 'Q'] },
} as const satisfies SceneKeys;

export const SHOP_KEYS = {
  up: { label: '위', keys: ['UP'], group: '고르기' },
  down: { label: '아래', keys: ['DOWN'], group: '고르기' },
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
  { scene: '전투', keys: BATTLE_KEYS },
  { scene: '유물', keys: RELIC_KEYS },
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
