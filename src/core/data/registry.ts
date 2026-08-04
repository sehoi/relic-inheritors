/**
 * ID로 찾는 데이터 모음 (ADR-001, ADR-008).
 *
 * 대화·유물·스킬·아이템·적처럼 "ID 로 참조되는 것"은 전부 같은 문제를 겪는다:
 * 키와 내부 id 가 어긋나거나, 존재하지 않는 ID 를 참조하는 것.
 * 둘 다 런타임에 발견하면 원인을 짚기 어려우므로 여기서 한 번에 막는다.
 */

import { Problems, createDuplicateGuard } from '../validation/index.js';

export interface Registry<T> {
  has(id: string): boolean;
  /** 없으면 던진다. 조용히 undefined 를 돌려주면 화면이 빈 채로 넘어가 버린다. */
  get(id: string): T;
  ids(): string[];
  all(): readonly T[];
  /** 등재되지 않은 참조를 골라낸다. 콘텐츠 테스트가 쓰는 진입점. */
  missing(references: readonly string[]): string[];
}

export function createRegistry<T>(
  subject: string,
  entries: Readonly<Record<string, T>>,
  idOf: (entry: T) => string,
): Registry<T> {
  const problems = Problems.create();
  const guard = createDuplicateGuard('id', problems);

  for (const [key, entry] of Object.entries(entries)) {
    const id = idOf(entry);
    // 키와 id 가 다르면 어느 쪽으로 참조해야 하는지 알 수 없게 된다.
    if (key !== id) problems.add(`레코드 키 "${key}" 와 id "${id}" 가 다릅니다.`);
    guard(id);
  }

  problems.throwIfAny(subject);

  const byId = new Map(Object.entries(entries));

  return {
    has: (id) => byId.has(id),

    get(id) {
      const entry = byId.get(id);
      if (entry === undefined) {
        throw new Error(
          `${subject} "${id}" 가 없습니다.\n` +
            `현재 등록된 것: ${byId.size === 0 ? '(없음)' : [...byId.keys()].join(', ')}`,
        );
      }
      return entry;
    },

    ids: () => [...byId.keys()],
    all: () => [...byId.values()],
    missing: (references) => references.filter((id) => !byId.has(id)),
  };
}
