import type { ActorId } from '../core/battle/index.js';

/**
 * 사람 스프라이트.
 *
 * 파티도 NPC도 전부 한 시트에서 나온다 (`chars-roguelike`). 사람마다 다른 시트를 쓰면
 * "이 번호가 어느 시트의 것인지" 를 매번 따져야 하고, 그건 반드시 틀린다.
 *
 * ⚠️ **정면 한 방향뿐이다.** 이 팩(Kenney Roguelike Characters)은 옆·뒤 모습도,
 * 걷기 프레임도 갖고 있지 않다. 그래서 탐색 화면에서 바라보는 방향은 여전히 표식이 말한다.
 * 4방향 걷기는 다른 팩이 들어와야 가능하다 — 백로그의 사람 몫이다.
 */
export const CHARACTER_SHEET = {
  key: 'chars-roguelike',
  columns: 54,
  rows: 12,
} as const;

/** 격자 좌표 → 프레임 번호. 시트 크기가 바뀌면 여기 하나만 고치면 된다. */
export function characterFrame(column: number, row: number): number {
  return row * CHARACTER_SHEET.columns + column;
}

export const CHARACTER_FRAMES = CHARACTER_SHEET.columns * CHARACTER_SHEET.rows;

/**
 * 조합이 끝난 인물들.
 *
 * 이 팩은 종이인형 방식이라 대부분의 칸이 몸통·옷·모자·무기 조각이다.
 * 6~11행의 두 열만 **이미 합쳐진 인물**이라, 합성 기제가 없는 지금 쓸 수 있는 것은 여기뿐이다.
 *
 * 이름은 겉모습을 가리키는 보통명사다. 고유명사는 아직 확정하지 않는다 (GDD §10).
 */
export const PORTRAITS = {
  braided: characterFrame(0, 5),
  elder: characterFrame(1, 5),
  bare: characterFrame(0, 6),
  bearded: characterFrame(1, 6),
  scarred: characterFrame(0, 7),
  plaited: characterFrame(1, 7),
  hooded: characterFrame(0, 8),
  belted: characterFrame(1, 8),
  ginger: characterFrame(0, 9),
  greying: characterFrame(1, 9),
  teal: characterFrame(0, 10),
  horned: characterFrame(1, 10),
  armored: characterFrame(0, 11),
  robed: characterFrame(1, 11),
} as const;

export type PortraitId = keyof typeof PORTRAITS;

/**
 * 파티원의 얼굴.
 *
 * 전위는 갑옷, 술사는 법의. 능력이 유물에서 온다고 해서(ADR-004) 겉모습까지 같을 이유는 없다 —
 * 오히려 누가 누구인지 한눈에 보여야 유물을 누구에게 줄지 고를 수 있다.
 */
export const PARTY_PORTRAITS: Readonly<Record<ActorId, number>> = {
  vanguard: PORTRAITS.armored,
  caster: PORTRAITS.robed,
  warden: PORTRAITS.bearded,
  seeker: PORTRAITS.teal,
};

/** 탐색 화면의 주인공. 파티를 이끄는 전위다. */
export const PLAYER_PORTRAIT = PARTY_PORTRAITS['vanguard'] ?? PORTRAITS.armored;

/** 모르는 액터는 조용히 빈 칸으로 두지 않는다 — 누구인지 모를 뿐 사람이긴 하다. */
export function portraitOf(actorId: ActorId): number {
  return PARTY_PORTRAITS[actorId] ?? PORTRAITS.bare;
}
