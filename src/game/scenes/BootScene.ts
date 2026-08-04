import Phaser from 'phaser';
import { assetCatalog } from '../assets/catalog.js';
import { queueAssets } from '../assets/queueAssets.js';
import { markScene } from '../sceneMarker.js';

/**
 * 에셋 로딩과 초기 설정 담당.
 *
 * 색인이 깨져 있으면 여기서 즉시 터진다 (ADR-006). 의도된 동작이다 —
 * 잘못된 색인으로 조용히 부팅해서 나중에 빈 화면을 디버깅하는 것보다,
 * 스모크 테스트가 첫 화면에서 잡아주는 편이 훨씬 싸다.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    queueAssets(this.load, assetCatalog());
  }

  create(): void {
    markScene('boot');
    this.scene.start('title');
  }
}
