import Phaser from 'phaser';
import { markScene } from '../sceneMarker.js';

/**
 * 에셋 로딩과 초기 설정 담당. M0 시점에는 로드할 에셋이 없어 즉시 타이틀로 넘어간다.
 * 에셋이 생기면(ADR-006, assets/index.json) 여기서 preload 한다.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    markScene('boot');
    this.scene.start('title');
  }
}
