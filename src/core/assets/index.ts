/**
 * 에셋 색인 (ADR-006, ADR-007)
 *
 * 루프는 그림을 그릴 수 없다. 인터넷에서 임의로 내려받게 두면 라이선스가 오염되고,
 * 존재하지 않는 경로를 참조하는 코드가 조용히 늘어난다.
 *
 * 그래서 규칙을 하나로 줄였다: **`assets/index.json`에 등재된 것만 존재한다.**
 *
 * 다만 제3자 에셋 팩은 수백 개의 파일로 온다(Kenney Tiny Town 은 낱장 타일만 130여 개다).
 * 이를 개별 등재하는 것은 비현실적이므로 **벤더 팩**을 도입했다 —
 * 디렉터리 하나를 출처·라이선스와 함께 선언하면 그 안의 파일은 고아 검사에서 제외된다.
 * 보증("출처 불명 파일이 없다")은 그대로 유지된다. 팩도 출처를 요구받기 때문이다.
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
  /**
   * 타일 사이의 간격(px). 생략하면 0.
   *
   * 팩마다 다르다 — Kenney 의 `_packed` 시트는 간격이 없지만, 일반 시트는 1px 씩 띄운다.
   * 이 값을 틀리면 화면이 비지 않고 **한 칸씩 밀린 그림**이 나오므로, 에셋이 없을 때보다
   * 알아채기 어렵다. 그래서 색인에 명시하게 한다.
   */
  spacing?: number;
}

/**
 * 통째로 들여온 제3자 에셋 디렉터리.
 * 이 안의 파일은 개별 등재 없이도 "출처가 확인된" 것으로 본다.
 * 실제로 코드가 로드하는 파일은 그와 별개로 `entries` 에 등재해야 한다.
 */
export interface AssetPack {
  /** 저장소 루트 기준 디렉터리. `assets/` 로 시작하고 끝에 `/` 를 붙이지 않는다. */
  dir: string;
  source: AssetSource;
}

interface AssetEntryBase {
  /** Phaser 로더 키. 코드에서 이 키로만 에셋을 참조한다. */
  key: string;
  /** 저장소 루트 기준 경로. 반드시 `assets/` 로 시작한다. */
  path: string;
  /** 어디에 쓰는 에셋인지. 사람과 루프 모두 이걸 보고 재사용 여부를 판단한다. */
  usage: string;
  /** 팩 안의 파일이면 팩의 출처를 물려받는다. 결과 객체에는 항상 채워져 있다. */
  source: AssetSource;
}

export type AssetEntry =
  | (AssetEntryBase & { kind: FramedKind; frame: FrameSize })
  | (AssetEntryBase & { kind: PlainKind });

export interface AssetIndex {
  version: 1;
  packs: AssetPack[];
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

function validateSource(raw: unknown, where: string, problems: string[]): AssetSource | undefined {
  if (!isRecord(raw)) {
    problems.push(`${where}: source 는 객체여야 합니다. 출처 없는 에셋은 등재할 수 없습니다 (ADR-006).`);
    return undefined;
  }

  const name = raw['name'];
  const url = raw['url'];
  const license = raw['license'];
  let valid = true;

  if (!isNonEmptyString(name)) {
    problems.push(`${where}: source.name 이 비어 있습니다.`);
    valid = false;
  }
  if (!isNonEmptyString(url)) {
    problems.push(`${where}: source.url 이 비어 있습니다.`);
    valid = false;
  }
  if (!isNonEmptyString(license)) {
    problems.push(`${where}: source.license 가 비어 있습니다.`);
    valid = false;
  } else if (!(ALLOWED_LICENSES as readonly string[]).includes(license)) {
    problems.push(
      `${where}: 허용되지 않은 라이선스 "${license}". 허용: ${ALLOWED_LICENSES.join(', ')}`,
    );
    valid = false;
  }

  if (!valid) return undefined;
  return { name: name as string, url: url as string, license: license as AssetLicense };
}

/** `assets/` 아래의 안전한 상대 경로인가. 반환값이 false 면 problems 에 사유가 쌓인다. */
function isSafeAssetPath(raw: unknown, where: string, label: string, problems: string[]): raw is string {
  if (!isNonEmptyString(raw)) {
    problems.push(`${where}: ${label} 가 비어 있습니다.`);
    return false;
  }
  let valid = true;
  if (!raw.startsWith('assets/')) {
    problems.push(`${where}: ${label} 는 "assets/" 로 시작해야 합니다 (받은 값: "${raw}").`);
    valid = false;
  }
  if (raw.includes('..')) {
    problems.push(`${where}: ${label} 에 ".." 를 쓸 수 없습니다 (받은 값: "${raw}").`);
    valid = false;
  }
  if (raw.includes('\\')) {
    problems.push(`${where}: ${label} 구분자는 "/" 입니다 (받은 값: "${raw}").`);
    valid = false;
  }
  return valid;
}

function parsePacks(raw: unknown, problems: string[]): AssetPack[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push('packs 는 배열이어야 합니다.');
    return [];
  }

  const packs: AssetPack[] = [];
  const seenDirs = new Set<string>();

