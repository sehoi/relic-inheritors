/**
 * 카메라 위치 계산 (ADR-001: 순수 TypeScript).
 *
 * Phaser 에도 `setBounds` + `startFollow` 가 있지만 규칙을 core 에 두는 편이 낫다.
 * 맵이 화면보다 작을 때의 처리 같은 경계 조건은 엔진 버전에 따라 달라질 수 있고,
 * 그런 걸 브라우저 띄워서 눈으로 확인하는 건 자율 루프가 가장 못하는 일이다.
 */

import type { TileMap } from './tilemap.js';

export interface Viewport {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

function clampAxis(desired: number, viewport: number, world: number): number {
  // 맵이 화면보다 작으면 클램프할 여지가 없다. 가운데 정렬이 유일하게 자연스러운 답이다.
  if (world <= viewport) return world / 2;

  const half = viewport / 2;
  return Math.min(Math.max(desired, half), world - half);
}

/**
 * 카메라가 바라볼 지점(화면 중심의 월드 좌표).
 *
 * 맵 밖의 빈 공간이 보이지 않도록 가장자리에서 멈춘다.
 * 축마다 독립적으로 판단하므로, 가로로만 긴 맵에서는 세로만 고정된다.
 */
export function clampCameraCenter(map: TileMap, viewport: Viewport, desired: Point): Point {
  return {
    x: clampAxis(desired.x, viewport.width, map.width * map.tileWidth),
    y: clampAxis(desired.y, viewport.height, map.height * map.tileHeight),
  };
}

/** 카메라 중심으로부터 스크롤 좌상단을 구한다. Phaser 의 scrollX/scrollY 에 대응한다. */
export function scrollFromCenter(center: Point, viewport: Viewport): Point {
  return {
    x: center.x - viewport.width / 2,
    y: center.y - viewport.height / 2,
  };
}
