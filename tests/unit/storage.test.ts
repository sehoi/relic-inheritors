import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, type SaveData } from '../../src/core/save/index.js';
import {
  SLOT_COUNT,
  clearSlot,
  readAllSlots,
  readSlot,
  writeSlot,
  type SaveStorage,
} from '../../src/game/save/storage.js';
import { formatPlaytime } from '../../src/game/playtime.js';

/**
 * 세이브 저장소 (T-038).
 *
 * **저장소는 생각보다 자주 실패한다.** 사생활 보호 모드, 저장 도중 닫힌 탭, 가득 찬 할당량 —
 * 셋 다 실제로 일어나고 어느 것도 게임을 멈춰서는 안 된다.
 *
 * 여기 테스트의 대부분이 실패 경로인 이유가 그것이다. 성공 경로는 한 번만 확인하면 되지만
 * 실패 경로는 저마다 다르게 틀어진다.
 */

function fakeStorage(initial: Record<string, string> = {}): SaveStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

function sample(): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: 1_760_000_000_000,
    playtimeMs: 3_600_000,
    location: { mapId: 'ruin-entrance', x: 8, y: 6, facing: 'down' },
    party: { vanguard: { hp: 10, mp: 2, erosion: 5, ailments: [] } },
    owned: ['ember-coil'],
    loadout: { vanguard: ['ember-coil', null] },
    attunement: { 'ember-coil': 15 },
    inventory: { herb: 2 },
    worldRngState: 999,
    collectedSites: ['pillar-cache'],
    exp: 120,
  };
}

const KNOWN = { relics: ['ember-coil'], maps: ['ruin-entrance'], items: ['herb'] };

describe('쓰고 읽기', () => {
  it('쓴 것을 그대로 읽는다', () => {
    const storage = fakeStorage();
    expect(writeSlot(0, sample(), storage).ok).toBe(true);

    const slot = readSlot(0, storage);
    expect(slot.kind).toBe('ok');
    if (slot.kind === 'ok') expect(slot.save).toEqual(sample());
  });

  it('슬롯끼리 섞이지 않는다', () => {
    const storage = fakeStorage();
    writeSlot(0, sample(), storage);
    writeSlot(2, { ...sample(), playtimeMs: 111 }, storage);

    expect(readAllSlots(storage).map((s) => s.kind)).toEqual(['ok', 'empty', 'ok']);
  });

  it('빈 슬롯은 비어 있다고 말한다', () => {
    expect(readSlot(1, fakeStorage()).kind).toBe('empty');
  });

  it('지우면 비워진다', () => {
    const storage = fakeStorage();
    writeSlot(0, sample(), storage);
    clearSlot(0, storage);
    expect(readSlot(0, storage).kind).toBe('empty');
  });

  it('범위 밖 슬롯을 거부한다', () => {
    expect(() => readSlot(SLOT_COUNT, fakeStorage())).toThrow(RangeError);
    expect(() => readSlot(-1, fakeStorage())).toThrow(RangeError);
  });
});

describe('저장소가 없을 때', () => {
  it('읽기는 던지지 않고 사유를 담아 돌려준다', () => {
    const slot = readSlot(0, undefined);
    expect(slot.kind).toBe('broken');
    if (slot.kind === 'broken') expect(slot.reason).toMatch(/저장소/);
  });

  it('쓰기는 던지지 않고 실패를 알린다', () => {
    // 조용히 실패하면 플레이어는 저장된 줄 알고 게임을 끈다.
    const result = writeSlot(0, sample(), undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/저장할 수 없다/);
  });

  it('지우기는 아무 일도 하지 않는다', () => {
    expect(() => clearSlot(0, undefined)).not.toThrow();
  });
});

describe('깨진 슬롯', () => {
  it('JSON 이 아니면 깨진 것으로 본다', () => {
    const storage = fakeStorage({ 'relic-inheritors:save:0': '{망가진' });
    const slot = readSlot(0, storage);

    expect(slot.kind).toBe('broken');
    if (slot.kind === 'broken') expect(slot.reason).toMatch(/JSON/);
  });

  it('스키마를 어기면 깨진 것으로 본다', () => {
    const storage = fakeStorage({
      'relic-inheritors:save:0': JSON.stringify({ version: 1, party: {} }),
    });
    expect(readSlot(0, storage).kind).toBe('broken');
  });

  it('미래 버전은 깨진 것으로 본다 (덮어쓰기 전에 알려야 한다)', () => {
    const storage = fakeStorage({
      'relic-inheritors:save:0': JSON.stringify({ ...sample(), version: SAVE_VERSION + 1 }),
    });
    const slot = readSlot(0, storage);

    expect(slot.kind).toBe('broken');
    if (slot.kind === 'broken') expect(slot.reason).toMatch(/더 새로운/);
  });

  it('없는 콘텐츠를 가리키면 깨진 것으로 본다', () => {
    // 유물을 지운 뒤의 옛 세이브. 여기서 걸러야 장착 화면에서 터지지 않는다.
    const storage = fakeStorage();
    writeSlot(0, { ...sample(), owned: ['deleted-relic'], loadout: {} }, storage);

    expect(readSlot(0, storage, KNOWN).kind).toBe('broken');
    // 교차 참조를 안 보면 통과한다 — 검사 대상을 호출부가 정한다는 뜻이다.
    expect(readSlot(0, storage).kind).toBe('ok');
  });

  it('깨진 슬롯을 빈 슬롯으로 감추지 않는다', () => {
    // 감추면 플레이어는 세이브가 사라졌다고 생각한다.
    const storage = fakeStorage({ 'relic-inheritors:save:1': 'garbage' });
    expect(readAllSlots(storage).map((s) => s.kind)).toEqual(['empty', 'broken', 'empty']);
  });

  it('사유가 한 줄이다 (화면에 스택을 띄울 수 없다)', () => {
    const storage = fakeStorage({ 'relic-inheritors:save:0': JSON.stringify({ version: 1 }) });
    const slot = readSlot(0, storage);

    if (slot.kind !== 'broken') throw new Error('깨진 것으로 봐야 합니다');
    expect(slot.reason).not.toContain('\n');
  });
});

describe('저장소가 던질 때', () => {
  it('용량 초과를 사유로 돌려준다', () => {
    const full: SaveStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('exceeded the quota', 'QuotaExceededError');
      },
      removeItem: () => undefined,
    };

    const result = writeSlot(0, sample(), full);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/quota/i);
  });

  it('읽다가 던져도 게임이 멈추지 않는다', () => {
    const hostile: SaveStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    expect(readSlot(0, hostile).kind).toBe('broken');
  });

  it('지우다가 던져도 게임이 멈추지 않는다', () => {
    const hostile: SaveStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => {
        throw new Error('nope');
      },
    };

    expect(() => clearSlot(0, hostile)).not.toThrow();
  });
});

describe('formatPlaytime', () => {
  it('한 시간 미만은 분만 보여준다', () => {
    expect(formatPlaytime(125_000)).toBe('2분');
    expect(formatPlaytime(0)).toBe('0분');
  });

  it('한 시간 이상은 시간과 분을 보여준다', () => {
    expect(formatPlaytime(3_600_000)).toBe('1시간 0분');
    expect(formatPlaytime(5_400_000)).toBe('1시간 30분');
  });

  it('음수를 0으로 본다', () => {
    expect(formatPlaytime(-1)).toBe('0분');
  });
});
