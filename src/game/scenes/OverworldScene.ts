import Phaser from 'phaser';
import rawRuinEntrance from '../../data/maps/ruin-entrance.tmj?raw';
import { dialogueScript } from '../../data/dialogue.js';
import { npcsForMap, type Npc } from '../../data/npcs.js';
import { parseTiledMap, type TileMap } from '../../core/world/tilemap.js';
import {
  directionVector,
  spawnWalker,
  stepWalker,
  type Direction,
  type Walker,
} from '../../core/world/movement.js';
import { blockedByOccupants, occupantInFront } from '../../core/world/interaction.js';
import { clampCameraCenter, scrollFromCenter, type Viewport } from '../../core/world/camera.js';
import {
  TEXT_BOX_LAYOUT,
  advanceDialogue,
  currentPage,
  isLastPage,
  openDialogue,
  type DialogueSession,
} from '../../core/dialogue/index.js';
import { assetCatalog } from '../assets/catalog.js';
import { renderTilemapLayer } from '../world/renderTilemap.js';
import { TextBox } from '../ui/TextBox.js';
import { markCamera, markDialogue, markScene, markWalker } from '../domState.js';

const MAP_ID = 'ruin-entrance';

/** 한 칸 이동에 걸리는 시간. 이 동안 입력은 무시된다. */
const STEP_DURATION = 110;

/**
 * 탐색 씬.
 *
 * 판정은 전부 core 가 한다 — 이동은 `movement`, 카메라는 `camera`,
 * 상호작용 대상 탐색은 `interaction`, 대화 진행은 `dialogue`.
 * 여기서는 입력을 의도로 바꾸고 결과를 화면으로 옮기는 일만 한다.
 */
export class OverworldScene extends Phaser.Scene {
  private map!: TileMap;
  private walker!: Walker;
  private npcs: readonly Npc[] = [];

  private playerView!: Phaser.GameObjects.Container;
  private facingPip!: Phaser.GameObjects.Rectangle;
  private textBox!: TextBox;

  private moveKeys!: Record<Direction, Phaser.Input.Keyboard.Key[]>;
  private interactKeys: Phaser.Input.Keyboard.Key[] = [];

  /** 이동 트윈이 도는 동안 입력을 잠근다. 큐에 쌓지 않는다 — 눌린 만큼 미끄러지면 조작감이 나빠진다. */
  private stepping = false;
  private dialogue: DialogueSession | undefined;

  constructor() {
    super('overworld');
  }

  create(): void {
    markScene('overworld');

    this.map = parseTiledMap(JSON.parse(rawRuinEntrance));
    this.npcs = npcsForMap(MAP_ID);
    this.stepping = false;
    this.dialogue = undefined;

    // 월드는 원점에 둔다. 화면에 무엇이 보이는지는 전적으로 카메라가 정한다.
    const world = this.add.container(0, 0);
    world.add(renderTilemapLayer(this, this.map, assetCatalog(), 'ground'));
    for (const npc of this.npcs) world.add(this.createNpcView(npc));

    this.walker = spawnWalker(this.map);
    this.playerView = this.createPlayerView();
    world.add(this.playerView);

    this.textBox = new TextBox(this);
    this.bindKeys();

    this.playerView.setPosition(this.pixelX(this.walker), this.pixelY(this.walker));
    markWalker(this.walker);
    markDialogue(undefined);
    this.updateFacingPip();
    this.followCamera();
  }

  override update(): void {
    // 이동 트윈이 도는 동안에도 카메라는 따라가야 한다. 입력 잠금과 무관하게 매 프레임 갱신한다.
    this.followCamera();

    // 대화 중에는 걷지 않는다. 말하면서 걸어가면 대화 상대가 화면 밖으로 나간다.
    if (this.dialogue !== undefined) {
      if (this.interactJustPressed()) this.advanceDialogue();
      return;
    }

    if (this.interactJustPressed()) {
      this.tryTalk();
      return;
    }

    if (this.stepping) return;

    const direction = this.pressedDirection();
    if (direction === undefined) return;

    const { walker, moved } = stepWalker(
      this.map,
      this.walker,
      direction,
      blockedByOccupants(this.npcs),
    );
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

  // ── 대화 ────────────────────────────────────────────────────────────────

  private tryTalk(): void {
    const npc = occupantInFront(this.npcs, this.walker);
    if (npc === undefined) return;

    const session = openDialogue(dialogueScript(npc.dialogueId), TEXT_BOX_LAYOUT);
    this.dialogue = session;
    this.textBox.show(currentPage(session), isLastPage(session));
    markDialogue(session);
  }

  private advanceDialogue(): void {
    if (this.dialogue === undefined) return;

    const next = advanceDialogue(this.dialogue);
    this.dialogue = next;

    if (next === undefined) {
      this.textBox.hide();
    } else {
      this.textBox.show(currentPage(next), isLastPage(next));
    }
    markDialogue(next);
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
      this.moveKeys = { up: [], down: [], left: [], right: [] };
      return;
    }

    const key = (code: string): Phaser.Input.Keyboard.Key => keyboard.addKey(code, true, true);
    this.moveKeys = {
      up: [key('UP'), key('W')],
      down: [key('DOWN'), key('S')],
      left: [key('LEFT'), key('A')],
      right: [key('RIGHT'), key('D')],
    };
    this.interactKeys = [key('SPACE'), key('ENTER')];
  }

  /**
   * 이동은 누르고 있으면 계속 걷지만, 상호작용은 누른 순간에만 반응한다.
   * 그렇지 않으면 키를 한 번 누른 사이에 대화가 끝까지 넘어가 버린다.
   */
  private interactJustPressed(): boolean {
    return this.interactKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
  }

  /**
   * 눌린 방향 하나. 대각선 입력은 지원하지 않으므로 먼저 발견한 것을 쓴다.
   * 순서를 고정해 두면 두 키를 동시에 눌러도 결과가 항상 같다.
   */
  private pressedDirection(): Direction | undefined {
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      if (this.moveKeys[direction].some((k) => k.isDown)) return direction;
    }
    return undefined;
  }

  // ── 표현 ────────────────────────────────────────────────────────────────

  private createNpcView(npc: Npc): Phaser.GameObjects.Image {
    return this.add.image(
      npc.position.x * this.map.tileWidth + this.map.tileWidth / 2,
      npc.position.y * this.map.tileHeight + this.map.tileHeight / 2,
      'tiles-dungeon',
      npc.tile,
    );
  }

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
