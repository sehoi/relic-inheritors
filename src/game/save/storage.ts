import {
  parseSave,
  validateSaveReferences,
  type KnownIds,
  type SaveData,
} from '../../core/save/index.js';

/**
 * 세이브 저장소 (GDD §6.5, ADR-001).
 *
 * 스키마는 core 가 알고, **어디에 두는지는 여기가 안다.** localStorage 는 브라우저 API 라
 * core 에 둘 수 없다.
 *
 * ## 저장소는 생각보다 자주 실패한다
 *
 * 셋 다 실제로 일어나고, 어느 것도 게임을 멈춰서는 안 된다:
 *
 * - **쓸 수 없다** — 사생활 보호 모드, 쿠키 차단, 용량 0으로 설정된 브라우저
 * - **깨져 있다** — 저장 도중 탭이 닫혔거나, 사람이 개발자 도구로 건드렸거나
 * - **가득 찼다** — 다른 사이트가 할당량을 다 썼거나
 *
 * 그래서 **읽기는 절대 던지지 않는다.** 슬롯 상태를 값으로 돌려주고, 화면이 그대로 보여준다.
 * 깨진 슬롯을 빈 슬롯처럼 감추면 플레이어는 세이브가 사라졌다고 생각한다 —
 * 덮어쓰기 전에 "여기 뭔가 있었는데 못 읽는다" 를 알려주는 편이 정직하다.
 */

export const SLOT_COUNT = 3;

const KEY_PREFIX = 'relic-inheritors:save:';

/** localStorage 의 필요한 부분만. 테스트가 가짜를 넣을 수 있어야 한다. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SlotState =
  | { readonly kind: 'empty' }
  | { readonly kind: 'ok'; readonly save: SaveData }
  /** 무언가 들어 있는데 읽을 수 없다. **감추지 않는다.** */
  | { readonly kind: 'broken'; readonly reason: string };

export type WriteResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * 브라우저 저장소. 쓸 수 없으면 `undefined`.
 *
 * 접근 자체가 던질 수 있어서(쿠키 차단 시 `localStorage` 를 읽는 것만으로 SecurityError)
 * try 로 감싼다. 존재 확인만으로는 부족하다 — 실제로 써 봐야 안다.
 */
export function browserStorage(): SaveStorage | undefined {
  try {
    if (typeof globalThis.localStorage === 'undefined') return undefined;
    const probe = `${KEY_PREFIX}probe`;
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function keyOf(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= SLOT_COUNT) {
    throw new RangeError(`슬롯 번호가 범위를 벗어났습니다: ${index} (0~${SLOT_COUNT - 1})`);
  }
  return `${KEY_PREFIX}${index}`;
}

/**
 * 슬롯 하나를 읽는다. **던지지 않는다.**
 *
 * `known` 을 주면 교차 참조까지 본다 — 콘텐츠가 지워진 뒤의 옛 세이브를 여기서 걸러야
 * 장착 화면에서 터지지 않는다.
 */
export function readSlot(
  index: number,
  storage: SaveStorage | undefined,
  known?: KnownIds,
): SlotState {
  // 슬롯 번호 검사는 try 밖이다. 범위를 벗어난 번호는 저장소 문제가 아니라 **코드 문제**이고,
  // 그걸 "깨진 세이브" 로 감추면 화면에는 멀쩡한 세이브가 깨진 것처럼 보인다.
  const key = keyOf(index);
  if (storage === undefined) return { kind: 'broken', reason: '저장소를 쓸 수 없다' };

  let text: string | null;
  try {
    text = storage.getItem(key);
  } catch (error) {
    return { kind: 'broken', reason: describe(error) };
  }

  if (text === null || text === '') return { kind: 'empty' };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'broken', reason: '내용이 JSON 이 아니다' };
  }

  try {
    const save = parseSave(raw);
    if (known !== undefined) validateSaveReferences(save, known);
    return { kind: 'ok', save };
  } catch (error) {
    return { kind: 'broken', reason: describe(error) };
  }
}

export function readAllSlots(
  storage: SaveStorage | undefined,
  known?: KnownIds,
): readonly SlotState[] {
  return Array.from({ length: SLOT_COUNT }, (_, index) => readSlot(index, storage, known));
}

/**
 * 슬롯에 쓴다. **던지지 않고 사유를 돌려준다.**
 *
 * 용량 초과는 화면에 띄워야 하는 정보다 — 조용히 실패하면 플레이어는 저장된 줄 알고
 * 게임을 끄고, 그때 잃는 것은 되돌릴 수 없다.
 */
export function writeSlot(
  index: number,
  save: SaveData,
  storage: SaveStorage | undefined,
): WriteResult {
  const key = keyOf(index);
  if (storage === undefined) {
    return { ok: false, reason: '이 브라우저에서는 저장할 수 없다' };
  }
  try {
    storage.setItem(key, JSON.stringify(save));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: describe(error) };
  }
}

export function clearSlot(index: number, storage: SaveStorage | undefined): void {
  const key = keyOf(index);
  if (storage === undefined) return;
  try {
    storage.removeItem(key);
  } catch {
    // 지우지 못해도 할 수 있는 일이 없다. 다음 쓰기가 덮어쓴다.
  }
}

/** 예외에서 사람이 읽을 사유만 뽑는다. 화면에 스택을 띄울 수는 없다. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    // 검증 실패는 문제를 여러 건 담고 있다. 첫 줄만 보여주고 나머지는 콘솔이 갖는다.
    const [first] = error.message.split('\n');
    return first ?? error.name;
  }
  return String(error);
}
