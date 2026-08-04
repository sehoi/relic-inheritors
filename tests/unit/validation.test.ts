import { describe, expect, it } from 'vitest';
import {
  Problems,
  ValidationError,
  createDuplicateGuard,
  readArray,
  readInt,
  readOneOf,
  readRecord,
  readText,
} from '../../src/core/validation/index.js';
import { createRegistry } from '../../src/core/data/registry.js';

describe('Problems', () => {
  it('문제를 모아서 한 번에 던진다 (첫 건에서 멈추지 않는다)', () => {
    const problems = Problems.create();
    problems.add('첫째');
    problems.add('둘째');

    expect(problems.count).toBe(2);
    expect(() => problems.throwIfAny('테스트')).toThrow(ValidationError);
  });

  it('문제가 없으면 던지지 않는다', () => {
    const problems = Problems.create();
    expect(problems.isEmpty).toBe(true);
    expect(() => problems.throwIfAny('테스트')).not.toThrow();
  });

  it('던진 에러가 문제 목록을 그대로 담는다', () => {
    const problems = Problems.create();
    problems.add('사유');
    try {
      problems.throwIfAny('색인');
      throw new Error('실패를 기대했습니다.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).problems).toEqual(['사유']);
      expect((error as Error).message).toContain('색인');
    }
  });

  it('scope 로 경로를 붙이고, 하위 수집기도 같은 목록에 쌓는다', () => {
    const root = Problems.create();
    const entry = root.scope('entries[2]');
    const source = entry.scope('source');

    root.add('최상위 문제');
    entry.add('항목 문제');
    source.add('출처 문제');

    expect(root.list()).toEqual([
      '최상위 문제',
      'entries[2]: 항목 문제',
      'entries[2].source: 출처 문제',
    ]);
    expect(root.count).toBe(3);
  });
});

describe('읽기 도우미', () => {
  it('성공하면 값을, 실패하면 undefined 를 돌려준다', () => {
    const problems = Problems.create();

    expect(readText('있음', 'name', problems)).toBe('있음');
    expect(readText('   ', 'blank', problems)).toBeUndefined();
    expect(readText(42, 'wrongType', problems)).toBeUndefined();

    expect(problems.count).toBe(2);
  });

  it('정수와 최솟값을 검사한다', () => {
    const problems = Problems.create();

    expect(readInt(5, 'n', problems)).toBe(5);
    expect(readInt(5.5, 'frac', problems)).toBeUndefined();
    expect(readInt(0, 'positive', problems, { min: 1 })).toBeUndefined();
    expect(readInt(1, 'positive', problems, { min: 1 })).toBe(1);

    expect(problems.list()).toEqual([
      'frac 는 정수여야 합니다 (받은 값: 5.5).',
      'positive 는 1 이상이어야 합니다 (받은 값: 0).',
    ]);
  });

  it('허용 목록을 벗어나면 무엇이 허용되는지 알려준다', () => {
    const problems = Problems.create();
    expect(readOneOf('up', 'facing', ['up', 'down'] as const, problems)).toBe('up');
    expect(readOneOf('sideways', 'facing', ['up', 'down'] as const, problems)).toBeUndefined();
    expect(problems.list()[0]).toContain('up | down');
  });

  it('객체와 배열을 가려낸다', () => {
    const problems = Problems.create();

    expect(readRecord({ a: 1 }, 'obj', problems)).toEqual({ a: 1 });
    expect(readRecord([], 'arrayAsObj', problems)).toBeUndefined();
    expect(readRecord(null, 'nullAsObj', problems)).toBeUndefined();

    expect(readArray([1], 'arr', problems)).toEqual([1]);
    expect(readArray({}, 'objAsArray', problems)).toBeUndefined();

    expect(problems.count).toBe(3);
  });
});

describe('createDuplicateGuard', () => {
  it('두 번째 등장부터 문제로 기록한다', () => {
    const problems = Problems.create();
    const guard = createDuplicateGuard('키', problems);

    expect(guard('a')).toBe(true);
    expect(guard('b')).toBe(true);
    expect(guard('a')).toBe(false);

    expect(problems.list()).toEqual(['키 "a" 가 중복됩니다.']);
  });
});

describe('createRegistry', () => {
  interface Item {
    id: string;
    label: string;
  }
  const idOf = (item: Item): string => item.id;

  it('조회·목록을 제공한다', () => {
    const registry = createRegistry<Item>(
      '아이템',
      { potion: { id: 'potion', label: '약초' } },
      idOf,
    );

    expect(registry.has('potion')).toBe(true);
    expect(registry.get('potion').label).toBe('약초');
    expect(registry.ids()).toEqual(['potion']);
    expect(registry.all()).toHaveLength(1);
  });

  it('레코드 키와 id 가 어긋나면 만들 때 터진다', () => {
    expect(() =>
      createRegistry<Item>('아이템', { potion: { id: 'elixir', label: 'x' } }, idOf),
    ).toThrow(/다릅니다/);
  });

  it('없는 id 를 조회하면 무엇이 있는지 알려주며 던진다', () => {
    const registry = createRegistry<Item>(
      '아이템',
      { potion: { id: 'potion', label: '약초' } },
      idOf,
    );
    expect(() => registry.get('nope')).toThrow(/potion/);
  });

  it('등재되지 않은 참조를 골라낸다 (콘텐츠 교차 검사의 진입점)', () => {
    const registry = createRegistry<Item>(
      '아이템',
      { potion: { id: 'potion', label: '약초' } },
      idOf,
    );
    expect(registry.missing(['potion', 'ghost', 'phantom'])).toEqual(['ghost', 'phantom']);
  });

  it('빈 모음도 유효하다', () => {
    const registry = createRegistry<Item>('아이템', {}, idOf);
    expect(registry.ids()).toEqual([]);
    expect(() => registry.get('any')).toThrow(/\(없음\)/);
  });
});
