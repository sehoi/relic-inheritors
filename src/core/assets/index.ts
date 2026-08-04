/**
 * 에셋 색인 (ADR-006)
 *
 * 루프는 그림을 그릴 수 없다. 인터넷에서 임의로 내려받게 두면 라이선스가 오염되고,
 * 존재하지 않는 경로를 참조하는 코드가 조용히 늘어난다.
 *
 * 그래서 규칙을 하나로 줄였다: **`assets/index.json`에 등재된 것만 존재한다.**
 * 등재되지 않은 경로를 참조하면 유닛 테스트가 실패하고(`tests/unit/assetIndex.test.ts`),
 * 출처가 CREDITS.md에 없으면 역시 실패한다.
 *
 * 이 모듈은 순수 TypeScript다 (ADR-001). Phaser 로더와의 연결은 `src/game/assets/` 담당.
 */

export const ASSET_KINDS = ['image', 'tileset', 'spritesheet', 'audio'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** 프레임 크기가 반드시 필요한 종류. 타일셋·스프라이트시트는 크기를 모르면 쓸 수 없다. */
const FRAMED_KINDS = ['tileset', 'spritesheet'] as const;
type FramedKind = (typeof FRAMED_KINDS)[number];
type PlainKind = Exclude<AssetKind, FramedKind>;

/** 허용 라이선스. 여기 없는 라이선스의 에셋은 색인에 들어올 수 없다. */
export const ALLOWED_LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'OFL-1.1', 'MIT'] as const;
export type AssetLicense = (typeof ALLOWED_LICENSES)[number];

export interface AssetSource {
  /** 에셋 팩 이름. CREDITS.md와 대조된다. */
  name: string;
  url: string;
  license: AssetLicense;
}

export interface FrameSize {
  width: number;
  height: number;
}

interface AssetEntryBase {
  /** Phaser 로더 키. 코드에서 이 키로만 에셋을 참조한다. */
  key: string;
  /** 저장소 루트 기준 경로. 반드시 `assets/` 로 시작한다. */
  path: string;
  /** 어디에 쓰는 에셋인지. 사람과 루프 모두 이걸 보고 재사용 여부를 판단한다. */
  usage: string;
  source: AssetSource;
}

export type AssetEntry =
  | (AssetEntryBase & { kind: FramedKind; frame: FrameSize })
  | (AssetEntryBase & { kind: PlainKind });

export interface AssetIndex {
  version: 1;
  entries: AssetEntry[];
}

/** 검증 실패를 한 번에 모아서 보고한다. 하나씩 고치며 재실행하는 낭비를 막기 위해서다. */
export class AssetIndexError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`에셋 색인이 유효하지 않습니다 (${problems.length}건):\n- ${problems.join('\n- ')}`);
    this.name = 'AssetIndexError';
    this.problems = problems;
  }
}

const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function validateSource(raw: unknown, where: string, problems: string[]): void {
  if (!isRecord(raw)) {
    problems.push(`${where}: source 는 객체여야 합니다. 출처 없는 에셋은 등재할 수 없습니다 (ADR-006).`);
    return;
  }
  if (!isNonEmptyString(raw['name'])) problems.push(`${where}: source.name 이 비어 있습니다.`);
  if (!isNonEmptyString(raw['url'])) problems.push(`${where}: source.url 이 비어 있습니다.`);

  const license = raw['license'];
  if (!isNonEmptyString(license)) {
    problems.push(`${where}: source.license 가 비어 있습니다.`);
  } else if (!(ALLOWED_LICENSES as readonly string[]).includes(license)) {
    problems.push(
      `${where}: 허용되지 않은 라이선스 "${license}". 허용: ${ALLOWED_LICENSES.join(', ')}`,
    );
  }
}

function validatePath(raw: unknown, where: string, problems: string[]): void {
  if (!isNonEmptyString(raw)) {
    problems.push(`${where}: path 가 비어 있습니다.`);
    return;
  }
  if (!raw.startsWith('assets/')) {
    problems.push(`${where}: path 는 "assets/" 로 시작해야 합니다 (받은 값: "${raw}").`);
  }
  if (raw.includes('..')) {
    problems.push(`${where}: path 에 ".." 를 쓸 수 없습니다 (받은 값: "${raw}").`);
  }
  if (raw.includes('\\')) {
    problems.push(`${where}: path 구분자는 "/" 입니다 (받은 값: "${raw}").`);
  }
  if (!/\.[a-z0-9]+$/i.test(raw)) {
    problems.push(`${where}: path 에 확장자가 없습니다 (받은 값: "${raw}").`);
  }
}

