import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = 'docs/screenshots';

/**
 * 한 칸 이동을 유발한다.
 *
 * 게임은 매 프레임 키의 눌림 상태를 확인한다(눌러서 계속 걷는 조작을 위해).
 * `press()` 의 기본 동작은 눌렀다 즉시 떼는 것이라 프레임 사이에 끼어 무시될 수 있다.
 * 몇 프레임 동안 눌러둔 뒤, 이동 트윈이 끝나기를 기다린다.
 */
async function stepKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key, { delay: 60 });
  await page.waitForTimeout(160);
}

/**
 * 자율 루프의 "눈" 역할을 하는 테스트.
 *
 * 게임이 실제로 뜨는지는 유닛 테스트로 알 수 없다. 번들이 깨지거나 에셋이 404거나
 * 씬 전환에서 터지는 일은 브라우저에서만 드러난다. 루프는 매 이터레이션마다
 * 이 테스트로 "적어도 게임이 켜지긴 한다"를 확인한 뒤 커밋한다.
 */
test('부팅 → 타이틀 → 오버월드 전환이 콘솔 에러 없이 완결된다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await page.goto('/');

  // 캔버스가 실제로 만들어졌는가 (Phaser 초기화 성공)
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });

  // Boot는 즉시 통과하므로 title이 관측 지점이다.
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });

  // 파일명에 태스크 ID를 넣지 않는다. 이터레이션마다 새 파일이 쌓이면 저장소가 부풀고,
  // "지금 화면"이 어느 것인지 알 수 없게 된다. 고정 이름으로 덮어쓰면 git diff 가 변화를 보여준다.
  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/title.png` });

  // 키 입력이 게임에 전달되는지까지 확인한다.
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');

  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', {
    timeout: 10_000,
  });

  // ── 이동·충돌·카메라 (T-008, T-009) ──────────────────────────────────────
  // 맵은 60x40 타일(960x640px)이고 화면은 480x270px 이다.
  // 스폰 (8,6) 은 맵 좌상단에 가까워 카메라가 경계에 붙어 있어야 한다.
  await expect(page.locator('body')).toHaveAttribute('data-player', '8,6');
  await expect(page.locator('body')).toHaveAttribute('data-camera', '0,0');

  // ── NPC 충돌과 대화 (T-010) ──────────────────────────────────────────────
  // 조사원 NPC 가 (8,4) 에 서 있다. 한 칸 올라가면 바로 앞이다.
  await expect(page.locator('body')).toHaveAttribute('data-dialogue', 'closed');
  await stepKey(page, 'ArrowUp');
  await expect(page.locator('body')).toHaveAttribute('data-player', '8,5');

  // NPC 는 지형처럼 막는다. 제자리에 남되 방향은 위를 향한다.
  await stepKey(page, 'ArrowUp');
  await expect(page.locator('body')).toHaveAttribute('data-player', '8,5');
  await expect(page.locator('body')).toHaveAttribute('data-facing', 'up');

  // 마주 본 상태에서 상호작용하면 대화가 열린다.
  await stepKey(page, 'Space');
  await expect(page.locator('body')).toHaveAttribute('data-dialogue', /^1\/[1-9]/);
  await page.screenshot({ path: `${SHOT_DIR}/dialogue.png` });

  // 대화 중에는 걷지 않는다.
  await stepKey(page, 'ArrowUp');
  await expect(page.locator('body')).toHaveAttribute('data-player', '8,5');

  // 끝까지 넘기면 닫힌다. 쪽 수가 늘어도 깨지지 않도록 넉넉히 누른다.
  for (let i = 0; i < 12; i += 1) {
    const state = await page.locator('body').getAttribute('data-dialogue');
    if (state === 'closed') break;
    await stepKey(page, 'Space');
  }
  await expect(page.locator('body')).toHaveAttribute('data-dialogue', 'closed');

  // ── 카메라 (T-009) ───────────────────────────────────────────────────────
  // 입구 홀은 x=16 까지다. 8번 오른쪽으로 가면 벽에 닿는다.
  for (let i = 0; i < 8; i += 1) {
    await stepKey(page, 'ArrowRight');
  }

  await expect(page.locator('body')).toHaveAttribute('data-player', '16,5');
  await expect(page.locator('body')).toHaveAttribute('data-facing', 'right');

  // 플레이어가 화면 중앙(240px)을 넘어섰으므로 카메라가 따라 움직인다.
  // 세로는 여전히 위쪽 경계에 걸려 0 이다 — 축마다 독립적으로 판단한다.
  await expect(page.locator('body')).toHaveAttribute('data-camera', '24,0');

  // 막힌 방향으로 더 눌러도 제자리다.
  await stepKey(page, 'ArrowRight');
  await expect(page.locator('body')).toHaveAttribute('data-player', '16,5');

  // ── 층 이동 (T-011) ──────────────────────────────────────────────────────
  // 입구 홀의 계단은 (11,3). 밟으면 지하 1층 (5,6) 으로 내려간다.
  await expect(page.locator('body')).toHaveAttribute('data-map', 'ruin-entrance');

  for (let i = 0; i < 5; i += 1) await stepKey(page, 'ArrowLeft');
  await expect(page.locator('body')).toHaveAttribute('data-player', '11,5');

  await stepKey(page, 'ArrowUp');
  await stepKey(page, 'ArrowUp');

  await expect(page.locator('body')).toHaveAttribute('data-map', 'ruin-depths', {
    timeout: 10_000,
  });
  await expect(page.locator('body')).toHaveAttribute('data-player', '5,6');
  await page.screenshot({ path: `${SHOT_DIR}/depths.png` });

  // 도착 지점은 계단 옆이다. 계단 위였다면 여기서 무한히 오갔을 것이다.
  await expect(page.locator('body')).toHaveAttribute('data-map', 'ruin-depths');

  // 올라가는 계단을 밟으면 입구 홀의 계단 옆으로 돌아온다.
  await stepKey(page, 'ArrowUp');
  await expect(page.locator('body')).toHaveAttribute('data-map', 'ruin-entrance', {
    timeout: 10_000,
  });
  await expect(page.locator('body')).toHaveAttribute('data-player', '11,4');

  await page.screenshot({ path: `${SHOT_DIR}/overworld.png` });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 전투 한 판을 끝까지 진행한다 (T-020).
 *
 * 승패는 시드에 달려 있으므로 결과를 못 박지 않는다. **끝까지 도달하는가**만 본다 —
 * 전투가 도중에 멈추거나 예외로 죽으면 여기서 드러난다.
 */
test('전투를 시작해 끝까지 진행한다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  // 탐색 → 전투 경로는 T-021 이 만든다. 그전까지는 개발용 진입점을 쓴다.
  await page.goto('/?scene=battle');

  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battle', { timeout: 20_000 });
  await expect(page.locator('body')).toHaveAttribute('data-battle-phase', 'command', {
    timeout: 20_000,
  });

  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/battle.png` });
  await page.locator('#game canvas').click();

  // 커맨드 첫 항목은 공격. 대상 선택까지 확인 후 반복해서 끝을 낸다.
  await stepKey(page, 'Enter');
  await expect(page.locator('body')).toHaveAttribute('data-battle-phase', 'target');
  await page.screenshot({ path: `${SHOT_DIR}/battle-target.png` });

  for (let i = 0; i < 120; i += 1) {
    const phase = await page.locator('body').getAttribute('data-battle-phase');
    if (phase === 'over') break;
    if (phase === 'command' || phase === 'target') {
      await stepKey(page, 'Enter');
    } else {
      await page.waitForTimeout(140);
    }
  }

  await expect(page.locator('body')).toHaveAttribute('data-battle-phase', 'over', {
    timeout: 30_000,
  });
  await expect(page.locator('body')).toHaveAttribute('data-battle-outcome', /victory|defeat|fled/);
  await page.screenshot({ path: `${SHOT_DIR}/battle-end.png` });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});
