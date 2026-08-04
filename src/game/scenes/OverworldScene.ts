import Phaser from 'phaser';
import rawRuinEntrance from '../../data/maps/ruin-entrance.tmj?raw';
import { parseTiledMap, type TileMap } from '../../core/world/tilemap.js';
import {
  directionVector,
  spawnWalker,
  stepWalker,
  type Direction,
  type Walker,
} from '../../core/world/movement.js';
import { clampCameraCenter, scrollFromCenter, type Viewport } from '../../core/world/camera.js';
import { assetCatalog } from '../assets/catalog.js';
import { renderTilemapLayer } from '../world/renderTilemap.js';
import { markCamera, markScene, markWalker } from '../domState.js';

/** 한 칸 이동에 걸리는 시간. 이 동안 입력은 무시된다. */
const STEP_DURATION = 110;

/**
 * 탐색 씬.
 *
 * 이동 판정은 `core/world/movement`, 카메라 위치는 `core/world/camera` 가 한다.
 * 여기서는 입력을 방향으로 바꾸고, 결과를 화면으로 옮기는 일만 한다.
 */
export class OverworldScene extends Phaser.Scene {
  private map!: TileMap;
  private walker!: Walker;
  private playerView!: Phaser.GameObjects.Container;
  private facingPip!: Phaser.GameObjects.Rectangle;
  private keys!: Record<Direction, Phaser.Input.Keyboard.Key[]>;

  /** 이동 트윈이 도는 동안 입력을 잠근다. 큐에 쌓지 않는다 — 눌린 만큼 미끄러지면 조작감이 나빠진다. */
  private stepping = false;

  constructor() {
    super('overworld');
  }

  create(): void {
    markScene('overworld');

    this.map = parseTiledMap(JSON.parse(rawRuinEntrance));
    this.stepping = false;

    // 월드는 원점에 둔다. 화면에 무엇이 보이는지는 전적으로 카메라가 정한다.
    const world = this.add.container(0, 0);
    world.add(renderTilemapLayer(this, this.map, assetCatalog(), 'ground'));

    this.walker = spawnWalker(this.map);
    this.playerView = this.createPlayerView();
    world.add(this.playerView);

    this.bindKeys();
    this.playerView.setPosition(this.pixelX(this.walker), this.pixelY(this.walker));
    markWalker(this.walker);
    this.updateFacingPip();
    this.followCamera();
  }

  override update(): void {
    // 이동 트윈이 도는 동안에도 카메라는 따라가야 한다. 입력 잠금과 무관하게 매 프레임 갱신한다.
    this.followCamera();

    if (this.stepping) return;

    const direction = this.pressedDirection();
    if (direction === undefined) return;

    const { walker, moved } = stepWalker(this.map, this.walker, direction);
    this.walker = walker;
    markWalker(walker);
    this.updateFacingPip();

    if (!moved) return;

    this.stepping = true;
    this.tweens.add({
      targets: this.playerView,
      x: this.pixelX(walker),
      y: this.pixelY(walker),
      duration: STEP_DURATION,
      onComplete: () => {
        this.stepping = false;
      },
    });
  }

  // ── 카메라 ──────────────────────────────────────────────────────────────

  private followCamera(): void {
    const viewport: Viewport = { width: this.scale.width, height: this.scale.height };
    const center = clampCameraCenter(this.map, viewport, {
      x: this.playerView.x,
      y: this.playerView.y,
    });

    this.cameras.main.centerOn(center.x, center.y);
    markCamera(scrollFromCenter(center, viewport));
  }

  // ── 입력 ────────────────────────────────────────────────────────────────

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      // 키보드가 없는 환경(터치 전용 등)에서도 씬 자체는 떠야 한다.
      this.keys = { up: [], down: [], left: [], right: [] };
      return;
    }

    const key = (code: string): Phaser.Input.Keyboard.Key => keyboard.addKey(code, true, true);
    this.keys = {
      up: [key('UP'), key('W')],
      down: [key('DOWN'), key('S')],
      left: [key('LEFT'), key('A')],
      right: [key('RIGHT'), key('D')],
    };
  }

  /**
   * 눌린 방향 하나. 대각선 입력은 지원하지 않으므로 먼저 발견한 것을 쓴다.
   * 순서를 고정해 두면 두 키를 동시에 눌러도 결과가 항상 같다.
   */
  private pressedDirection(): Direction | undefined {
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      if (this.keys[direction].some((k) => k.isDown)) return direction;
    }
    return undefined;
  }

  // ── 표현 ────────────────────────────────────────────────────────────────

  private createPlayerView(): Phaser.GameObjects.Container {
    const size = this.map.tileWidth;

    // 모래 바닥과 대비되는 색을 쓴다. 스크린샷으로 진행을 확인하는 이상,
    // 배경에 묻히는 표식은 없는 것과 같다. 실제 캐릭터 스프라이트가 들어오면 교체된다.
    const body = this.add.rectangle(0, 0, size - 4, size - 4, 0xb0304a);
    this.facingPip = this.add.rectangle(0, 0, 4, 4, 0xf2e6c9);

    return this.add.container(0, 0, [body, this.facingPip]);
  }

  /** 바라보는 방향을 눈에 보이게 한다 — 이게 없으면 제자리 회전이 아무 반응 없는 것처럼 보인다. */
  private updateFacingPip(): void {
    const vector = directionVector(this.walker.facing);
    const distance = this.map.tileWidth / 2 - 3;
    this.facingPip.setPosition(vector.x * distance, vector.y * distance);
  }

  private pixelX(walker: Walker): number {
    return walker.position.x * this.map.tileWidth + this.map.tileWidth / 2;
  }

  private pixelY(walker: Walker): number {
    return walker.position.y * this.map.tileHeight + this.map.tileHeight / 2;
  }
}
