import Phaser from 'phaser';

/**
 * 현재 위치 표시.
 *
 * 두 가지를 답한다 — **여기가 어디인가**, 그리고 **여기서 전투가 벌어지는가**.
 * 뒤쪽이 이 UI 의 존재 이유다. 안전지대는 "아무 일도 일어나지 않음" 으로만 드러나서,
 * 표시가 없으면 플레이어는 운이 좋았던 것인지 안전한 것인지 끝내 알 수 없다.
 *
 * 화면 좌상단에 붙박아 둔다. 탐색 중 항상 보여야 하는 정보라 열고 닫지 않는다.
 */
const MARGIN = 6;
const PADDING = 5;
const HEIGHT = 20;

const SAFE_COLOR = '#7fc98a';
const WILD_COLOR = '#d08a6a';

export class LocationBanner {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly placeText: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly stateText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.background = scene.add
      .rectangle(0, 0, 10, HEIGHT, 0x0b0c10, 0.82)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x6f7b8a);

    this.placeText = scene.add.text(PADDING, PADDING, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#e8e3d3',
    });

    this.levelText = scene.add.text(0, PADDING, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#c8a15a',
    });

    this.stateText = scene.add.text(0, PADDING, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: SAFE_COLOR,
    });

    scene.add
      .container(MARGIN, MARGIN, [this.background, this.placeText, this.stateText])
      .setScrollFactor(0)
      .setDepth(900);
  }

  /** 구역 이름이 없을 수 있다 (구역을 빠뜨린 칸). 그때는 맵 이름만 띄운다. */
  show(
    mapName: string,
    zoneName: string | undefined,
    encounters: boolean,
    level: number,
  ): void {
    const place = zoneName === undefined ? mapName : `${mapName} · ${zoneName}`;
    this.placeText.setText(place);

    // 레벨은 탐색 중 늘 보여야 한다 — "지금 내려가도 되나" 를 판단하는 유일한 근거다.
    this.levelText.setText(`Lv${level}`);
    this.levelText.setX(PADDING + this.placeText.width + 8);

    this.stateText.setText(encounters ? '조우' : '안전');
    this.stateText.setColor(encounters ? WILD_COLOR : SAFE_COLOR);
    this.stateText.setX(this.levelText.x + this.levelText.width + 8);

    this.background.setSize(this.stateText.x + this.stateText.width + PADDING, HEIGHT);
  }
}
