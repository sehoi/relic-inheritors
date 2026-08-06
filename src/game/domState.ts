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
export const SCENE_KEYS = [
  'boot',
  'title',
  'overworld',
  'battle',
  'relic',
  'save',
  'shop',
] as const;

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

/**
 * 유물 장착 화면 (T-029).
 *
 * **발동 중인 공명을 노출하는 것이 핵심이다.** 장착을 바꿨을 때 공명이 실제로 붙고 떨어지는지는
 * 화면을 봐서는 "글자가 바뀌었다" 까지만 알 수 있다. 스모크가 조합 설계를 검증하려면
 * 판정 결과 자체가 질의 가능해야 한다 (GDD §6.4).
 */
export function markRelicScreen(state: {
  readonly focus: string;
  readonly slot: string;
  readonly relic: string;
  readonly resonances: readonly string[];
}): void {
  document.body.dataset['relicFocus'] = state.focus;
  document.body.dataset['relicSlot'] = state.slot;
  document.body.dataset['relicCursor'] = state.relic;
  document.body.dataset['resonances'] =
    state.resonances.length === 0 ? 'none' : [...state.resonances].sort().join(',');
}

/**
 * 세이브 슬롯 화면 (T-038).
 *
 * 슬롯 상태를 노출하는 것이 핵심이다. **저장이 실제로 됐는지는 화면 글자로 알 수 없다** —
 * "저장했다" 는 알림은 실패해도 띄울 수 있기 때문이다. 슬롯이 `empty` 에서 `ok` 로
 * 바뀌는 것이 유일하게 믿을 수 있는 신호다.
 */
export function markSaveScreen(state: {
  readonly mode: string;
  readonly slot: number;
  readonly states: readonly string[];
}): void {
  document.body.dataset['saveMode'] = state.mode;
  document.body.dataset['saveSlot'] = String(state.slot);
  document.body.dataset['saveSlots'] = state.states.join(',');
}

/**
 * 이 맵에 남은 회수 지점 수 (T-039).
 *
 * 유물을 주웠는지는 **표식이 사라지는 것**으로만 드러나는데, 그건 화면으로 재기 어렵다.
 * 스모크가 "밟았더니 하나 줄었다" 를 이걸로 판정한다.
 */
export function markSites(remaining: number): void {
  document.body.dataset['sites'] = String(remaining);
}

/**
 * 상점 (T-041b).
 *
 * **샀는지는 지님 개수와 은편으로만 확실히 알 수 있다** — "샀다" 알림은 실패해도 띄울 수 있다.
 * 세이브 화면에서 배운 것과 같다.
 */
export function markShop(state: {
  readonly item: string;
  readonly coins: number;
  readonly owned: number;
}): void {
  document.body.dataset['shopItem'] = state.item;
  document.body.dataset['shopCoins'] = String(state.coins);
  document.body.dataset['shopOwned'] = String(state.owned);
}

/** 파티 레벨 (T-044). 전투를 이겨 레벨이 올랐는지 스모크가 이걸로 판정한다. */
export function markLevel(level: number): void {
  document.body.dataset['level'] = String(level);
}

/**
 * 파티 패널이 몇 명을 그렸고 어디서 끝나는가 (T-057).
 *
 * **인원이 늘면 조용히 화면 밖으로 밀려난다.** 한 사람당 42px 로 잡혀 있어 넷이 되자
 * 셋째부터 잘렸는데, 잘린 쪽은 그냥 안 보일 뿐이라 예외도 콘솔 에러도 나지 않는다.
 * 스모크가 "넷을 그렸는가" 와 "화면 안에서 끝나는가" 를 따로 물을 수 있어야 한다.
 */
export function markPartyPanel(rows: number, bottom: number): void {
  document.body.dataset['partyRows'] = String(rows);
  document.body.dataset['partyBottom'] = String(Math.round(bottom));
}

/**
 * 조작 안내가 떠 있는가 (T-055).
 *
 * 안내는 **글자로만 존재하는 UI** 라 화면에 떴는지 자동으로 확인할 방법이 이것뿐이다.
 * 스크린샷은 사람이 봐야 하고, 사람이 보지 않으면 조용히 사라져 있어도 모른다.
 */
export function markHelp(open: boolean): void {
  document.body.dataset['help'] = open ? 'open' : 'closed';
}

/** 대화 상태. 닫혀 있으면 `closed`, 열려 있으면 `2/5` 처럼 현재 쪽을 알린다. */
export function markDialogue(session: DialogueSession | undefined): void {
  document.body.dataset['dialogue'] =
    session === undefined ? 'closed' : `${session.index + 1}/${session.pages.length}`;
}
