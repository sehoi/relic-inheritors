import { describe, expect, it } from 'vitest';
import {
  KEY_GUIDE,
  OVERWORLD_KEYS,
  guideRows,
  keyName,
  type SceneKeys,
} from '../../src/data/keys.js';

/**
 * 조작 키 배치 (T-055).
 *
 * **한 씬 안에서 같은 키가 두 동작에 매이면 둘 다 일어난다.** 실제로 그랬다 —
 * 탐색 화면의 `S` 가 아래로 걷기이면서 저장이라, 아래로 한 칸 걸을 때마다
 * 세이브 화면이 열렸다. 눈으로 훑어서는 안 잡히는 종류다. 키가 늘어날수록
 * 짝을 지어 확인해야 할 조합이 제곱으로 늘기 때문이다.
 */

function conflicts(keys: SceneKeys): readonly string[] {
  const owners = new Map<string, string[]>();
  for (const [id, binding] of Object.entries(keys)) {
    for (const code of binding.keys) {
      owners.set(code, [...(owners.get(code) ?? []), id]);
    }
  }

  return [...owners]
    .filter(([, ids]) => ids.length > 1)
    .map(([code, ids]) => `${code}: ${ids.join(' ↔ ')}`);
}

describe('키 배치', () => {
  it.each(KEY_GUIDE.map((section) => [section.scene, section.keys] as const))(
    '%s: 한 키가 두 동작에 매이지 않는다',
    (_scene, keys) => {
      const found = conflicts(keys);
      expect(found, `겹치는 키:\n  ${found.join('\n  ')}`).toEqual([]);
    },
  );

  it('저장이 이동 키와 겹치지 않는다', () => {
    // 이 프로젝트에서 실제로 났던 버그다. 위의 일반 검사가 이미 잡지만,
    // **무엇이 잘못됐었는지**를 남겨두지 않으면 다음 사람이 `S` 로 되돌린다.
    const moving = new Set<string>([
      ...OVERWORLD_KEYS.up.keys,
      ...OVERWORLD_KEYS.down.keys,
      ...OVERWORLD_KEYS.left.keys,
      ...OVERWORLD_KEYS.right.keys,
    ]);

    for (const code of OVERWORLD_KEYS.save.keys) {
      expect(moving.has(code), `저장 키 ${code} 가 이동 키이기도 하다`).toBe(false);
    }
  });

  it('모든 씬에 닫거나 나가는 길이 있다', () => {
    // 들어가서 못 나오는 화면은 저장도 못 하고 게임을 껐다 켜야 한다.
    for (const { scene, keys } of KEY_GUIDE) {
      if (scene === '탐색' || scene === '타이틀') continue;
      const hasExit = Object.values(keys).some((binding) =>
        binding.keys.includes('ESC'),
      );
      expect(hasExit, `${scene} 화면에 Esc 가 없다`).toBe(true);
    }
  });
});

describe('도움말', () => {
  it('빠뜨리는 동작이 없다', () => {
    // 안내가 배치에서 나오지 않으면 언젠가 거짓말이 된다. 한 줄로 묶인 것까지 세어
    // **모든 바인딩이 화면에 나타나는지** 확인한다.
    for (const { scene, keys } of KEY_GUIDE) {
      const shown = new Set(guideRows(keys).flatMap((row) => row.keys));
      for (const binding of Object.values(keys)) {
        for (const code of binding.keys) {
          expect(shown.has(code), `${scene}: ${binding.label} 의 ${code} 가 안내에 없다`).toBe(true);
        }
      }
    }
  });

  it('방향키를 한 줄로 묶는다', () => {
    const rows = guideRows(OVERWORLD_KEYS);
    const move = rows.find((row) => row.label === '이동');

    // 방향키끼리, WASD 끼리 모인다. 바인딩 순서대로 이으면 `↑ W ← A` 로 뒤섞인다.
    expect(move?.keys).toEqual(['UP', 'LEFT', 'DOWN', 'RIGHT', 'W', 'A', 'S', 'D']);
    // 묶였으므로 '위로' 같은 개별 이름은 화면에 나오지 않는다.
    expect(rows.map((row) => row.label)).not.toContain('위로');
  });

  it('묶인 줄에서 같은 키를 두 번 적지 않는다', () => {
    for (const { scene, keys } of KEY_GUIDE) {
      for (const row of guideRows(keys)) {
        expect(new Set(row.keys).size, `${scene} · ${row.label}`).toBe(row.keys.length);
      }
    }
  });

  it('읽을 수 있는 이름으로 바꾼다', () => {
    expect(keyName('UP')).toBe('↑');
    expect(keyName('SPACE')).toBe('Space');
    // 모르는 코드는 그대로 — 틀린 이름보다 낫다.
    expect(keyName('F5')).toBe('F5');
  });
});
