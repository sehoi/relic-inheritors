import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  SAVE_VERSION,
  SaveError,
  migrateSave,
  parseSave,
  validateSaveReferences,
  type Migration,
  type SaveData,
} from '../../src/core/save/index.js';

/**
 * 세이브 스키마와 마이그레이션 (T-037).
 *
 * **마이그레이션은 아직 하나도 없다** — 스키마가 v1 뿐이기 때문이다. 그래서 기제 자체는
 * 가짜 버전으로 검사한다. 실제 마이그레이션이 생기기 전에 기제가 맞는지 확인해 두지 않으면,
 * 처음 필요해지는 순간이 곧 처음 시험하는 순간이 된다 — 그때는 이미 남의 세이브가 존재한다.
 */

/** 통과하는 최소 세이브. 각 테스트가 필요한 곳만 덮어쓴다. */
function validSave(): Record<string, unknown> {
  return {
    version: SAVE_VERSION,
    savedAt: 1_760_000_000_000,
    playtimeMs: 125_000,
    location: { mapId: 'ruin-entrance', x: 8, y: 6, facing: 'down' },
    party: {
      vanguard: { hp: 40, mp: 12, erosion: 8, ailments: [{ kind: 'poison', turns: 3 }] },
      caster: { hp: 30, mp: 20, erosion: 0, ailments: [] },
    },
    owned: ['ember-coil', 'stone-seal'],
    loadout: { vanguard: ['ember-coil', null], caster: ['stone-seal', null] },
    attunement: { 'ember-coil': 20 },
    inventory: { herb: 3 },
    worldRngState: 123_456,
    collectedSites: ['pillar-cache'],
    exp: 120,
  };
}

/** v1 세이브 — 회수 지점도 경험치도 없던 시절. 실제 마이그레이션 두 단계의 입력이다. */
function v1Save(): Record<string, unknown> {
  const { collectedSites: _sites, exp: _exp, ...rest } = validSave();
  return { ...rest, version: 1 };
}

/** v2 세이브 — 회수 지점은 있고 경험치는 없던 시절. */
function v2Save(): Record<string, unknown> {
  const { exp: _drop, ...rest } = validSave();
  return { ...rest, version: 2 };
}

describe('parseSave', () => {
  it('정상 세이브를 통과시킨다', () => {
    const save = parseSave(validSave());
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.location.mapId).toBe('ruin-entrance');
    expect(save.party['vanguard']?.ailments).toEqual([{ kind: 'poison', turns: 3 }]);
    expect(save.worldRngState).toBe(123_456);
  });

  it('최상위가 객체가 아니면 거부한다', () => {
    expect(() => parseSave('망가진 파일')).toThrow(SaveError);
    expect(() => parseSave(null)).toThrow(SaveError);
  });

  it('버전이 없으면 거부한다', () => {
    const { version: _drop, ...noVersion } = validSave();
    expect(() => parseSave(noVersion)).toThrow(/version/);
  });

  it('문제를 첫 건에서 멈추지 않고 모아서 보고한다', () => {
    // 하나 고치고 재실행하는 왕복은 사람에겐 몇 초지만 루프에겐 이터레이션 하나다.
    try {
      parseSave({ ...validSave(), savedAt: 'x', playtimeMs: -1, worldRngState: null });
      expect.unreachable('던져야 합니다');
    } catch (error) {
      expect((error as { problems: readonly string[] }).problems.length).toBeGreaterThan(2);
    }
  });

  it('아무도 없는 세이브를 거부한다', () => {
    expect(() => parseSave({ ...validSave(), party: {} })).toThrow(/party/);
  });

  it('같은 유물을 두 번 지닐 수 없다', () => {
    expect(() =>
      parseSave({ ...validSave(), owned: ['ember-coil', 'ember-coil'] }),
    ).toThrow(/두 번/);
  });

  it('빈 슬롯(null)은 정상이다', () => {
    const save = parseSave({
      ...validSave(),
      loadout: { vanguard: [null, null], caster: [null, null] },
    });
    expect(save.loadout['vanguard']).toEqual([null, null]);
  });

  it('슬롯에 이상한 값이 들어 있으면 거부한다', () => {
    expect(() =>
      parseSave({ ...validSave(), loadout: { vanguard: [42, null] } }),
    ).toThrow(/슬롯/);
  });

  it('알 수 없는 상태이상을 거부한다', () => {
    const save = validSave();
    expect(() =>
      parseSave({
        ...save,
        party: { vanguard: { hp: 1, mp: 1, erosion: 0, ailments: [{ kind: '저주', turns: 1 }] } },
      }),
    ).toThrow(/kind/);
  });

  it('음수 값을 거부한다', () => {
    const save = validSave();
    expect(() =>
      parseSave({ ...save, party: { vanguard: { hp: -1, mp: 0, erosion: 0, ailments: [] } } }),
    ).toThrow(/hp/);
  });

  it('방향이 네 가지 중 하나여야 한다', () => {
    expect(() =>
      parseSave({ ...validSave(), location: { mapId: 'a', x: 0, y: 0, facing: '북서' } }),
    ).toThrow(/facing/);
  });
});

