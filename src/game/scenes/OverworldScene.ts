import Phaser from 'phaser';
import { dialogueScript } from '../../data/dialogue.js';
import { npcsForMap, type Npc } from '../../data/npcs.js';
import { portalsForMap } from '../../data/portals.js';
import { zonesForMap } from '../../data/zones.js';
import { CHARACTER_SHEET, PLAYER_PORTRAIT } from '../../data/characters.js';
import { MAP_NAMES, STARTING_MAP, type MapId } from '../../data/maps.js';
import type { TileMap } from '../../core/world/tilemap.js';
import {
  directionVector,
  spawnWalker,
  stepWalker,
  type Direction,
  type Walker,
} from '../../core/world/movement.js';
import { blockedByOccupants, occupantInFront } from '../../core/world/interaction.js';
import { portalAt, type Portal } from '../../core/world/portal.js';
import { zoneAt, type Zone } from '../../core/world/zone.js';
import { remainingSites, siteAt, type RelicSite } from '../../core/world/site.js';
import { innPrice, type Facility } from '../../core/world/facility.js';
import { sitesForMap } from '../../data/sites.js';
import { CLEANSING, INN, facilitiesForMap } from '../../data/facilities.js';
import { relic } from '../../data/relics.js';
import {
  advanceCounter,
  startCounter,
  type EncounterCounter,
} from '../../core/world/encounter.js';
import { ENCOUNTER_STEPS, rollEncounter } from '../../data/encounters.js';
import {
  cleanseParty,
  coinCount,
  collectSite,
  collected,
  getInventory,
  joinMember,
  partyForBattle,
  partyLevel,
  partySkills,
  restAtInn,
  worldRandom,
} from '../partyStore.js';
import { encountersEnabled } from '../devFlags.js';
import type { BattleEntry } from './BattleScene.js';
import type { RelicEntry } from './RelicScene.js';
import type { SaveEntry } from './SaveScene.js';
import type { ShopEntry } from './ShopScene.js';
import { clampCameraCenter, scrollFromCenter, type Viewport } from '../../core/world/camera.js';
import {
  TEXT_BOX_LAYOUT,
  advanceDialogue,
  currentPage,
  isLastPage,
  openDialogue,
  type DialogueScript,
  type DialogueSession,
} from '../../core/dialogue/index.js';
import { assetCatalog } from '../assets/catalog.js';
import { loadMap } from '../world/mapRegistry.js';
import { renderTilemapLayer } from '../world/renderTilemap.js';
import { TextBox } from '../ui/TextBox.js';
import { LocationBanner } from '../ui/LocationBanner.js';
import {
  markCamera,
  markDialogue,
  markLevel,
  markMap,
  markScene,
  markSites,
  markWalker,
  markZone,
} from '../domState.js';

/** 한 칸 이동에 걸리는 시간. 이 동안 입력은 무시된다. */
const STEP_DURATION = 110;

/** 씬을 다시 시작할 때 넘기는 값. 층을 오갈 때 어디로 내려설지 알려준다. */
export interface OverworldEntry {
  readonly mapId?: MapId;
  readonly arrival?: { readonly position: { x: number; y: number }; readonly facing: Direction };
}

/**
 * 탐색 씬.
 *
 * 판정은 전부 core 가 한다 — 이동은 `movement`, 카메라는 `camera`,
 * 상호작용 대상은 `interaction`, 대화는 `dialogue`, 층 이동은 `portal`.
 * 여기서는 입력을 의도로 바꾸고 결과를 화면으로 옮기는 일만 한다.
 */
export class OverworldScene extends Phaser.Scene {
  private mapId: MapId = STARTING_MAP;
  private entry: OverworldEntry = {};

  private map!: TileMap;
  private walker!: Walker;
  private npcs: readonly Npc[] = [];
  private portals: readonly Portal[] = [];
  private zones: readonly Zone[] = [];
  private facilities: readonly Facility[] = [];
  /** 아직 줍지 않은 회수 지점의 표식. 주우면 지운다. */
  private readonly siteViews = new Map<string, Phaser.GameObjects.Rectangle>();

  private playerView!: Phaser.GameObjects.Container;
  private facingPip!: Phaser.GameObjects.Rectangle;
  private textBox!: TextBox;
  private banner!: LocationBanner;

