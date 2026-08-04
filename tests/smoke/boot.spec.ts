import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const SHOT_DIR = 'docs/screenshots';

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

  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/M0-title.png` });

  // 키 입력이 게임에 전달되는지까지 확인한다.
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');

  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', {
    timeout: 10_000,
  });

  await page.screenshot({ path: `${SHOT_DIR}/M0-overworld.png` });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});