describe('migrateSave', () => {
  it('현재 버전은 그대로 통과한다', () => {
    expect(migrateSave(validSave())['version']).toBe(SAVE_VERSION);
  });

  it('미래 버전을 거부한다', () => {
    // 옛 빌드가 새 세이브를 열면 모르는 필드를 버리고, 다시 저장하면 데이터가 사라진다.
    expect(() => migrateSave({ ...validSave(), version: SAVE_VERSION + 1 })).toThrow(/더 새로운/);
  });

  it('버전 0 이하를 거부한다', () => {
    expect(() => migrateSave({ ...validSave(), version: 0 })).toThrow(/version/);
  });

  // ── 기제 검사 (가짜 버전) ────────────────────────────────────────────────
  // 실제 마이그레이션이 생기기 전에 기제가 맞는지 확인한다.

  const fake: Readonly<Record<number, Migration>> = {
    1: (data) => ({ ...data, steps: [...((data['steps'] as string[]) ?? []), '1→2'] }),
    2: (data) => ({ ...data, steps: [...((data['steps'] as string[]) ?? []), '2→3'] }),
  };

  it('여러 단계를 순서대로 적용한다', () => {
    const result = migrateSave({ version: 1 }, fake, 3);
    expect(result['steps']).toEqual(['1→2', '2→3']);
    expect(result['version']).toBe(3);
  });

  it('중간부터도 올린다', () => {
    expect(migrateSave({ version: 2 }, fake, 3)['steps']).toEqual(['2→3']);
  });

  it('버전을 매 단계마다 올린다 (마이그레이션이 잊어도)', () => {
    // 각 단계가 version 을 직접 손대게 하면 언젠가 하나가 빠뜨린다.
    const forgetful: Readonly<Record<number, Migration>> = { 1: (data) => ({ ...data }) };
    expect(migrateSave({ version: 1 }, forgetful, 2)['version']).toBe(2);
  });

  it('빠진 단계를 이름을 대며 거부한다', () => {
    const gap: Readonly<Record<number, Migration>> = { 1: (data) => data };
    expect(() => migrateSave({ version: 1 }, gap, 3)).toThrow(/v2 → v3/);
  });

  it('원본을 변경하지 않는다', () => {
    const original = { version: 1 };
    migrateSave(original, fake, 3);
    expect(original).toEqual({ version: 1 });
  });

  it('실제 MIGRATIONS 가 현재 버전까지 빈틈없이 이어진다', () => {
    // v1 뿐이라 지금은 통과가 쉽다. SAVE_VERSION 을 올리는 순간 이 테스트가 빨개진다.
    for (let from = 1; from < SAVE_VERSION; from += 1) {
      expect(MIGRATIONS[from], `v${from} → v${from + 1} 마이그레이션이 없습니다`).toBeDefined();
    }
  });

  it('마이그레이션이 빠진 필드를 채우면 검증을 통과한다', () => {
    // 옛 세이브에 없던 필드를 새 버전이 요구하는 상황 — 마이그레이션이 하는 일의 전형이다.
    const { worldRngState: _drop, ...old } = validSave();
    const fills: Readonly<Record<number, Migration>> = {
      1: (data) => ({ ...data, worldRngState: 7 }),
    };

    const upgraded = migrateSave({ ...old, version: 1 }, fills, 2);
    expect(parseSave({ ...upgraded, version: SAVE_VERSION }).worldRngState).toBe(7);
  });

  it('마이그레이션이 필드를 빠뜨리면 검증에서 걸린다', () => {
    // "올렸는데 못 읽는" 상태를 검증이 잡아야 한다. 마이그레이션만 믿으면
    // 잘못 올린 세이브가 그대로 게임에 들어간다.
    const { worldRngState: _drop, ...old } = validSave();
    const forgetful: Readonly<Record<number, Migration>> = { 1: (data) => data };

    const upgraded = migrateSave({ ...old, version: 1 }, forgetful, 2);
    expect(() => parseSave({ ...upgraded, version: SAVE_VERSION })).toThrow(/worldRngState/);
  });
});

