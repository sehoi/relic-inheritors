/**
 * 현재 씬을 DOM에 노출한다.
 *
 * 자율 루프는 브라우저를 "본다"기보다 "질의"한다. Playwright 스모크와 내장 브라우저가
 * `body[data-scene]` 하나만 보고 씬 전환 성공 여부를 판정할 수 있게 해두면,
 * 스크린샷 픽셀 비교 같은 취약한 수단에 기대지 않아도 된다.
 *
 * 이건 테스트 편의용 훅이 아니라 자율 검증의 인터페이스다. 씬을 추가하면 반드시 함께 호출한다.
 */
export const SCENE_KEYS = ['boot', 'title', 'overworld'] as const;

export type SceneKey = (typeof SCENE_KEYS)[number];

export function markScene(key: SceneKey): void {
  document.body.dataset['scene'] = key;
}
