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

      // 타일셋은 낱장 타일을 프레임으로 꺼내 써야 하므로 스프라이트시트로 싣는다.
      // 통짜 이미지로 실으면 gid → 타일 좌표 매핑을 할 수 없다.
      case 'tileset':
      case 'spritesheet':
        loader.spritesheet(entry.key, entry.path, {
          frameWidth: entry.frame.width,
          frameHeight: entry.frame.height,
          spacing: entry.frame.spacing ?? 0,
        });
        break;

      case 'audio':
        loader.audio(entry.key, entry.path);
        break;
    }
  }
}