describe('실제 마이그레이션', () => {
  it('v1 세이브가 두 단계를 거쳐 올라온다', () => {
    // v1 → v2(회수 지점) → v3(경험치). 한 단계라도 빠지면 여기서 걸린다.
    const save = parseSave(v1Save());
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.collectedSites).toEqual([]);
    expect(save.exp).toBeGreaterThan(0);
  });

  it('올라오는 동안 나머지 값은 손대지 않는다', () => {
    const before = v1Save();
    const save = parseSave(before);

    expect(save.worldRngState).toBe(before['worldRngState']);
    expect(save.attunement).toEqual(before['attunement']);
    expect(save.owned).toEqual(before['owned']);
    expect(save.inventory).toEqual(before['inventory']);
  });

  it('v1 → v2 · 아무것도 줍지 않은 것으로 본다 (안전한 쪽)', () => {
    // "전부 주웠다" 로 보면 아직 못 가본 층의 유물을 영영 잃는다.
    // 다시 주울 수 있는 것은 손해가 아니라 이득이므로 이쪽이 안전하다.
    expect(parseSave(v1Save()).collectedSites).toEqual([]);
  });

  it('v2 → v3 · 옛 파티가 약해지지 않는다', () => {
    // v2 시절 파티는 항상 지역 레벨 6이었다. 경험치 0으로 올리면 레벨 1로 떨어진다 —
    // 세지던 파티가 갑자기 약해지는 셈이라, 그전 수준만큼을 쳐준다.
    expect(parseSave(v2Save()).exp).toBeGreaterThan(0);
  });

  it('v2 의 회수 기록은 유지된다', () => {
    expect(parseSave(v2Save()).collectedSites).toEqual(['pillar-cache']);
  });

  it('최신 세이브는 손대지 않는다', () => {
    expect(parseSave(validSave()).exp).toBe(120);
    expect(parseSave(validSave()).collectedSites).toEqual(['pillar-cache']);
  });
});

describe('validateSaveReferences', () => {
  const known = {
    relics: ['ember-coil', 'stone-seal'],
    maps: ['ruin-entrance', 'ruin-depths'],
    items: ['herb', 'antidote'],
  };
  const save = (): SaveData => parseSave(validSave());

  it('실제 콘텐츠를 가리키면 통과한다', () => {
    expect(() => validateSaveReferences(save(), known)).not.toThrow();
  });

  it('없는 맵을 거부한다', () => {
    expect(() =>
      validateSaveReferences({ ...save(), location: { ...save().location, mapId: 'nope' } }, known),
    ).toThrow(/없는 맵/);
  });

  it('없는 유물을 거부한다', () => {
    // 콘텐츠를 지우면 옛 세이브가 이렇게 된다. 조용히 넘어가면 장착 화면에서 터진다.
    expect(() => validateSaveReferences({ ...save(), owned: ['ghost'] }, known)).toThrow(
      /없는 유물/,
    );
  });

  it('지니지 않은 유물을 끼고 있으면 거부한다', () => {
    expect(() =>
      validateSaveReferences({ ...save(), owned: ['ember-coil'] }, known),
    ).toThrow(/지니지 않은/);
  });

  it('없는 아이템을 거부한다', () => {
    expect(() =>
      validateSaveReferences({ ...save(), inventory: { nope: 1 } }, known),
    ).toThrow(/없는 아이템/);
  });

  it('없는 유물의 숙련도를 거부한다', () => {
    expect(() =>
      validateSaveReferences({ ...save(), attunement: { ghost: 10 } }, known),
    ).toThrow(/숙련도/);
  });

  it('문제를 모아서 보고한다', () => {
    try {
      validateSaveReferences({ ...save(), owned: ['ghost'], inventory: { nope: 1 } }, known);
      expect.unreachable('던져야 합니다');
    } catch (error) {
      expect((error as { problems: readonly string[] }).problems.length).toBeGreaterThan(1);
    }
  });
});
