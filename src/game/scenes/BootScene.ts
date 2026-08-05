import Phaser from 'phaser';
import { assetCatalog } from '../assets/catalog.js';
import { queueAssets } from '../assets/queueAssets.js';
import { markScene } from '../domState.js';

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

    // `?scene=battle` 로 바로 전투를 띄운다. 개발·테스트용 진입점이며,
    // 탐색에서 전투로 넘어가는 실제 경로는 T-021(인카운터)이 만든다.
    const requested = new URLSearchParams(window.location.search).get('scene');
    this.scene.start(requested === 'battle' ? 'battle' : 'title');
  }
}