function validateEntry(raw: unknown, position: number, seenKeys: Set<string>, problems: string[]): void {
  const where = `entries[${position}]`;

  if (!isRecord(raw)) {
    problems.push(`${where}: 객체여야 합니다.`);
    return;
  }

  const key = raw['key'];
  if (!isNonEmptyString(key)) {
    problems.push(`${where}: key 가 비어 있습니다.`);
  } else if (!KEY_PATTERN.test(key)) {
    problems.push(`${where}: key 는 kebab-case 여야 합니다 (받은 값: "${key}").`);
  } else if (seenKeys.has(key)) {
    problems.push(`${where}: key "${key}" 가 중복됩니다.`);
  } else {
    seenKeys.add(key);
  }

  validatePath(raw['path'], where, problems);

  if (!isNonEmptyString(raw['usage'])) {
    problems.push(`${where}: usage 가 비어 있습니다. 용도를 모르면 나중에 아무도 재사용하지 못합니다.`);
  }

  validateSource(raw['source'], where, problems);

  const kind = raw['kind'];
  if (!isNonEmptyString(kind) || !(ASSET_KINDS as readonly string[]).includes(kind)) {
    problems.push(`${where}: kind 는 ${ASSET_KINDS.join(' | ')} 중 하나여야 합니다 (받은 값: ${String(kind)}).`);
    return;
  }

  if ((FRAMED_KINDS as readonly string[]).includes(kind)) {
    const frame = raw['frame'];
    if (!isRecord(frame)) {
      problems.push(`${where}: kind "${kind}" 에는 frame({width,height}) 이 필요합니다.`);
      return;
    }
    if (!isPositiveInt(frame['width']) || !isPositiveInt(frame['height'])) {
      problems.push(`${where}: frame.width/height 는 양의 정수여야 합니다.`);
    }
  }
}

/**
 * 임의의 JSON을 검증해 `AssetIndex` 로 만든다. 문제가 있으면 전부 모아서 `AssetIndexError` 를 던진다.
 * 빈 색인(`entries: []`)은 유효하다 — 에셋이 아직 없는 것과 색인이 깨진 것은 다른 상태다.
 */
export function parseAssetIndex(raw: unknown): AssetIndex {
  const problems: string[] = [];

  if (!isRecord(raw)) {
    throw new AssetIndexError(['색인 최상위는 객체여야 합니다.']);
  }

  if (raw['version'] !== 1) {
    problems.push(`version 은 1 이어야 합니다 (받은 값: ${String(raw['version'])}).`);
  }

  const entries = raw['entries'];
  if (!Array.isArray(entries)) {
    problems.push('entries 는 배열이어야 합니다.');
    throw new AssetIndexError(problems);
  }

  const seenKeys = new Set<string>();
  entries.forEach((entry, position) => validateEntry(entry, position, seenKeys, problems));

  if (problems.length > 0) {
    throw new AssetIndexError(problems);
  }

  return { version: 1, entries: entries as AssetEntry[] };
}

export interface AssetCatalog {
  has(key: string): boolean;
  /** 없는 키면 던진다. 조용히 undefined 를 돌려주면 화면이 빈 채로 넘어가 버린다. */
  get(key: string): AssetEntry;
  keys(): string[];
  entries(): readonly AssetEntry[];
}

export function createAssetCatalog(index: AssetIndex): AssetCatalog {
  const byKey = new Map(index.entries.map((entry) => [entry.key, entry]));

  return {
    has: (key) => byKey.has(key),

    get(key) {
      const entry = byKey.get(key);
      if (entry === undefined) {
        // 이 메시지는 사람보다 루프가 더 자주 읽는다. 다음에 할 일을 그대로 적어둔다.
        throw new Error(
          `에셋 "${key}" 가 색인에 없습니다 (ADR-006).\n` +
            `assets/index.json 에 등재하거나, 단색 도형 플레이스홀더로 진행하고 ` +
            `docs/BACKLOG.md 에 "에셋 필요: ${key}" 를 추가하세요. 진행을 멈추지 마세요.\n` +
            `현재 등재된 키: ${byKey.size === 0 ? '(없음)' : [...byKey.keys()].join(', ')}`,
        );
      }
      return entry;
    },

    keys: () => [...byKey.keys()],
    entries: () => index.entries,
  };
}
