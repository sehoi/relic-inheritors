import assetIndexJson from '../../../assets/index.json';
import { createAssetCatalog, parseAssetIndex, type AssetCatalog } from '../../core/assets/index.js';

let cached: AssetCatalog | undefined;

/**
 * 에셋 색인은 앱 전체에서 하나다.
 *
 * 색인이 깨져 있으면 첫 호출에서 즉시 터진다 — 의도된 동작이다 (ADR-006).
 * 잘못된 색인으로 조용히 부팅해서 나중에 빈 화면을 디버깅하는 것보다,
 * 스모크 테스트가 부팅 지점에서 잡아주는 편이 훨씬 싸다.
 */
export function assetCatalog(): AssetCatalog {
  cached ??= createAssetCatalog(parseAssetIndex(assetIndexJson));
  return cached;
}
