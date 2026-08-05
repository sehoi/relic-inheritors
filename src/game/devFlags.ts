/**
 * URL 쿼리로 켜고 끄는 개발용 스위치.
 *
 * `?scene=battle` 로 전투를 바로 띄우고, `?encounters=off` 로 랜덤 인카운터를 끈다.
 *
 * **테스트 전용 뒷문이 아니라 개발 편의 기능이다.** 맵을 손보는 동안 5걸음마다 전투가
 * 터지면 확인이 불가능하고, 전투 UI를 만지는 동안 탐색을 거쳐 들어가야 하면 왕복이 길다.
 * 스모크가 이걸 쓰는 것은 부수 효과일 뿐이다.
 */
function flag(name: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get(name) ?? undefined;
}

export function startingScene(): 'battle' | 'title' {
  return flag('scene') === 'battle' ? 'battle' : 'title';
}

export function encountersEnabled(): boolean {
  return flag('encounters') !== 'off';
}
