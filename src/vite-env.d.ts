/// <reference types="vite/client" />

// Tiled 맵은 `?raw` 로 문자열로 불러와 core 의 파서에 넘긴다.
// 확장자가 .json 이 아니라 Vite 가 자동 파싱하지 않고, 자동 파싱되면 검증을 건너뛰게 되므로
// 오히려 이쪽이 낫다 — 파싱은 반드시 parseTiledMap 을 통과해야 한다.
