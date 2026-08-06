import Phaser from 'phaser';
import { CARRY_LIMIT, type StockEntry } from '../../core/world/shop.js';
import { item as itemById } from '../../data/items.js';
import { HAVEN_STOCK } from '../../data/shop.js';
import { buyItem, coinCount, getInventory } from '../partyStore.js';
import { markScene, markShop } from '../domState.js';
import { SHOP_KEYS, hintLine } from '../../data/keys.js';
import { bindSceneKeys, type BoundKeys } from '../keys.js';
import type { OverworldEntry } from './OverworldScene.js';

/**
 * 상점 (GDD §6.4, T-041b).
 *
 * 유물 장착·세이브 화면과 같은 꼴이다 — 목록, 커서, Enter, Esc. 화면마다 조작이 다르면
 * 플레이어가 매번 다시 배워야 한다.
 *
 * **살 수 없는 이유를 그대로 띄운다.** 판정은 `core/world/shop` 이 문자열로 돌려주므로
 * 여기서 다시 판단하지 않는다 — 판정이 두 곳에 있으면 반드시 어긋난다.
 */

const LINE = 16;

export interface ShopEntry {
  readonly returnTo?: OverworldEntry;
}

export class ShopScene extends Phaser.Scene {
  private returnTo: OverworldEntry | undefined;
  private index = 0;
  private readonly stock: readonly StockEntry[] = HAVEN_STOCK;

  private rows: Phaser.GameObjects.Text[] = [];
  private cursor!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;
  private keys: BoundKeys = {};

  constructor() {
    super('shop');
  }

  init(entry?: ShopEntry): void {
    this.returnTo = entry?.returnTo;
  }

  create(): void {
    markScene('shop');
    this.index = 0;

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x10131b).setOrigin(0, 0);
    this.add.text(8, 6, '상점', { fontFamily: 'monospace', fontSize: '13px', color: '#c8a15a' });
    this.add
      .text(472, 8, hintLine(SHOP_KEYS), {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#6f7b8a',
      })
      .setOrigin(1, 0);

    this.coinText = this.add
      .text(472, 24, '', { fontFamily: 'monospace', fontSize: '11px', color: '#d8b46a' })
      .setOrigin(1, 0);

    this.add
      .rectangle(8, 42, 464, LINE * this.stock.length + 12, 0x0b0c10)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x6f7b8a);

    // 항목마다 별도 Text 를 정해진 y 에 둔다 — 한 덩어리로 그리면 커서 위치를 계산해야 하고,
    // 계산은 줄 수가 달라지는 순간 틀린다 (세이브 화면에서 실제로 그랬다).
    this.rows = this.stock.map((_, i) =>
      this.add.text(28, 50 + i * LINE, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#e8e3d3',
      }),
    );
    this.cursor = this.add.text(16, 50, '>', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#c8a15a',
    });

    this.detailText = this.add.text(8, 56 + LINE * this.stock.length + 12, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#9aa7b8',
      wordWrap: { width: 464 },
    });
    this.noticeText = this.add.text(8, this.scale.height - 22, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#d08a6a',
    });

    this.bindKeys();
    this.render();
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) return;
    this.keys = bindSceneKeys(keyboard, SHOP_KEYS);
  }

  private pressed(...names: readonly string[]): boolean {
    return names.some((name) =>
      (this.keys[name] ?? []).some((key) => Phaser.Input.Keyboard.JustDown(key)),
    );
  }

  override update(): void {
    if (this.pressed('cancel')) {
      this.scene.start('overworld', this.returnTo ?? {});
      return;
    }
    if (this.pressed('down')) {
      this.index = (this.index + 1) % this.stock.length;
      this.render();
      return;
    }
    if (this.pressed('up')) {
      this.index = (this.index - 1 + this.stock.length) % this.stock.length;
      this.render();
      return;
    }
    if (this.pressed('confirm')) this.purchase();
  }

  private purchase(): void {
    const entry = this.stock[this.index];
    if (entry === undefined) return;

    const result = buyItem(this.stock, entry.itemId);
    if ('blocked' in result) {
      this.noticeText.setText(result.blocked);
      return;
    }

    this.noticeText.setText(`${itemById(entry.itemId).name} 을(를) 샀다 (은편 -${result.spent})`);
    this.render();
  }

  private render(): void {
    const inventory = getInventory();

    this.coinText.setText(`은편 ${coinCount()}`);
    this.stock.forEach((entry, i) => {
      const owned = inventory[entry.itemId] ?? 0;
      const name = itemById(entry.itemId).name;
      const full = owned >= CARRY_LIMIT ? ' (가득)' : '';
      this.rows[i]?.setText(`${name.padEnd(6)}  은편 ${String(entry.price).padStart(3)}   지님 ${owned}${full}`);
      this.rows[i]?.setColor(entry.price > coinCount() || owned >= CARRY_LIMIT ? '#6f7b8a' : '#e8e3d3');
    });
    this.cursor.setY(50 + this.index * LINE);

    const chosen = this.stock[this.index];
    this.detailText.setText(chosen === undefined ? '' : describeItem(chosen.itemId));

    markShop({
      item: chosen?.itemId ?? 'none',
      coins: coinCount(),
      owned: chosen === undefined ? 0 : (inventory[chosen.itemId] ?? 0),
    });
  }
}

/** 무엇을 하는 물건인지. 이름만으로는 정화석과 맑은 종이 구분되지 않는다. */
function describeItem(itemId: string): string {
  const effect = itemById(itemId).effect;
  switch (effect.kind) {
    case 'heal':
      return `한 명의 HP 를 ${effect.amount} 회복한다.`;
    case 'cure':
      return `상태이상을 푼다: ${effect.ailments.join(', ')}`;
    case 'cleanse':
      return `침식을 ${effect.erosion} 씻어낸다. 거점 정화소보다 적지만 전투 중에 쓸 수 있다.`;
    case 'revive':
      return `쓰러진 이를 최대 HP 의 ${Math.round(effect.hpRatio * 100)}% 로 일으킨다.`;
  }
}
