import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/core/validation/index.js';
import {
  portalAt,
  validatePortalNetwork,
  type Portal,
} from '../../src/core/world/portal.js';

const down: Portal = {
  id: 'a-down',
  position: { x: 5, y: 5 },
  target: { mapId: 'b', position: { x: 2, y: 3 }, facing: 'down' },
};

const up: Portal = {
  id: 'b-up',
  position: { x: 2, y: 2 },
  target: { mapId: 'a', position: { x: 5, y: 6 }, facing: 'down' },
};

describe('portalAt', () => {
  it('그 칸의 포탈을 찾는다', () => {
    expect(portalAt([down], 5, 5)?.id).toBe('a-down');
    expect(portalAt([down], 5, 6)).toBeUndefined();
  });
});

describe('validatePortalNetwork', () => {
  it('정상 연결을 통과시킨다', () => {
    expect(() => validatePortalNetwork({ a: [down], b: [up] })).not.toThrow();
  });

  it('도착 지점이 반대편 포탈 위면 거부한다 (무한 왕복 방지)', () => {
    const trap: Portal = { ...down, target: { mapId: 'b', position: { x: 2, y: 2 }, facing: 'down' } };
    expect(() => validatePortalNetwork({ a: [trap], b: [up] })).toThrow(/무한히 오갑니다/);
  });

  it('없는 맵을 가리키면 거부한다', () => {
    const dangling: Portal = { ...down, target: { ...down.target, mapId: 'nowhere' } };
    expect(() => validatePortalNetwork({ a: [dangling], b: [up] })).toThrow(/찾을 수 없습니다/);
  });

  it('id 중복을 거부한다', () => {
    expect(() => validatePortalNetwork({ a: [down], b: [{ ...up, id: 'a-down' }] })).toThrow(
      /중복/,
    );
  });

  it('같은 칸에 겹친 포탈을 거부한다', () => {
    const twin: Portal = { ...down, id: 'a-down-2' };
    expect(() => validatePortalNetwork({ a: [down, twin], b: [up] })).toThrow(/포탈 칸.*중복/);
  });

  it('문제를 전부 모아서 보고한다', () => {
    const broken: Portal = { ...down, target: { mapId: 'nowhere', position: { x: 0, y: 0 }, facing: 'up' } };
    try {
      validatePortalNetwork({ a: [broken, { ...broken, id: 'a-down' }] });
      throw new Error('실패를 기대했습니다.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).problems.length).toBeGreaterThan(1);
    }
  });

  it('포탈이 없는 맵도 허용한다', () => {
    expect(() => validatePortalNetwork({ a: [], b: [] })).not.toThrow();
  });
});