  private moveKeys!: Record<Direction, Phaser.Input.Keyboard.Key[]>;
  private interactKeys: Phaser.Input.Keyboard.Key[] = [];
  private relicKeys: Phaser.Input.Keyboard.Key[] = [];
  private saveKeys: Phaser.Input.Keyboard.Key[] = [];

  /** 이동 트윈이 도는 동안 입력을 잠근다. 큐에 쌓지 않는다 — 눌린 만큼 미끄러지면 조작감이 나빠진다. */
  private stepping = false;
  private dialogue: DialogueSession | undefined;
  private encounterCounter!: EncounterCounter;
  /** 층 이동이 시작된 뒤의 입력을 전부 무시한다. 씬이 다시 시작되기까지 몇 프레임이 남는다. */
  private leaving = false;

  constructor() {
    super('overworld');
  }

  /** 타이틀에서 그냥 시작하면 데이터가 없다. 그때는 시작 맵의 스폰 지점에서 출발한다. */
  init(entry?: OverworldEntry): void {
    this.entry = entry ?? {};
    this.mapId = this.entry.mapId ?? STARTING_MAP;
  }

  create(): void {
    markScene('overworld');
    markMap(this.mapId);

    this.map = loadMap(this.mapId);
    this.npcs = npcsForMap(this.mapId);
    this.portals = portalsForMap(this.mapId);
    this.zones = zonesForMap(this.mapId);
    this.facilities = facilitiesForMap(this.mapId);
    this.stepping = false;
    this.leaving = false;
    this.dialogue = undefined;
    this.encounterCounter = startCounter(worldRandom(), ENCOUNTER_STEPS);

    // 월드는 원점에 둔다. 화면에 무엇이 보이는지는 전적으로 카메라가 정한다.
    const world = this.add.container(0, 0);
    world.add(renderTilemapLayer(this, this.map, assetCatalog(), 'ground'));
    for (const portal of this.portals) world.add(this.createPortalView(portal));

    this.siteViews.clear();
    for (const site of this.remainingSites()) {
      const view = this.createSiteView(site);
      this.siteViews.set(site.id, view);
      world.add(view);
    }

    for (const facility of this.facilities) world.add(this.createFacilityView(facility));
    for (const npc of this.npcs) world.add(this.createNpcView(npc));

    this.walker = this.startingWalker();
    this.playerView = this.createPlayerView();
    world.add(this.playerView);

    this.banner = new LocationBanner(this);
    this.textBox = new TextBox(this);
    this.bindKeys();

    this.playerView.setPosition(this.pixelX(this.walker), this.pixelY(this.walker));
    markWalker(this.walker);
    markDialogue(undefined);
    markSites(this.remainingSites().length);
    this.updateLocation();
    this.updateFacingPip();
    this.followCamera();
  }

  /** 층 이동으로 들어왔으면 그 지점에서, 아니면 맵의 스폰 지점에서 시작한다. */
  private startingWalker(): Walker {
    const arrival = this.entry.arrival;
    if (arrival === undefined) return spawnWalker(this.map);
    return { position: { x: arrival.position.x, y: arrival.position.y }, facing: arrival.facing };
  }

