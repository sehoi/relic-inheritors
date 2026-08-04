import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { packContaining, parseAssetIndex } from '../../src/core/assets/index.js';

/**
 * 저장소 정합성 테스트 (ADR-006).
 *
 * `assets.test.ts` 가 검증 "로직"을 본다면, 이 파일은 **실제 저장소 상태**를 본다.
 * 루프가 존재하지 않는 에셋을 참조하거나, 출처를 안 적고 파일만 밀어넣는 일을 여기서 막는다.
 *
 * 지금은 에셋이 하나도 없어서 대부분 자명하게 통과한다. 그래도 지금 세워두는 이유는,
 * 첫 에셋이 들어오는 순간부터 규칙이 이미 작동하고 있어야 하기 때문이다.
 */

const ROOT = process.cwd();
const ASSETS_DIR = join(ROOT, 'assets');

/** 색인이 관리하지 않는 문서 파일들 */
const NON_ASSET_FILES = new Set(['index.json', 'CREDITS.md', 'README.md']);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** 저장소 루트 기준 POSIX 경로로 정규화 */
const toRepoPath = (absolute: string): string => relative(ROOT, absolute).split(sep).join('/');

const index = parseAssetIndex(JSON.parse(readFileSync(join(ASSETS_DIR, 'index.json'), 'utf8')));
const credits = readFileSync(join(ASSETS_DIR, 'CREDITS.md'), 'utf8');

describe('assets/index.json', () => {
  it('스키마 검증을 통과한다', () => {
    // 위에서 이미 파싱했다. 여기 도달했다는 것 자체가 통과의 증거다.
    expect(index.version).toBe(1);
  });

  it('등재된 모든 에셋 파일이 실제로 존재한다', () => {
    const missing = index.entries
      .filter((entry) => !existsSync(join(ROOT, entry.path)))
      .map((entry) => `${entry.key} → ${entry.path}`);

    expect(missing, `색인에는 있는데 파일이 없습니다:\n${missing.join('\n')}`).toEqual([]);
  });

  it('assets/ 안에 색인되지 않은 파일이 없다', () => {
    const registered = new Set(index.entries.map((entry) => entry.path));

    const orphans = walk(ASSETS_DIR)
      .map(toRepoPath)
      .filter((path) => !NON_ASSET_FILES.has(path.slice('assets/'.length)))
      .filter((path) => !registered.has(path))
      // 벤더 팩 안의 파일은 팩 선언이 출처를 보증한다 (ADR-007).
      .filter((path) => packContaining(index.packs, path) === undefined);

    expect(
      orphans,
      `파일은 있는데 assets/index.json 에 등재되지 않았습니다:\n${orphans.join('\n')}\n` +
        `entries 에 등재하거나, 제3자 팩이면 packs 에 디렉터리를 선언하세요 (ADR-006/007).`,
    ).toEqual([]);
  });

  it('선언된 벤더 팩 디렉터리가 실제로 존재한다', () => {
    const missing = index.packs
      .filter((pack) => !existsSync(join(ROOT, pack.dir)))
      .map((pack) => pack.dir);

    expect(missing, `packs 에 선언됐는데 디렉터리가 없습니다:\n${missing.join('\n')}`).toEqual([]);
  });

  it('빈 벤더 팩을 선언해두지 않는다 (규칙만 남고 내용이 사라진 상태)', () => {
    const empty = index.packs
      .filter((pack) => walk(join(ROOT, pack.dir)).length === 0)
      .map((pack) => pack.dir);

    expect(empty, `선언됐지만 비어 있는 팩:\n${empty.join('\n')}`).toEqual([]);
  });

  it('모든 출처가 CREDITS.md 에 기록되어 있다', () => {
    const names = [
      ...index.packs.map((pack) => pack.source.name),
      ...index.entries.map((entry) => entry.source.name),
    ];

    const unrecorded = names
      .filter((name, position, all) => all.indexOf(name) === position)
      .filter((name) => !credits.includes(name));

    expect(
      unrecorded,
      `CREDITS.md 에 출처가 없습니다: ${unrecorded.join(', ')}\n` +
        `라이선스 표기는 선택이 아닙니다 (ADR-006).`,
    ).toEqual([]);
  });
});

// 따옴표 바로 뒤에서 시작하고 공백 없이 닫히는 assets/ 경로만 본다.
// - '../../../assets/index.json' 같은 상대 import 는 걸리지 않는다 (따옴표 뒤가 '..' 이므로).
// - "assets/index.json 에 등재하세요" 같은 안내 문구도 걸리지 않는다 (공백 불허).
// 주석 안의 경로는 여전히 걸린다 — 의도적이다. 사라진 에셋을 가리키는 낡은 주석도 오류다.
const ASSET_REFERENCE = /['"`](assets\/[^'"`\s]+)['"`]/g;

/** 색인 파일 자체는 에셋이 아니다. 색인에 자기를 등재할 수는 없다. */
const NOT_AN_ASSET = new Set(['assets/index.json']);

function findAssetReferences(content: string): string[] {
  return [...content.matchAll(ASSET_REFERENCE)]
    .map((match) => match[1])
    .filter((path): path is string => path !== undefined && !NOT_AN_ASSET.has(path));
}

describe('에셋 참조 스캐너', () => {
  // 발동하지 않는 가드레일은 없는 것과 같다. 스캐너가 실제로 잡는지 여기서 증명한다.
  it('따옴표로 감싼 에셋 경로를 찾아낸다', () => {
    expect(findAssetReferences(`this.load.image('hero', 'assets/sprites/hero.png')`)).toEqual([
      'assets/sprites/hero.png',
    ]);
    expect(findAssetReferences(`const p = "assets/audio/bgm.ogg";`)).toEqual([
      'assets/audio/bgm.ogg',
    ]);
  });

  it('상대 import·안내 문구·색인 자신은 오탐하지 않는다', () => {
    expect(findAssetReferences(`import json from '../../../assets/index.json';`)).toEqual([]);
    expect(findAssetReferences(`throw new Error('assets/index.json 에 등재하세요');`)).toEqual([]);
    expect(findAssetReferences('// `assets/index.json` 참조')).toEqual([]);
  });
});

describe('소스 코드의 에셋 참조', () => {
  it('색인에 없는 assets/ 경로를 참조하지 않는다', () => {
    const registered = new Set(index.entries.map((entry) => entry.path));

    const sourceFiles = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'tools'))].filter((file) =>
      file.endsWith('.ts'),
    );

    const violations = sourceFiles.flatMap((file) =>
      findAssetReferences(readFileSync(file, 'utf8'))
        .filter((path) => !registered.has(path))
        .map((path) => `${toRepoPath(file)} → "${path}"`),
    );

    expect(
      violations,
      `색인에 없는 에셋 경로를 참조합니다:\n${violations.join('\n')}\n` +
        `assets/index.json 에 등재하고 queueAssets() 로 로드하세요 (ADR-006).`,
    ).toEqual([]);
  });
});
