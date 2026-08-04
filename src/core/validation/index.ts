/**
 * 데이터 검증 커널 (ADR-001, ADR-008).
 *
 * 이 프로젝트의 검증기들은 공통 성질을 갖는다:
 * - **문제를 첫 건에서 멈추지 않고 전부 모아서 보고한다.** 하나 고치고 재실행하는 왕복이
 *   사람에겐 몇 초지만 자율 루프에겐 통째로 한 이터레이션이다.
 * - **메시지가 다음에 할 일을 알려준다.** 이 메시지는 사람보다 루프가 더 자주 읽는다.
 *
 * 네 곳(에셋 색인, 타일맵, 대화, 포탈)에서 같은 뼈대를 반복해 쓰다 보니
 * 여기로 뽑았다. 새 스키마를 추가할 때 이 커널 위에 올리면 위 두 성질이 공짜로 따라온다.
 */

export class ValidationError extends Error {
  readonly problems: readonly string[];

  constructor(subject: string, problems: readonly string[]) {
    // 주어에 조사를 붙이면 받침 유무에 따라 어색해진다. 붙이지 않는 형태로 고정한다.
    super(`${subject} 검증 실패 (${problems.length}건):\n- ${problems.join('\n- ')}`);
    this.name = 'ValidationError';
    this.problems = problems;
  }
}

/**
 * 문제 수집기.
 *
 * `scope()` 로 경로 접두사를 붙인 하위 수집기를 만들 수 있고, 모든 수집기는 같은 목록에 쌓인다.
 * 중첩 구조를 검사할 때 `entries[3].source.license` 같은 위치를 손으로 이어붙이지 않아도 된다.
 */
export class Problems {
  private constructor(
    private readonly sink: string[],
    private readonly prefix: string,
  ) {}

  static create(): Problems {
    return new Problems([], '');
  }

  scope(segment: string): Problems {
    const next = this.prefix.length === 0 ? segment : `${this.prefix}.${segment}`;
    return new Problems(this.sink, next);
  }

  add(message: string): void {
    this.sink.push(this.prefix.length === 0 ? message : `${this.prefix}: ${message}`);
  }

  get count(): number {
    return this.sink.length;
  }

  get isEmpty(): boolean {
    return this.sink.length === 0;
  }

  list(): readonly string[] {
    return [...this.sink];
  }

  /** 문제가 하나라도 있으면 전부 담아 던진다. */
  throwIfAny(subject: string): void {
    if (this.sink.length > 0) throw new ValidationError(subject, this.sink);
  }
}

// ── 읽기 도우미 ──────────────────────────────────────────────────────────
// 실패하면 문제를 기록하고 undefined 를 돌려준다. 호출부는 undefined 로 짧게 끊는다.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readRecord(
  value: unknown,
  field: string,
  problems: Problems,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    problems.add(`${field} 는 객체여야 합니다.`);
    return undefined;
  }
  return value;
}

export function readText(value: unknown, field: string, problems: Problems): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    problems.add(`${field} 가 비어 있습니다.`);
    return undefined;
  }
  return value;
}

export function readInt(
  value: unknown,
  field: string,
  problems: Problems,
  options: { min?: number } = {},
): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    problems.add(`${field} 는 정수여야 합니다 (받은 값: ${String(value)}).`);
    return undefined;
  }
  if (options.min !== undefined && value < options.min) {
    problems.add(`${field} 는 ${options.min} 이상이어야 합니다 (받은 값: ${value}).`);
    return undefined;
  }
  return value;
}

export function readOneOf<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  problems: Problems,
): T | undefined {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    problems.add(`${field} 는 ${allowed.join(' | ')} 중 하나여야 합니다 (받은 값: ${String(value)}).`);
    return undefined;
  }
  return value as T;
}

export function readArray(value: unknown, field: string, problems: Problems): unknown[] | undefined {
  if (!Array.isArray(value)) {
    problems.add(`${field} 는 배열이어야 합니다.`);
    return undefined;
  }
  return value;
}

/** 중복 검사기. 같은 값이 두 번 나오면 문제를 기록한다. */
export function createDuplicateGuard(
  label: string,
  problems: Problems,
): (value: string) => boolean {
  const seen = new Set<string>();
  return (value) => {
    if (seen.has(value)) {
      problems.add(`${label} "${value}" 가 중복됩니다.`);
      return false;
    }
    seen.add(value);
    return true;
  };
}
