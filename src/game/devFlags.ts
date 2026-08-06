/**
 * URL 쿼리로 켜고 끄는 개발용 스위치.
 *
 * `?scene=battle` 로 전투를 바로 띄우고, `?encounters=off` 로 랜덤 인카운터를 끈다.
 *
 * **테스트 전용 뒷문이 아니라 개발 편의 기능이다.** 맵을 손보는 동안 5걸음마다 전투가
 * 터지면 확인이 불가능하고, 전투 UI를 만지는 동안 탐색을 거쳐 들어가야 하면 왕복이 길다.
 * 스모크가 이걸 쓰는 것은 부수 효과일 뿐이다.
 */
import type { ActorId } from '../core/battle/index.js';
import { ROSTER } from '../data/party.js';

function flag(name: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get(name) ?? undefined;
}

export function startingScene(): 'battle' | 'relic' | 'title' {
  const scene = flag('scene');
  if (scene === 'battle') return 'battle';
  if (scene === 'relic') return 'relic';
  return 'title';
}

export function encountersEnabled(): boolean {
  return flag('encounters') !== 'off';
}

/**
 * `?party=full` 이면 동료를 전부 합류시킨 채로 시작한다.
 *
 * **화면이 인원에 따라 깨지는 것을 인원 없이 확인할 수 없다.** 파티 패널이 한 사람당
 * 42px 로 잡혀 있어 넷이 되면 셋째부터 화면 밖으로 나갔는데, 스모크가 늘 시작 인원 둘로
 * 돌아서 스크린샷에도 잡히지 않았다 — 실제로 넷을 모은 사람만 볼 수 있는 버그였다.
 *
 * 유적을 가로질러 동료를 모으는 것을 스모크가 매번 하게 할 수는 없다. 그 여정은 다른
 * 테스트가 볼 일이고, 여기서 필요한 것은 **넷인 상태의 화면**뿐이다.
 */
export function startWithFullParty(): boolean {
  return flag('party') === 'full';
}

/**
 * `?mobs=all` 이면 잡몹 여섯 종을 한 화면에 세운다.
 *
 * **타일 번호는 눈으로 봐야 안다.** 시트에서 번호만 보고 고르면 "떠도는 불씨" 자리에
 * 사람 얼굴이 서 있어도 테스트는 전부 초록이다 — 실제로 그랬다. 종류가 여섯이면
 * 무작위 조우로 전부 확인하는 데 몇 판이 걸릴지 알 수 없으므로, 한 번에 세워 놓고 본다.
 */
export function showAllMobs(): boolean {
  return flag('mobs') === 'all';
}

/**
 * 요청됐으면 동료를 전부 합류시킨다.
 *
 * **파티를 비우는 곳마다 불러야 한다.** 부팅 때 한 번만 했더니 타이틀의 "새로 시작"
 * (`resetParty`)이 도로 지워서, 타이틀을 거쳐 들어오면 플래그가 없는 것과 같았다 —
 * 타이틀을 건너뛰는 `?scene=battle` 에서만 듣던 셈이다.
 */
export function joinFullPartyIfRequested(join: (id: ActorId) => void): void {
  if (!startWithFullParty()) return;
  for (const member of ROSTER) join(member.id);
}
