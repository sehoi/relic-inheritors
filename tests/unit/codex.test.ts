import { describe, expect, it } from 'vitest';
import { buildCodex } from '../../src/core/relic/codex.js';
import { RELICS } from '../../src/data/relics.js';

/**
 * 유물 도감 (T-058).
 *
 * 도감이 답하는 것은 "무엇이 있는가" 다. 그래서 **못 본 유물이 목록에 자리는 차지하되
 * 내용은 비어 있어야** 한다 — 자리까지 없으면 남은 개수를 알 수 없고, 내용까지 있으면
 * 주웠을 때 새로울 것이 없다.
 */

describe('도감', () => {
  it('아무것도 못 봤어도 전체 개수는 알려준다', () => {
    const codex = buildCodex(RELICS, []);

    expect(codex.found).toBe(0);
    expect(codex.total).toBe(Object.keys(RELICS).length);
    expect(codex.entries.length, '자리는 다 있어야 몇 개 남았는지 안다').toBe(codex.total);
  });

  it('못 본 유물의 내용은 넘기지 않는다', () => {
    // 화면이 실수로라도 그리지 못하게 아예 빼둔다. `found` 만 보고 가리는 방식은
    // 그리는 쪽이 한 번 빠뜨리면 내용이 새어 나간다.
    const codex = buildCodex(RELICS, ['ember-coil']);

    for (const entry of codex.entries) {
      if (entry.found) expect(entry.relic, entry.id).toBeDefined();
      else expect(entry.relic, entry.id).toBeUndefined();
    }
  });

  it('본 유물의 수를 센다', () => {
    const codex = buildCodex(RELICS, ['ember-coil', 'stone-seal', 'tide-pearl']);
    expect(codex.found).toBe(3);
  });

  it('없는 유물을 넣어도 수가 부풀지 않는다', () => {
    // 낡은 세이브가 지워진 유물을 가리킬 수 있다. 그걸 세면 진행률이 100% 를 넘는다.
    const codex = buildCodex(RELICS, ['ember-coil', 'deleted-relic']);
    expect(codex.found).toBe(1);
  });

  it('순서가 발견 여부에 흔들리지 않는다', () => {
    // 발견한 것을 앞으로 모으면 새 유물을 주울 때마다 목록이 통째로 움직인다 —
    // 어제 본 자리에 오늘 다른 것이 있다.
    const none = buildCodex(RELICS, []).entries.map((entry) => entry.id);
    const some = buildCodex(RELICS, ['sundering-core']).entries.map((entry) => entry.id);

    expect(some).toEqual(none);
  });

  it('중복해서 넣어도 한 번만 센다', () => {
    expect(buildCodex(RELICS, ['ember-coil', 'ember-coil']).found).toBe(1);
  });
});
