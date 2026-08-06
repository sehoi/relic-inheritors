import Phaser from 'phaser';
import { assetCatalog } from '../assets/catalog.js';
import { queueAssets } from '../assets/queueAssets.js';
import { markScene } from '../domState.js';
import { joinFullPartyIfRequested, startingScene } from '../devFlags.js';
import { joinMember } from '../partyStore.js';

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

    // 인원에 따라 깨지는 화면을 인원 없이 확인할 수 없다 (`devFlags`).
    // 타이틀을 건너뛰는 `?scene=battle` 경로를 위한 것이고, 타이틀을 거치는 쪽은
    // "새로 시작" 이 파티를 비우므로 `TitleScene` 이 다시 부른다.
    joinFullPartyIfRequested(joinMember);

    this.scene.start(startingScene());
  }
}
