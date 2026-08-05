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
export const SCENE_KEYS = ['boot', 'title', 'overworld', 'battle'] as const;

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

/** 지금 어느 맵에 있는가. 층 이동이 실제로 일어났는지 스모크가 이걸로 판정한다. */
export function markMap(mapId: string): void {
  document.body.dataset['map'] = mapId;
}

/**
 * 지금 선 칸의 구역과 위험도.
 *
 * 안전지대에서 전투가 벌어지지 않는다는 것은 **아무 일도 일어나지 않음**으로 드러나는
 * 성질이라, 화면만 봐서는 "안전해서 안 나왔는지, 아직 걸음이 모자란지" 구분할 수 없다.
 * 스모크가 그 둘을 가르려면 이 값이 필요하다.
 */
export function markZone(zoneId: string | undefined, encounters: boolean): void {
  document.body.dataset['zone'] = zoneId ?? 'none';
  document.body.dataset['encounterZone'] = encounters ? 'wild' : 'safe';
}

/**
 * 전투 진행 상태.
 *
 * 스모크가 이걸 보고 "지금 입력을 받는 중인지, 연출 중인지, 끝났는지" 를 판정한다.
 * 애니메이션이 도는 동안 키를 넣으면 씹히므로, 대기 조건이 없으면 테스트가 불안정해진다.
 */
export type BattlePhase = 'command' | 'skill' | 'item' | 'target' | 'playing' | 'over';

export function markBattle(phase: BattlePhase, outcome?: string): void {
  document.body.dataset['battlePhase'] = phase;
  if (outcome === undefined) delete document.body.dataset['battleOutcome'];
  else document.body.dataset['battleOutcome'] = outcome;
}

/** 대화 상태. 닫혀 있으면 `closed`, 열려 있으면 `2/5` 처럼 현재 쪽을 알린다. */
export function markDialogue(session: DialogueSession | undefined): void {
  document.body.dataset['dialogue'] =
    session === undefined ? 'closed' : `${session.index + 1}/${session.pages.length}`;
}
