import { describe, expect, it } from 'vitest';
import {
  AssetIndexError,
  createAssetCatalog,
  parseAssetIndex,
  type AssetIndex,
} from '../../src/core/assets/index.js';

const source = {
  name: 'Kenney Tiny Dungeon',
  url: 'https://kenney.nl/assets/tiny-dungeon',
  license: 'CC0-1.0',
};

const validEntry = {
  key: 'tiles-ruin',
  path: 'assets/tiles/ruin.png',
  kind: 'tileset',
  usage: '유적 던전 타일맵',
  frame: { width: 16, height: 16 },
  source,
};

const indexWith = (...entries: unknown[]): unknown => ({ version: 1, entries });

/** 검증이 어떤 문제를 잡았는지 한 문자열로 눌러서 확인한다. */
const problemsOf = (raw: unknown): string => {
  try {
    parseAssetIndex(raw);
  } catch (error) {
    if (error instanceof AssetIndexError) return error.problems.join('\n');
    throw error;
  }
  throw new Error('검증이 통과했습니다 — 실패를 기대했습니다.');
};

describe('parseAssetIndex', () => {
  it('빈 색인은 유효하다 (에셋이 없는 것과 색인이 깨진 것은 다른 상태다)', () => {
    expect(parseAssetIndex({ version: 1, entries: [] })).toEqual({ version: 1, entries: [] });
  });

  it('정상 항목을 통과시킨다', () => {
    const parsed = parseAssetIndex(indexWith(validEntry));
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.key).toBe('tiles-ruin');
  });

  it('version 이 1이 아니면 거부한다', () => {
    expect(problemsOf({ version: 2, entries: [] })).toMatch(/version/);
  });

  it('entries 가 배열이 아니면 거부한다', () => {
    expect(problemsOf({ version: 1, entries: {} })).toMatch(/배열/);
  });

  it('알 수 없는 kind 를 거부한다', () => {
    expect(problemsOf(indexWith({ ...validEntry, kind: 'video' }))).toMatch(/kind/);
  });

  it('key 중복을 거부한다', () => {
    expect(problemsOf(indexWith(validEntry, validEntry))).toMatch(/중복/);
  });

  it('kebab-case 가 아닌 key 를 거부한다', () => {
    expect(problemsOf(indexWith({ ...validEntry, key: 'Tiles_Ruin' }))).toMatch(/kebab-case/);
  });

  it('assets/ 밖의 경로를 거부한다', () => {
    expect(problemsOf(indexWith({ ...validEntry, path: 'src/secret.png' }))).toMatch(/assets\//);
  });

  it('경로 탈출(..)을 거부한다', () => {
    expect(problemsOf(indexWith({ ...validEntry, path: 'assets/../../etc/passwd' }))).toMatch(
      /\.\./,
    );
  });

  it('확장자 없는 경로를 거부한다', () => {
    expect(problemsOf(indexWith({ ...validEntry, path: 'assets/tiles/ruin' }))).toMatch(/확장자/);
  });

  it('tileset·spritesheet 에 frame 이 없으면 거부한다', () => {
    const { frame: _omitted, ...withoutFrame } = validEntry;
    expect(problemsOf(indexWith(withoutFrame))).toMatch(/frame/);
    expect(problemsOf(indexWith({ ...withoutFrame, kind: 'spritesheet' }))).toMatch(/frame/);
  });

  it('frame 이 양의 정수가 아니면 거부한다', () => {
    expect(problemsOf(indexWith({ ...validEntry, frame: { width: 0, height: 16 } }))).toMatch(
      /양의 정수/,
    );
    expect(problemsOf(indexWith({ ...validEntry, frame: { width: 16.5, height: 16 } }))).toMatch(
      /양의 정수/,
    );
  });

  it('image·audio 는 frame 이 없어도 된다', () => {
    const { frame: _omitted, ...plain } = validEntry;
    expect(() => parseAssetIndex(indexWith({ ...plain, kind: 'image' }))).not.toThrow();
    expect(() =>
      parseAssetIndex(indexWith({ ...plain, kind: 'audio', path: 'assets/audio/bgm.ogg' })),
    ).not.toThrow();
  });

  it('출처가 없거나 허용되지 않은 라이선스면 거부한다', () => {
    const { source: _omitted, ...noSource } = validEntry;
    expect(problemsOf(indexWith(noSource))).toMatch(/source/);
    expect(
      problemsOf(indexWith({ ...validEntry, source: { ...source, license: 'GPL-3.0' } })),
    ).toMatch(/허용되지 않은 라이선스/);
  });

  it('usage 가 비면 거부한다 (용도를 모르면 아무도 재사용하지 못한다)', () => {
    expect(problemsOf(indexWith({ ...validEntry, usage: '  ' }))).toMatch(/usage/);
  });

  it('문제를 하나만 보고하지 않고 전부 모아서 보고한다', () => {
    try {
      parseAssetIndex(indexWith({ key: 'BAD KEY', path: 'nope', kind: 'video' }));
      throw new Error('실패를 기대했습니다.');
    } catch (error) {
      expect(error).toBeInstanceOf(AssetIndexError);
      expect((error as AssetIndexError).problems.length).toBeGreaterThan(3);
    }
  });
});

describe('createAssetCatalog', () => {
  const catalog = createAssetCatalog(parseAssetIndex(indexWith(validEntry)) as AssetIndex);

  it('등재된 키를 찾는다', () => {
    expect(catalog.has('tiles-ruin')).toBe(true);
    expect(catalog.get('tiles-ruin').path).toBe('assets/tiles/ruin.png');
    expect(catalog.keys()).toEqual(['tiles-ruin']);
  });

  it('없는 키는 조용히 undefined 를 주지 않고 던진다', () => {
    expect(() => catalog.get('tiles-town')).toThrow(/색인에 없습니다/);
  });

  it('에러 메시지가 다음에 할 일을 알려준다 (루프가 읽는 메시지다)', () => {
    expect(() => catalog.get('tiles-town')).toThrow(/플레이스홀더/);
    expect(() => catalog.get('tiles-town')).toThrow(/BACKLOG/);
  });
});