  override update(): void {
    // 이동 트윈이 도는 동안에도 카메라는 따라가야 한다. 입력 잠금과 무관하게 매 프레임 갱신한다.
    this.followCamera();

    if (this.leaving) return;

    // 대화 중에는 걷지 않는다. 말하면서 걸어가면 대화 상대가 화면 밖으로 나간다.
    if (this.dialogue !== undefined) {
      if (this.interactJustPressed()) this.advanceDialogue();
      return;
    }

    if (this.relicJustPressed()) {
      this.openRelicScreen();
      return;
    }

    if (this.saveJustPressed()) {
      this.openSaveScreen();
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
      // 시설도 NPC 처럼 길을 막는다 — 밟고 지나갈 수 있으면 마주 보는 조작이 성립하지 않는다.
      blockedByOccupants([...this.npcs, ...this.facilities]),
    );
    this.walker = walker;
    markWalker(walker);
    // 표시는 걸음이 시작될 때 갱신한다. 트윈이 끝나기를 기다리면 구역 경계에서
    // 한 걸음 늦게 "안전" 이 떠, 이미 위험한 칸에 서 있는데도 안전해 보인다.
    this.updateLocation();
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
        // 계단이 먼저다. 층을 옮기는 걸음에서 전투가 터지면 어느 층에서 싸우는지 모호해진다.
        if (this.checkPortal()) return;
        // 회수 지점은 전투보다 먼저 본다. 유물을 줍는 걸음에서 습격당하면
        // 무엇을 주웠는지 읽기 전에 화면이 넘어간다.
        if (this.checkSite()) return;
        this.checkEncounter();
      },
    });
  }

  /**
   * 걸음 수를 세다가 임계에 닿으면 전투로 넘어간다 (GDD §6.1).
   * 돌아올 지점을 함께 넘겨 전투 후 제자리에서 이어가게 한다.
   */
  private checkEncounter(): void {
    if (!encountersEnabled()) return;

    // 안전지대에서는 걸음을 세지도 않는다. 세기만 하고 발생만 막으면
    // 야영지를 오래 돌아다닌 뒤 한 발짝 나가자마자 전투가 터진다 — 안전지대가
    // 오히려 함정이 되는 셈이라, 안전한 걸음은 아예 없던 것으로 친다.
    if (!this.currentZone()?.encounters) return;

    const outcome = advanceCounter(this.encounterCounter);
    this.encounterCounter = outcome.counter;
    if (!outcome.triggered) return;

    const rng = worldRandom();
    this.leaving = true;
    this.scene.start('battle', {
      encounter: rollEncounter(this.mapId, rng, {
        party: partyForBattle(),
        partySkills: partySkills(),
        inventory: getInventory(),
      }),
      seed: rng.int(1, 1_000_000),
      returnTo: {
        mapId: this.mapId,
        arrival: { position: this.walker.position, facing: this.walker.facing },
      },
    } satisfies BattleEntry);
  }

  // ── 구역 ────────────────────────────────────────────────────────────────

  private currentZone(): Zone | undefined {
    return zoneAt(this.zones, this.walker.position.x, this.walker.position.y);
  }

  /**
   * 지금 어디에 서 있는지를 화면과 DOM 에 반영한다.
   *
   * 구역을 빠뜨린 칸은 안전한 쪽으로 본다 (`core/world/zone.ts`). 그런 칸이 남아 있으면
   * 콘텐츠 테스트가 먼저 잡으므로, 여기서는 조용히 넘어가도 된다.
   */
  private updateLocation(): void {
    const zone = this.currentZone();
    const encounters = zone?.encounters ?? false;

    this.banner.show(MAP_NAMES[this.mapId], zone?.name, encounters, partyLevel());
    markZone(zone?.id, encounters);
    markLevel(partyLevel());
  }

  // ── 회수 지점 ───────────────────────────────────────────────────────────

  /**
   * 밟은 자리에 유물이 있으면 줍는다 (GDD §6.1, T-039).
   *
   * 주웠으면 `true` — 이번 걸음에서는 전투가 벌어지지 않는다.
   */
  private checkSite(): boolean {
    const site = siteAt(this.remainingSites(), this.walker.position.x, this.walker.position.y);
    if (site === undefined) return false;

    const gained = collectSite(site.id, site.relicId);
    if (gained === undefined) return false;

    this.siteViews.get(site.id)?.destroy();
    this.siteViews.delete(site.id);

    const entry = relic(gained);
    this.dialogue = openDialogue(
      {
        id: `site:${site.id}`,
        // 유물의 기록을 함께 띄운다 — 유물이 곧 서사 단위다 (GDD §2).
        lines: [
          { speaker: '회수', text: `${entry.name} 을(를) 손에 넣었다.` },
          { text: entry.lore },
        ],
      },
      TEXT_BOX_LAYOUT,
    );
    this.textBox.show(currentPage(this.dialogue), isLastPage(this.dialogue));
    markDialogue(this.dialogue);
    markSites(this.remainingSites().length);
    return true;
  }

  private remainingSites(): readonly RelicSite[] {
    return remainingSites(sitesForMap(this.mapId), collected());
  }

  /** 회수 지점 타일이 아직 없어 표식으로 대신한다 (ADR-006). */
  private createSiteView(site: RelicSite): Phaser.GameObjects.Rectangle {
    const size = this.map.tileWidth;
    const marker = this.add.rectangle(
      site.position.x * size + size / 2,
      site.position.y * size + size / 2,
      size - 6,
      size - 6,
      0x8a6a2a,
    );
    marker.setStrokeStyle(1, 0xd8b46a);
    return marker;
  }

  // ── 층 이동 ─────────────────────────────────────────────────────────────

  /**
   * 포탈은 밟으면 발동한다 — 고전 JRPG의 계단 방식이다.
   * 이동 트윈이 끝난 뒤에 확인하는 이유는, 걷는 도중에 화면이 바뀌면 어색하기 때문이다.
   */
  private checkPortal(): boolean {
    const portal = portalAt(this.portals, this.walker.position.x, this.walker.position.y);
    if (portal === undefined) return false;

    this.leaving = true;
    this.scene.restart({
      mapId: portal.target.mapId as MapId,
      arrival: { position: portal.target.position, facing: portal.target.facing },
    } satisfies OverworldEntry);
    return true;
  }

  // ── 대화 ────────────────────────────────────────────────────────────────

  private tryTalk(): void {
    // 시설이 먼저다. 같은 칸에 둘 다 놓이지 않도록 검증이 막지만, 순서를 정해두면
    // 나중에 검증이 느슨해져도 결과가 흔들리지 않는다.
    const facility = occupantInFront(this.facilities, this.walker);
    if (facility !== undefined) {
      this.useFacility(facility);
      return;
    }

    const npc = occupantInFront(this.npcs, this.walker);
    if (npc === undefined) return;

    // 합류는 말을 거는 순간 일어난다 (T-049b). 이미 함께면 다른 대사를 쓴다 —
    // 합류 전 대사를 계속 쓰면 이미 들어온 사람이 또 청한다.
    if (npc.joinsAs !== undefined && joinMember(npc.joinsAs)) {
      this.openLines(dialogueScript(npc.dialogueId));
      return;
    }

    const script = npc.joinsAs !== undefined ? (npc.joinedDialogueId ?? npc.dialogueId) : npc.dialogueId;
    this.openLines(dialogueScript(script));
  }

  /**
   * 시설을 쓴다 (T-040).
   *
   * 결과를 **대화로 알린다.** 침식 막대는 전투 화면에만 있어서, 거점에서 무엇이 달라졌는지
   * 보여줄 다른 자리가 없다.
   */
  private useFacility(facility: Facility): void {
    if (facility.kind === 'inn') {
      this.useInn(facility);
      return;
    }
    if (facility.kind === 'shop') {
      this.leaving = true;
      this.scene.start('shop', {
        returnTo: {
          mapId: this.mapId,
          arrival: { position: this.walker.position, facing: this.walker.facing },
        },
      } satisfies ShopEntry);
      return;
    }
    if (facility.kind !== 'cleansing') {
      this.openLines({
        id: `facility:${facility.id}`,
        lines: [{ speaker: facility.name, text: '아직 아무도 없다.' }],
      });
      return;
    }

    const removed = cleanseParty(CLEANSING);
    this.openLines({
      id: `facility:${facility.id}`,
      lines:
        removed === 0
          ? [{ speaker: facility.name, text: '씻어낼 것이 없다. 아직은 맑다.' }]
          : [
              { speaker: facility.name, text: `물이 탁해진다. 침식 ${removed} 이(가) 씻겨 나갔다.` },
              { text: '완전히 지워지지는 않는다. 한 번 새겨진 것은 남는다.' },
            ],
    });
  }

  /**
   * 여관에서 쉰다 (T-041a).
   *
   * **묻지 않고 바로 쉰다.** 여기까지 걸어와 마주 보고 누른 것이 곧 의사표시다.
   * 예/아니오 창을 띄우려면 대화 시스템에 선택지가 있어야 하는데, 그건 별도 태스크다 —
   * 다만 값을 먼저 알려주지 않고 쓰는 것은 불친절하므로 백로그에 남겼다.
   */
  private useInn(facility: Facility): void {
    const price = innPrice(partyLevel(), INN);
    const party = partyForBattle();
    const rested = party.every((m) => m.hp === m.stats.maxHp && m.mp === m.stats.maxMp);

    if (rested) {
      this.openLines({
        id: `facility:${facility.id}`,
        lines: [{ speaker: facility.name, text: '더 쉴 필요는 없어 보인다.' }],
      });
      return;
    }

    const spent = restAtInn(price);
    this.openLines({
      id: `facility:${facility.id}`,
      lines:
        spent === undefined
          ? [
              { speaker: facility.name, text: `하룻밤에 은편 ${price}. 지금은 ${coinCount()} 뿐이다.` },
            ]
          : [
              { speaker: facility.name, text: `은편 ${spent} 을(를) 치르고 눈을 붙였다.` },
              { text: '몸은 나아졌지만, 새겨진 것은 그대로다.' },
            ],
    });
  }

  private openLines(script: DialogueScript): void {
    const session = openDialogue(script, TEXT_BOX_LAYOUT);
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
      this.relicKeys = [];
      this.saveKeys = [];
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
    this.relicKeys = [key('R')];
    this.saveKeys = [key('S')];
  }

  /**
   * 이동은 누르고 있으면 계속 걷지만, 상호작용은 누른 순간에만 반응한다.
   * 그렇지 않으면 키를 한 번 누른 사이에 대화가 끝까지 넘어가 버린다.
   */
  private interactJustPressed(): boolean {
    return this.interactKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
  }

  private relicJustPressed(): boolean {
    return this.relicKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
  }

  private saveJustPressed(): boolean {
    return this.saveKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
  }

  /** 세이브 화면. 지금 선 자리를 저장 위치로 넘긴다 (T-038). */
  private openSaveScreen(): void {
    this.leaving = true;
    this.scene.start('save', {
      mode: 'save',
      location: {
        mapId: this.mapId,
        x: this.walker.position.x,
        y: this.walker.position.y,
        facing: this.walker.facing,
      },
      returnTo: {
        mapId: this.mapId,
        arrival: { position: this.walker.position, facing: this.walker.facing },
      },
    } satisfies SaveEntry);
  }

  /**
   * 장착 화면으로 넘어간다. 돌아올 자리를 함께 넘겨 제자리에서 이어가게 한다 (T-029).
   *
   * 탐색 중 아무 때나 열 수 있다. 거점에서만 바꾸게 하면 유적 안에서 조합을 바꿀 수 없는데,
   * 그건 조합이 게임의 중심이라는 말과 어긋난다 (GDD §5).
   */
  private openRelicScreen(): void {
    this.leaving = true;
    this.scene.start('relic', {
      returnTo: {
        mapId: this.mapId,
        arrival: { position: this.walker.position, facing: this.walker.facing },
      },
    } satisfies RelicEntry);
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

  /** 계단 타일이 아직 없어 표식으로 대신한다 (ADR-006). 백로그에 "에셋 필요: 계단 타일". */
  private createPortalView(portal: Portal): Phaser.GameObjects.Rectangle {
    const size = this.map.tileWidth;
    const marker = this.add.rectangle(
      portal.position.x * size + size / 2,
      portal.position.y * size + size / 2,
      size - 2,
      size - 2,
      0x1b2a3a,
    );
    marker.setStrokeStyle(1, 0x7fa6c9);
    return marker;
  }

  /** 시설 표식과 이름표. 이름이 없으면 무엇을 하는 자리인지 다가서기 전엔 알 수 없다. */
  private createFacilityView(facility: Facility): Phaser.GameObjects.Container {
    const size = this.map.tileWidth;
    const x = facility.position.x * size + size / 2;
    const y = facility.position.y * size + size / 2;

    const marker = this.add.image(0, 0, 'tiles-dungeon', facility.tile);
    const label = this.add
      .text(0, size / 2 + 1, facility.name, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#7fc98a',
      })
      .setOrigin(0.5, 0);

    return this.add.container(x, y, [marker, label]);
  }

  private createNpcView(npc: Npc): Phaser.GameObjects.Image {
    return this.add.image(
      npc.position.x * this.map.tileWidth + this.map.tileWidth / 2,
      npc.position.y * this.map.tileHeight + this.map.tileHeight / 2,
      CHARACTER_SHEET.key,
      npc.tile,
    );
  }

  /**
   * 주인공.
   *
   * 사람은 전부 `chars-roguelike` 에서 나온다 (`data/characters.ts`). **정면 한 방향뿐**이라
   * 어디를 보고 있는지는 여전히 표식이 말해준다 — 4방향 걷기 프레임은 백로그의 사람 몫이다.
   */
  private createPlayerView(): Phaser.GameObjects.Container {
    const body = this.add.image(0, 0, CHARACTER_SHEET.key, PLAYER_PORTRAIT);
    this.facingPip = this.add.rectangle(0, 0, 4, 4, 0xf2e6c9);
    this.facingPip.setStrokeStyle(1, 0x2a1e14);

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
