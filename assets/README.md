# assets/

**여기에 등재되지 않은 에셋은 존재하지 않는 것으로 취급한다** (ADR-006).

## 왜

자율 루프는 그림을 그릴 수 없다. 인터넷에서 임의로 내려받게 두면 라이선스가 오염되고,
존재하지 않는 경로를 참조하는 코드가 조용히 늘어난다.
그래서 규칙을 하나로 줄였다 — 색인에 있는 것만 쓴다.

## 에셋을 추가하는 법

1. 파일을 `assets/` 아래 적당한 디렉터리에 넣는다 (`assets/tiles/`, `assets/sprites/`, `assets/audio/` ...)
2. `assets/index.json` 의 `entries` 에 항목을 추가한다:

```json
{
  "key": "tiles-ruin",
  "path": "assets/tiles/ruin.png",
  "kind": "tileset",
  "usage": "유적 던전 타일맵",
  "frame": { "width": 16, "height": 16 },
  "source": {
    "name": "Kenney Tiny Dungeon",
    "url": "https://kenney.nl/assets/tiny-dungeon",
    "license": "CC0-1.0"
  }
}
```

3. `assets/CREDITS.md` 표에 출처를 추가한다.
4. `npm run test` — 색인·파일·CREDITS 정합성을 검사한다.

`kind` 가 `tileset` / `spritesheet` 면 `frame` 이 필수다.
허용 라이선스는 `src/core/assets/index.ts` 의 `ALLOWED_LICENSES` 참조.

## 에셋이 없을 때 (지금 상태)

**진행을 멈추지 않는다.** 단색 도형 플레이스홀더로 만들고,
`docs/BACKLOG.md` 에 `에셋 필요: <용도>` 항목을 추가한 뒤 다음으로 넘어간다.

화면 완성도는 사람이 에셋을 보충해줄 때까지 올라가지 않는다 — 의도된 트레이드오프다.
