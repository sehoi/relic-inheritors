/**
 * 유물 도감 (T-058, ADR-001).
 *
 * **능력이 유물에서 나오는 게임에는 유물 목록이 필요하다** (ADR-004). 장착 화면은
 * *지금 가진 것*으로 무엇을 할지 묻지만, 도감은 *무엇이 있는지*에 답한다 — 아직 못 만난
 * 유물이 몇이나 남았는지 모르면 유적에 더 내려갈 이유가 숫자로 잡히지 않는다.
 *
 * **못 본 유물은 가린다.** 전부 펼쳐 보이면 도감이 아니라 설정집이고, 주웠을 때의
 * "이거였구나" 가 사라진다. 대신 **몇 개가 남았는지는 숨기지 않는다** — 그게 목표가 된다.
 */

import type { Relic, RelicId } from './index.js';

export interface CodexEntry {
  readonly id: RelicId;
  /** 한 번이라도 손에 넣었는가. 아니면 이름조차 보여주지 않는다. */
  readonly found: boolean;
  /** 못 본 유물은 `undefined`. 화면이 실수로 내용을 그리지 못하게 아예 빼둔다. */
  readonly relic: Relic | undefined;
}

export interface Codex {
  readonly entries: readonly CodexEntry[];
  readonly found: number;
  readonly total: number;
}

/**
 * 도감을 만든다.
 *
 * 순서는 `catalog` 의 순서를 그대로 따른다 — 발견한 것을 앞으로 모으면 새 유물을 주울
 * 때마다 목록이 통째로 흔들려서, 어제 본 자리에 오늘 다른 것이 있다.
 */
export function buildCodex(
  catalog: Readonly<Record<RelicId, Relic>>,
  discovered: Iterable<RelicId>,
): Codex {
  const seen = new Set(discovered);
  const entries = Object.keys(catalog).map((id) => {
    const found = seen.has(id);
    return { id, found, relic: found ? catalog[id] : undefined } satisfies CodexEntry;
  });

  return {
    entries,
    found: entries.filter((entry) => entry.found).length,
    total: entries.length,
  };
}
