import type { DialogueSession } from '../core/dialogue/index.js';
import type { Walker } from '../core/world/movement.js';

/**
 * 게임 상태 일부를 DOM 속성으로 노출한다.
 *
 * 자율 루프는 화면을 "본다"기보다 "질의"한다. 스크린샷 픽셀 비교는 폰트 렌더링 차이만으로도
 * 깨지는 취약한 수단이라, 루프가 매 이터레이션 의존하기엔 부적합하다.
 * `body[data-*]` 한 줄이면 스모크 테스트가 씬 전환과 이동을 확실하게 판정할 수 있다.
 *
 * 이건 디버그 편의 기능이 아니라 **자율 검증의 인터페이스다.**
 * 씬이나 상태를 추가하면 여기도 함께 갱신한다.
 */
export const SCENE_KEYS = ['boot', 'title', 'overworld'] as const;

export type SceneKey = (typeof SCENE_KEYS)[number];

export function markScene(key: SceneKey): void {
  document.body.dataset['scene'] = key;
}

export function markWalker(walker: Walker): void {
  document.body.dataset['player'] = `${walker.position.x},${walker.position.y}`;
  document.body.dataset['facing'] = walker.facing;
}

/** 카메라 좌상단(스크롤). 맵 경계 클램프가 실제로 걸리는지 스모크가 이걸로 판정한다. */
export function markCamera(scroll: { x: number; y: number }): void {
  document.body.dataset['camera'] = `${Math.round(scroll.x)},${Math.round(scroll.y)}`;
}

/** 대화 상태. 닫혀 있으면 `closed`, 열려 있으면 `2/5` 처럼 현재 쪽을 알린다. */
export function markDialogue(session: DialogueSession | undefined): void {
  document.body.dataset['dialogue'] =
    session === undefined ? 'closed' : `${session.index + 1}/${session.pages.length}`;
}