  raw.forEach((entry, position) => {
    const where = `packs[${position}]`;
    if (!isRecord(entry)) {
      problems.push(`${where}: 객체여야 합니다.`);
      return;
    }

    const dir = entry['dir'];

    // 형식 검사보다 먼저 본다. 여기서 걸리는 이유가 "경로 형식"이 아니라 "규칙의 근간"이라
    // 그에 맞는 메시지를 보여줘야 한다.
    if (dir === 'assets' || dir === 'assets/') {
      problems.push(`${where}: dir 로 "assets" 전체를 선언할 수 없습니다. 고아 검사가 무력화됩니다.`);
      return;
    }

    if (!isSafeAssetPath(dir, where, 'dir', problems)) return;

    if (dir.endsWith('/')) {
      problems.push(`${where}: dir 끝에 "/" 를 붙이지 마세요 (받은 값: "${dir}").`);
      return;
    }
    if (seenDirs.has(dir)) {
      problems.push(`${where}: dir "${dir}" 가 중복됩니다.`);
      return;
    }

    const nested = [...seenDirs].find(
      (other) => dir.startsWith(`${other}/`) || other.startsWith(`${dir}/`),
    );
    if (nested !== undefined) {
      problems.push(`${where}: dir "${dir}" 가 "${nested}" 와 중첩됩니다. 소유가 모호해집니다.`);
      return;
    }

    const source = validateSource(entry['source'], where, problems);
    if (source === undefined) return;

    seenDirs.add(dir);
    packs.push({ dir, source });
  });

  return packs;
}

/** 이 경로를 품고 있는 벤더 팩. 없으면 undefined. */
export function packContaining(
  packs: readonly AssetPack[],
  path: string,
): AssetPack | undefined {
  return packs.find((pack) => path.startsWith(`${pack.dir}/`));
}

function validateEntry(
  raw: unknown,
  position: number,
  seenKeys: Set<string>,
  packs: readonly AssetPack[],
  problems: string[],
): AssetEntry | undefined {
  const where = `entries[${position}]`;

  if (!isRecord(raw)) {
    problems.push(`${where}: 객체여야 합니다.`);
    return undefined;
  }

  const key = raw['key'];
  let keyValid = false;
  if (!isNonEmptyString(key)) {
    problems.push(`${where}: key 가 비어 있습니다.`);
  } else if (!KEY_PATTERN.test(key)) {
    problems.push(`${where}: key 는 kebab-case 여야 합니다 (받은 값: "${key}").`);
  } else if (seenKeys.has(key)) {
    problems.push(`${where}: key "${key}" 가 중복됩니다.`);
  } else {
    seenKeys.add(key);
    keyValid = true;
  }

  const path = raw['path'];
  const pathValid = isSafeAssetPath(path, where, 'path', problems);
  if (pathValid && !/\.[a-z0-9]+$/i.test(path)) {
    problems.push(`${where}: path 에 확장자가 없습니다 (받은 값: "${path}").`);
  }

  const usage = raw['usage'];
  if (!isNonEmptyString(usage)) {
    problems.push(`${where}: usage 가 비어 있습니다. 용도를 모르면 나중에 아무도 재사용하지 못합니다.`);
  }

  // 팩 안의 파일이면 출처를 물려받는다. 중복 기재는 팩과 항목이 어긋날 여지를 만든다.
  let source: AssetSource | undefined;
  if (raw['source'] === undefined) {
    const pack = pathValid ? packContaining(packs, path) : undefined;
    if (pack === undefined) {
      problems.push(
        `${where}: source 가 없습니다. 벤더 팩(packs) 안의 파일이 아니면 출처를 직접 적어야 합니다 (ADR-007).`,
      );
    } else {
      source = pack.source;
    }
  } else {
    source = validateSource(raw['source'], where, problems);
  }

  const kind = raw['kind'];
  if (!isNonEmptyString(kind) || !(ASSET_KINDS as readonly string[]).includes(kind)) {
    problems.push(
      `${where}: kind 는 ${ASSET_KINDS.join(' | ')} 중 하나여야 합니다 (받은 값: ${String(kind)}).`,
    );
    return undefined;
  }

  if (!keyValid || !pathValid || source === undefined || !isNonEmptyString(usage)) {
    return undefined;
  }

  const base: AssetEntryBase = { key: key as string, path, usage, source };

  if ((FRAMED_KINDS as readonly string[]).includes(kind)) {
    const frame = raw['frame'];
    if (!isRecord(frame)) {
      problems.push(`${where}: kind "${kind}" 에는 frame({width,height}) 이 필요합니다.`);
      return undefined;
    }
    const width = frame['width'];
    const height = frame['height'];
    if (!isPositiveInt(width) || !isPositiveInt(height)) {
      problems.push(`${where}: frame.width/height 는 양의 정수여야 합니다.`);
      return undefined;
    }

    const spacing = frame['spacing'];
    if (spacing !== undefined && (typeof spacing !== 'number' || !Number.isInteger(spacing) || spacing < 0)) {
      problems.push(`${where}: frame.spacing 은 0 이상의 정수여야 합니다 (받은 값: ${String(spacing)}).`);
      return undefined;
    }

    return {
      ...base,
      kind: kind as FramedKind,
      frame: spacing === undefined ? { width, height } : { width, height, spacing },
    };
  }

  return { ...base, kind: kind as PlainKind };
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

  const packs = parsePacks(raw['packs'], problems);

  const entriesRaw = raw['entries'];
  if (!Array.isArray(entriesRaw)) {
    problems.push('entries 는 배열이어야 합니다.');
    throw new AssetIndexError(problems);
  }

  const seenKeys = new Set<string>();
  const entries = entriesRaw
    .map((entry, position) => validateEntry(entry, position, seenKeys, packs, problems))
    .filter((entry): entry is AssetEntry => entry !== undefined);

  if (problems.length > 0) {
    throw new AssetIndexError(problems);
  }

  return { version: 1, packs, entries };
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
