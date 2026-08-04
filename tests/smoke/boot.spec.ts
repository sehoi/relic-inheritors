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

  // ── 이동과 충돌 (T-008) ──────────────────────────────────────────────────
  // 스폰은 (6,8). 위쪽 열은 y=1 까지 비어 있고 y=0 은 외곽 벽이다.
  // 8번 누르면 7칸 올라가고 마지막 한 번은 벽에 막혀야 한다.
  await expect(page.locator('body')).toHaveAttribute('data-player', '6,8');

  for (let i = 0; i < 8; i += 1) {
    await stepKey(page, 'ArrowUp');
  }

  await expect(page.locator('body')).toHaveAttribute('data-player', '6,1');
  await expect(page.locator('body')).toHaveAttribute('data-facing', 'up');

  // 막힌 방향으로 더 눌러도 제자리이되, 방향은 바뀐다.
  await stepKey(page, 'ArrowUp');
  await expect(page.locator('body')).toHaveAttribute('data-player', '6,1');

  await stepKey(page, 'ArrowRight');
  await expect(page.locator('body')).toHaveAttribute('data-player', '7,1');
  await expect(page.locator('body')).toHaveAttribute('data-facing', 'right');

  await page.screenshot({ path: `${SHOT_DIR}/overworld.png` });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});
