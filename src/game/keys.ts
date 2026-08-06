import Phaser from 'phaser';
import type { SceneKeys } from '../data/keys.js';

/**
 * 배치 데이터를 Phaser 키로 바꾼다.
 *
 * 씬마다 `key('UP')` 를 손으로 나열하던 것을 대신한다. 손으로 적으면 배치가 씬 안에
 * 갇혀서 도움말이 그것을 알 수 없고, 무엇보다 **한 키를 두 곳에 적어도 아무도 모른다**
 * (`S` 가 아래로 걷기이면서 저장이던 시절).
 *
 * `enableCapture` 를 켜서 브라우저 기본 동작을 막는다 — 그러지 않으면 방향키가
 * 페이지를 스크롤하고 `F5` 가 새로고침이 된다.
 */
export type BoundKeys = Readonly<Record<string, readonly Phaser.Input.Keyboard.Key[]>>;

export function bindSceneKeys(
  keyboard: Phaser.Input.Keyboard.KeyboardPlugin,
  keys: SceneKeys,
): BoundKeys {
  const bound: Record<string, Phaser.Input.Keyboard.Key[]> = {};
  for (const [id, binding] of Object.entries(keys)) {
    bound[id] = binding.keys.map((code) => keyboard.addKey(code, true, true));
  }
  return bound;
}
