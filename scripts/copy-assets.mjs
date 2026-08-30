// `vite build`는 `public/`가 아닌 `assets/`를 dist에 복사하지 않는다.
// GitHub Pages 같은 정적 호스팅에서는 dev 서버(파일시스템 전체 서빙)와 달리
// dist에 없는 파일은 그대로 404가 된다 — 배포 직전에야 드러나는 종류라 빌드 스크립트에 못박는다.
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'assets');
const dest = join(root, 'dist', 'assets');

if (!existsSync(src)) {
  throw new Error(`assets 디렉터리가 없습니다: ${src}`);
}

cpSync(src, dest, { recursive: true });
console.log(`assets/ → dist/assets/ 복사 완료`);
