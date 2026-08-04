import type Phaser from 'phaser';
import type { AssetCatalog } from '../../core/assets/index.js';

/**
 * 색인에 등재된 에셋을 Phaser 로더에 등록한다 (ADR-006).
 *
 * 씬은 이 함수를 통하지 않고 `this.load.image('아무거나', '경로')` 를 직접 부르면 안 된다.
 * 그렇게 하면 색인을 우회하게 되고, `tests/unit/assetIndex.test.ts` 가 그 경로 문자열을 잡아낸다.
 */
export function queueAssets(loader: Phaser.Loader.LoaderPlugin, catalog: AssetCatalog): void {
  for (const entry of catalog.entries()) {
    switch (entry.kind) {
      case 'image':
        loader.image(entry.key, entry.path);
        break;

      // 타일셋도 Phaser 입장에서는 이미지다. frame 은 타일맵 생성 시점에 쓰인다.
      case 'tileset':
        loader.image(entry.key, entry.path);
        break;

      case 'spritesheet':
        loader.spritesheet(entry.key, entry.path, {
          frameWidth: entry.frame.width,
          frameHeight: entry.frame.height,
        });
        break;

      case 'audio':
        loader.audio(entry.key, entry.path);
        break;
    }
  }
}
