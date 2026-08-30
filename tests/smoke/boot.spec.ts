import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { RELICS, STARTING_RELICS } from '../../src/data/relics.js';

const TOTAL_RELICS = Object.keys(RELICS).length;

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

  // 이 테스트는 탐색 기능만 본다. 인카운터를 끄지 않으면 16걸음을 걷는 동안
  // 전투가 끼어들어(임계 8~20걸음) 무엇을 검사하는 테스트인지 흐려진다.
  await page.goto('/?encounters=off');

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

  // ── 구역 표시 (T-030) ────────────────────────────────────────────────────
  // 시작 지점은 야영지 안이고, 야영지는 안전지대다.
  await expect(page.locator('body')).toHaveAttribute('data-zone', 'entrance-camp');
  await expect(page.locator('body')).toHaveAttribute('data-encounter-zone', 'safe');

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

  // 지하에는 안전지대가 없다. 층이 바뀌면 표시도 따라 바뀐다.
  await expect(page.locator('body')).toHaveAttribute('data-zone', 'depths-landing');
  await expect(page.locator('body')).toHaveAttribute('data-encounter-zone', 'wild');
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

/** 타이틀을 넘겨 탐색 씬까지 들어간다. 인카운터는 켜진 상태다. */
async function enterOverworld(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', {
    timeout: 10_000,
  });
}

/**
 * 야영지(8,6) 에서 기둥 홀(17,7) 로 걸어 나간다.
 *
 * y=7 은 야영지와 기둥 홀을 잇는 복도라 NPC 도 계단도 없다 — 도중에 다른 일이 끼어들지 않는다.
 */
async function walkOutOfCamp(page: Page): Promise<void> {
  await stepKey(page, 'ArrowDown');
  await expect(page.locator('body')).toHaveAttribute('data-player', '8,7');

  for (let i = 0; i < 9; i += 1) await stepKey(page, 'ArrowRight');
  await expect(page.locator('body')).toHaveAttribute('data-player', '17,7');
}

/**
 * 안전지대에서는 전투가 벌어지지 않는다 (T-030).
 *
 * 이 테스트가 없으면 회귀를 알아챌 수 없다. 안전지대는 **아무 일도 일어나지 않음**으로만
 * 드러나므로, 임계(8~20걸음)를 훌쩍 넘게 걸어보는 것 말고는 확인할 방법이 없다.
 * 마지막에 실제로 전투가 벌어지는 것까지 봐야 "인카운터 자체가 꺼져 있었을 뿐" 이 아님이 증명된다.
 */
test('야영지에서는 아무리 걸어도 전투가 벌어지지 않는다', async ({ page }) => {
  await enterOverworld(page);

  await expect(page.locator('body')).toHaveAttribute('data-zone', 'entrance-camp');
  await expect(page.locator('body')).toHaveAttribute('data-encounter-zone', 'safe');

  // 임계 최대치(20걸음)의 두 배를 걷는다.
  for (let i = 0; i < 40; i += 1) {
    await stepKey(page, i % 2 === 0 ? 'ArrowLeft' : 'ArrowRight');
    expect(
      await page.locator('body').getAttribute('data-scene'),
      `야영지 ${i + 1}걸음째에 전투가 벌어졌습니다`,
    ).toBe('overworld');
  }

  await page.screenshot({ path: `${SHOT_DIR}/camp.png` });

  // 한 발짝 나가면 위험 구역이다 — 인카운터가 꺼져 있던 것이 아니다.
  await walkOutOfCamp(page);
  await expect(page.locator('body')).toHaveAttribute('data-zone', 'pillar-hall');
  await expect(page.locator('body')).toHaveAttribute('data-encounter-zone', 'wild');
});

/**
 * 탐색 → 전투 → 복귀가 하나의 흐름으로 이어진다 (T-021).
 *
 * M2 의 마지막 조각이다. 걸어다니다 전투가 벌어지고, 끝나면 **걷던 자리로 돌아온다.**
 */
test('탐색 중 인카운터가 발생하고 전투 후 제자리로 돌아온다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await enterOverworld(page);

  // 야영지는 안전지대라 전투가 벌어지지 않는다 (T-030). 기둥 홀까지 나가야 한다.
  await walkOutOfCamp(page);

  // 기둥 홀 안에서 좌우로 오간다. 임계는 8~20걸음이므로 넉넉히 걷는다.
  for (let i = 0; i < 40; i += 1) {
    if ((await page.locator('body').getAttribute('data-scene')) === 'battle') break;
    await stepKey(page, i % 2 === 0 ? 'ArrowRight' : 'ArrowLeft');
  }

  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battle', { timeout: 10_000 });

  // 전투는 **이동을 마친 뒤** 벌어지므로, 복귀 지점은 마지막으로 밟은 칸이다.
  // 전투 씬은 data-player 를 건드리지 않아 그 값이 그대로 남아 있다.
  const encounterTile = (await page.locator('body').getAttribute('data-player')) ?? '';
  await page.screenshot({ path: `${SHOT_DIR}/encounter.png` });

  // 전투를 끝낸다.
  for (let i = 0; i < 160; i += 1) {
    const phase = await page.locator('body').getAttribute('data-battle-phase');
    if (phase === 'over') break;
    if (phase === 'command' || phase === 'target') await stepKey(page, 'Enter');
    else await page.waitForTimeout(140);
  }
  await expect(page.locator('body')).toHaveAttribute('data-battle-phase', 'over', {
    timeout: 30_000,
  });

  const outcome = await page.locator('body').getAttribute('data-battle-outcome');
  await stepKey(page, 'Enter');

  if (outcome === 'defeat') {
    // 전멸하면 타이틀로 돌아간다. 세이브(M4)가 생기면 마지막 저장 지점 복원으로 바뀐다.
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 10_000 });
  } else {
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', {
      timeout: 10_000,
    });
    await expect(page.locator('body')).toHaveAttribute('data-map', 'ruin-entrance');
    // 전투가 벌어진 자리에서 이어간다.
    await expect(page.locator('body')).toHaveAttribute('data-player', encounterTile);

    // 이겼으면 레벨이 올라 있어야 한다 (T-044). 첫 레벨업은 첫 전투에서 온다 —
    // 안 오르면 플레이어는 자기가 나아지는지 알 수 없다.
    if (outcome === 'victory') {
      const level = Number(await page.locator('body').getAttribute('data-level'));
      expect(level, '이겼는데 레벨이 오르지 않았다').toBeGreaterThan(1);
    }
  }

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 유물 장착 화면 (T-029).
 *
 * **조합 설계가 이 게임의 중심이므로, 조합을 바꾸면 공명이 실제로 붙고 떨어져야 한다** (GDD §6.4).
 * 화면만 봐서는 "글자가 바뀌었다" 까지만 알 수 있어서, 판정 결과를 DOM 으로 질의한다.
 */
test('유물을 갈아끼우면 공명이 실제로 바뀐다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await page.goto('/?scene=relic');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'relic', { timeout: 20_000 });
  await page.locator('#game canvas').click();

  // 기본 장착은 지닌 유물을 한 명씩 돌아가며 나눠 준 상태다.
  const before = (await page.locator('body').getAttribute('data-resonances')) ?? '';
  expect(before, '시작부터 공명이 하나는 발동해 있어야 조합이라는 개념을 만난다').not.toBe('none');

  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/relic.png` });

  // 슬롯 칸에서 시작한다. 첫 슬롯을 비우면 공명 구성이 달라져야 한다.
  await expect(page.locator('body')).toHaveAttribute('data-relic-focus', 'slots');
  await stepKey(page, 'Enter');

  const emptied = (await page.locator('body').getAttribute('data-resonances')) ?? '';
  expect(emptied, `유물을 뺐는데 공명이 그대로다 (${before})`).not.toBe(before);

  // 오른쪽 칸으로 옮긴다. 커서는 방금 뺀 유물(목록 첫 줄)에 있다.
  await stepKey(page, 'ArrowRight');
  await expect(page.locator('body')).toHaveAttribute('data-relic-focus', 'relics');

  const first = await page.locator('body').getAttribute('data-relic-cursor');
  await stepKey(page, 'ArrowDown');
  expect(
    await page.locator('body').getAttribute('data-relic-cursor'),
    '유물 목록에서 커서가 움직이지 않는다',
  ).not.toBe(first);
  await stepKey(page, 'ArrowUp');
  await expect(page.locator('body')).toHaveAttribute('data-relic-cursor', first ?? '');

  // 뺐던 유물을 도로 끼우면 공명도 원래대로 돌아온다 — 판정이 한쪽으로만 맞으면 안 된다.
  await stepKey(page, 'Enter');
  const refilled = (await page.locator('body').getAttribute('data-resonances')) ?? '';
  expect(refilled, `되돌렸는데 공명이 원래대로 오지 않는다 (${emptied} → ${refilled})`).toBe(before);

  await page.screenshot({ path: `${SHOT_DIR}/relic-swapped.png` });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 탐색 중 아무 때나 장착 화면을 열고 제자리로 돌아온다 (T-029).
 *
 * 거점에서만 바꾸게 하면 유적 안에서 조합을 바꿀 수 없는데, 그건 조합이 게임의 중심이라는
 * 말과 어긋난다 (GDD §5).
 */
test('탐색 중 R 로 장착 화면을 열고 제자리로 돌아온다', async ({ page }) => {
  await enterOverworld(page);

  const where = await page.locator('body').getAttribute('data-player');
  await stepKey(page, 'r');

  await expect(page.locator('body')).toHaveAttribute('data-scene', 'relic', { timeout: 10_000 });

  await stepKey(page, 'Escape');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', {
    timeout: 10_000,
  });
  await expect(page.locator('body')).toHaveAttribute('data-player', where ?? '');
});

/**
 * 거점으로 나가 정화소를 쓴다 (T-040).
 *
 * **거점은 돌아올 곳이다.** 나가는 길이 실제로 이어져 있고, 거기서 무언가 할 수 있어야
 * 거점이 성립한다.
 */
test('거점으로 나가 정화소를 쓸 수 있다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await page.goto('/?encounters=off');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', {
    timeout: 10_000,
  });

  // 야영지 구석(2,2)이 거점으로 나가는 길이다. 스폰 (8,6) 에서 왼쪽 위로.
  for (let i = 0; i < 6; i += 1) await stepKey(page, 'ArrowLeft');
  await expect(page.locator('body')).toHaveAttribute('data-player', '2,6');

  for (let i = 0; i < 4; i += 1) await stepKey(page, 'ArrowUp');

  await expect(page.locator('body')).toHaveAttribute('data-map', 'haven', { timeout: 10_000 });
  // 거점은 통째로 안전지대다 — 돌아올 곳에서 전투가 벌어지면 목적이 성립하지 않는다.
  await expect(page.locator('body')).toHaveAttribute('data-encounter-zone', 'safe');
  await page.screenshot({ path: `${SHOT_DIR}/haven.png` });

  // 정화소(10,8) 로 간다. 도착 지점은 (35,12).
  await expect(page.locator('body')).toHaveAttribute('data-player', '35,12');
  for (let i = 0; i < 25; i += 1) await stepKey(page, 'ArrowLeft');
  await expect(page.locator('body')).toHaveAttribute('data-player', '10,12');

  for (let i = 0; i < 3; i += 1) await stepKey(page, 'ArrowUp');
  // 시설은 길을 막는다 — (10,9) 에서 멈춰 정화소를 마주 본다.
  await expect(page.locator('body')).toHaveAttribute('data-player', '10,9');
  await expect(page.locator('body')).toHaveAttribute('data-facing', 'up');

  await stepKey(page, 'Space');
  await expect(page.locator('body')).toHaveAttribute('data-dialogue', /^1\//);
  await page.screenshot({ path: `${SHOT_DIR}/cleansing.png` });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 거점에서 물건을 산다 (T-041b).
 *
 * **샀는지는 지님 개수와 은편으로만 확실히 알 수 있다** — "샀다" 알림은 실패해도 띄울 수 있다.
 */
test('거점 상점이 열리고 은편이 모자라면 거절한다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  // 새로 시작하면 은편이 0이다. **거절하는 쪽이 검증하기 쉽고 더 중요하다** —
  // 살 수 있을 때 사지는 것은 단위 테스트가 보고, 여기서는 화면·판정·소지품이
  // 실제로 이어져 있는지를 본다. 전투로 은편을 벌게 하면 승패에 매인 불안정한 테스트가 된다.
  await page.goto('/?encounters=off');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', {
    timeout: 10_000,
  });

  // 야영지 구석(2,2)이 거점으로 나가는 길이다. 스폰 (8,6) 에서.
  for (let i = 0; i < 6; i += 1) await stepKey(page, 'ArrowLeft');
  for (let i = 0; i < 4; i += 1) await stepKey(page, 'ArrowUp');
  await expect(page.locator('body')).toHaveAttribute('data-map', 'haven', { timeout: 10_000 });

  // 도착 (35,12) → 상점 (28,16) 앞. 시설은 길을 막으므로 (29,16) 에서 멈춘다.
  for (let i = 0; i < 6; i += 1) await stepKey(page, 'ArrowLeft');
  for (let i = 0; i < 4; i += 1) await stepKey(page, 'ArrowDown');
  await expect(page.locator('body')).toHaveAttribute('data-player', '29,16');

  await stepKey(page, 'ArrowLeft');
  await expect(page.locator('body')).toHaveAttribute('data-player', '29,16');
  await stepKey(page, 'Space');

  await expect(page.locator('body')).toHaveAttribute('data-scene', 'shop', { timeout: 10_000 });
  await expect(page.locator('body')).toHaveAttribute('data-shop-coins', '0');
  await page.screenshot({ path: `${SHOT_DIR}/shop.png` });

  // 은편 0으로 사려 하면 거절당하고 지님 개수가 그대로다.
  const owned = await page.locator('body').getAttribute('data-shop-owned');
  await stepKey(page, 'Enter');
  await expect(page.locator('body')).toHaveAttribute('data-shop-owned', owned ?? '0');
  await expect(page.locator('body')).toHaveAttribute('data-shop-coins', '0');

  // 커서가 움직이고 닫힌다.
  const first = await page.locator('body').getAttribute('data-shop-item');
  await stepKey(page, 'ArrowDown');
  expect(await page.locator('body').getAttribute('data-shop-item')).not.toBe(first);

  await stepKey(page, 'Escape');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', {
    timeout: 10_000,
  });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 회수 지점에서 유물을 줍고, 그 사실이 세이브를 건넌다 (T-039).
 *
 * **다시 주울 수 있으면 저장·로드 반복이 유물 무한 획득이 된다.** 주웠다는 사실이
 * 세이브에 남는지까지 봐야 이 기능이 완성된 것이다.
 */
test('회수 지점에서 유물을 줍고, 저장·로드 뒤에도 사라져 있다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  // 회수 지점까지 26걸음이라 인카운터를 끄지 않으면 도중에 전투가 끼어든다.
  await page.goto('/?encounters=off');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', {
    timeout: 10_000,
  });

  await expect(page.locator('body')).toHaveAttribute('data-sites', '2');

  // 기둥 홀 한가운데(32,8). y=7 복도를 따라가면 NPC 도 계단도 없다.
  await stepKey(page, 'ArrowDown');
  for (let i = 0; i < 24; i += 1) await stepKey(page, 'ArrowRight');
  await expect(page.locator('body')).toHaveAttribute('data-player', '32,7');

  await stepKey(page, 'ArrowDown');
  await expect(page.locator('body')).toHaveAttribute('data-player', '32,8');

  // 주우면 표식이 하나 줄고 대화가 열린다.
  await expect(page.locator('body')).toHaveAttribute('data-sites', '1');
  await expect(page.locator('body')).toHaveAttribute('data-dialogue', /^1\//);
  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/site.png` });

  for (let i = 0; i < 6; i += 1) {
    if ((await page.locator('body').getAttribute('data-dialogue')) === 'closed') break;
    await stepKey(page, 'Space');
  }

  // 저장하고 새로 열어 불러온다.
  await stepKey(page, 'f');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'save', { timeout: 10_000 });
  await stepKey(page, 'Enter');
  await expect(page.locator('body')).toHaveAttribute('data-save-slots', /^ok/);

  await page.goto('/?encounters=off');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await stepKey(page, 'c');
  await stepKey(page, 'Enter');

  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', {
    timeout: 10_000,
  });
  // 다시 놓여 있으면 저장·로드 반복으로 유물을 무한히 얻을 수 있다.
  await expect(page.locator('body')).toHaveAttribute('data-sites', '1');

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 저장하고, 페이지를 새로 열고, 이어한다 (T-038).
 *
 * **세이브는 새로고침을 건너야 의미가 있다.** 같은 세션 안에서만 되돌아오는 것은
 * 메모리 상태를 복사한 것일 뿐이라, localStorage 를 실제로 거쳤는지 알 수 없다.
 */
test('저장한 뒤 새로 열어 이어할 수 있다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await enterOverworld(page);

  // 시작 지점에서 몇 걸음 옮겨 둔다 — 스폰 지점 그대로면 복원됐는지 알 수 없다.
  await stepKey(page, 'ArrowDown');
  await stepKey(page, 'ArrowRight');
  const where = await page.locator('body').getAttribute('data-player');
  expect(where, '움직이지 않았다').not.toBe('8,6');

  await stepKey(page, 'f');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'save', { timeout: 10_000 });
  await expect(page.locator('body')).toHaveAttribute('data-save-mode', 'save');
  await expect(page.locator('body')).toHaveAttribute('data-save-slots', 'empty,empty,empty');

  await stepKey(page, 'Enter');
  // 슬롯 상태가 바뀌는 것이 저장됐다는 유일한 증거다 — "저장했다" 알림은 실패해도 뜬다.
  await expect(page.locator('body')).toHaveAttribute('data-save-slots', 'ok,empty,empty');

  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/save.png` });

  // 페이지를 통째로 새로 연다. 메모리 상태는 전부 사라진다.
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();

  await stepKey(page, 'c');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'save', { timeout: 10_000 });
  await expect(page.locator('body')).toHaveAttribute('data-save-mode', 'load');

  await stepKey(page, 'Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', {
    timeout: 10_000,
  });
  await expect(page.locator('body')).toHaveAttribute('data-player', where ?? '');

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 조작 안내를 열고 닫는다 (T-055).
 *
 * **`S` 가 아래로 걷기이면서 저장이던 버그가 이 태스크의 출발점이었다.** 배치가
 * `data/keys.ts` 로 옮겨가고 유닛 테스트가 겹침을 막지만, 그 데이터가 화면의 실제
 * 조작과 이어져 있다는 것은 여기서만 확인된다 — 데이터만 고치고 씬을 안 고쳐도
 * 유닛 테스트는 전부 초록이다.
 */
test('도움말을 열고 닫는다. 저장 키는 걷기와 겹치지 않는다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await page.goto('/?encounters=off');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });

  await expect(page.locator('body')).toHaveAttribute('data-help', 'closed');

  await stepKey(page, 'h');
  await expect(page.locator('body')).toHaveAttribute('data-help', 'open');
  await page.screenshot({ path: `${SHOT_DIR}/help.png` });

  await stepKey(page, 'h');
  await expect(page.locator('body')).toHaveAttribute('data-help', 'closed');

  // **아래로 걸어도 세이브 화면이 열리지 않는다.** 이게 원래 버그였다.
  const before = await page.locator('body').getAttribute('data-player');
  await stepKey(page, 's');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld');
  await expect(page.locator('body')).not.toHaveAttribute('data-player', before ?? '');

  // **메뉴에서도 WASD 로 고른다.** 탐색에서 WASD 로 걷던 손이 메뉴에서 바뀌지 않아야 한다.
  await stepKey(page, 'f');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'save', { timeout: 10_000 });
  await expect(page.locator('body')).toHaveAttribute('data-save-slot', '0');
  await stepKey(page, 's');
  await expect(page.locator('body')).toHaveAttribute('data-save-slot', '1');
  await stepKey(page, 'w');
  await expect(page.locator('body')).toHaveAttribute('data-save-slot', '0');

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 넷이 모인 뒤에도 화면이 안 깨진다 (T-057).
 *
 * **파티 패널이 한 사람당 42px 로 잡혀 있어 넷이 되면 셋째부터 화면 밖으로 나갔다.**
 * 유물 목록도 여섯 줄짜리 패널에 열두 종이 담겨 절반이 안 보였다. 둘 다 시작 인원
 * 둘로는 드러나지 않아서, 실제로 넷을 모은 사람만 볼 수 있는 버그였다.
 *
 * 스모크가 늘 둘로 돌고 있었으므로 스크린샷에도 잡히지 않았다. `?party=full` 이
 * 그 사각지대를 연다.
 */
test('넷이 모여도 전투 패널과 유물 목록이 잘리지 않는다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await page.goto('/?scene=battle&party=full');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battle', { timeout: 20_000 });
  await expect(page.locator('body')).toHaveAttribute('data-battle-phase', 'command', {
    timeout: 10_000,
  });

  // 넷을 다 그렸는가, 그리고 화면(270) 안에서 끝나는가. 둘은 다른 질문이다 —
  // 넷을 그려도 셋째부터 화면 밖이면 그린 것과 보이는 것이 다르다.
  await expect(page.locator('body')).toHaveAttribute('data-party-rows', '4');

  const bottom = Number(await page.locator('body').getAttribute('data-party-bottom'));
  expect(bottom, `파티 패널이 y=${bottom} 에서 끝난다 (화면은 270)`).toBeLessThanOrEqual(270);

  await page.screenshot({ path: `${SHOT_DIR}/battle-four.png` });

  // 유물 화면: 슬롯 8개, 유물 12종. 창이 넘어가는지 커서를 끝까지 내려 확인한다.
  await page.goto('/?scene=relic&party=full');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'relic', { timeout: 20_000 });
  await page.locator('#game canvas').click();

  const firstSlot = await page.locator('body').getAttribute('data-relic-slot');
  for (let i = 0; i < 7; i += 1) await stepKey(page, 's');
  const lastSlot = await page.locator('body').getAttribute('data-relic-slot');

  expect(lastSlot, '슬롯 여덟 개를 다 돌지 못했다').not.toBe(firstSlot);
  expect(lastSlot, '마지막 슬롯은 넷째 파티원의 것이어야 한다').toContain('seeker');

  await page.screenshot({ path: `${SHOT_DIR}/relic-four.png` });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 유물 도감 (T-058).
 *
 * 장착 화면은 *지금 가진 것*으로 무엇을 할지 묻고, 도감은 *무엇이 있는지*에 답한다.
 * **못 본 유물이 자리는 차지하되 내용은 비어 있어야** 한다 — 자리까지 없으면 몇 개가
 * 남았는지 알 수 없고, 내용까지 있으면 주웠을 때 새로울 것이 없다.
 */
test('도감이 진행률을 보여주고 못 본 유물을 가린다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await page.goto('/?encounters=off');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });

  await stepKey(page, 'c');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'codex', { timeout: 10_000 });

  /**
   * 진행률은 **시작 유물 수에서 끌어온다.**
   *
   * `6/12` 로 적어뒀더니 시작 유물을 여덟으로 늘린 순간 깨졌다 — 도감이 잘못된 게
   * 아니라 테스트가 낡은 것이었다. 여기서 지킬 것은 **화면이 실제 수를 말하는가**이지
   * 그 수가 몇인가가 아니다. 몇이어야 하는지는 `content.test.ts` 가 따로 지킨다.
   */
  await expect(page.locator('body')).toHaveAttribute(
    'data-codex-progress',
    `${STARTING_RELICS.length}/${TOTAL_RELICS}`,
  );
  // 다 아는 채로 시작하면 도감이 채울 것이 없다 — 아래의 "가려짐" 검사가 무의미해진다.
  expect(STARTING_RELICS.length, '시작부터 모든 유물을 지니고 있다').toBeLessThan(TOTAL_RELICS);
  await expect(page.locator('body')).toHaveAttribute('data-codex-hidden', 'no');
  await page.screenshot({ path: `${SHOT_DIR}/codex.png` });

  // 아래로 내려가면 아직 못 본 유물에 닿는다. 그 칸의 내용은 가려져 있어야 한다.
  let sawHidden = false;
  for (let i = 0; i < 11; i += 1) {
    await stepKey(page, 's');
    if ((await page.locator('body').getAttribute('data-codex-hidden')) === 'yes') {
      sawHidden = true;
      break;
    }
  }
  expect(sawHidden, '못 본 유물이 하나도 없다 — 도감이 전부 펼쳐져 있다').toBe(true);
  await page.screenshot({ path: `${SHOT_DIR}/codex-hidden.png` });

  // 닫으면 제자리로 돌아온다.
  await stepKey(page, 'Escape');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 메뉴와 인물 화면 (T-060, T-061).
 *
 * **단축키를 몰라도 모든 화면에 닿을 수 있어야 한다.** R·F·C·H 넷까지 늘어난 뒤로
 * 화면이 더 생기면 외울 것만 늘어난다. `Esc` 메뉴가 그 답이고, 단축키는 지름길로 남는다.
 *
 * 인물 화면은 **유물 보정이 실제로 반영되는지**를 함께 본다 — 기본값과 보정값을
 * 나란히 그리는 화면이라, 둘이 같은 출처를 쓰면 차이가 늘 0 이 되고도 멀쩡해 보인다.
 */
test('Esc 메뉴로 인물 화면까지 가고 제자리로 돌아온다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await page.goto('/?encounters=off&party=full');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });

  // 제자리를 잃지 않는지 보려면 스폰에서 옮겨둬야 한다.
  await stepKey(page, 'ArrowDown');
  const where = await page.locator('body').getAttribute('data-player');

  await stepKey(page, 'Escape');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'menu', { timeout: 10_000 });
  await expect(page.locator('body')).toHaveAttribute('data-menu-item', '인물');
  await page.screenshot({ path: `${SHOT_DIR}/menu.png` });

  await stepKey(page, 'Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'status', { timeout: 10_000 });

  // 넷을 다 넘겨볼 수 있어야 한다.
  const first = await page.locator('body').getAttribute('data-status-actor');
  for (let i = 0; i < 3; i += 1) await stepKey(page, 's');
  const last = await page.locator('body').getAttribute('data-status-actor');
  expect(last, '파티원을 넘기지 못했다').not.toBe(first);
  expect(last).toBe('seeker');

  // 유물이 최대 HP 를 올려주고 있으면 차이가 0 이 아니어야 한다.
  await stepKey(page, 'w');
  await stepKey(page, 'w');
  await stepKey(page, 'w');
  await page.screenshot({ path: `${SHOT_DIR}/status.png` });

  await stepKey(page, 'Escape');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });
  await expect(page.locator('body'), '메뉴를 거쳤다고 제자리를 잃으면 안 된다').toHaveAttribute(
    'data-player',
    where ?? '',
  );

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 잠긴 문 (T-052).
 *
 * **막는 것이 목적이 아니라 순서를 만드는 것이 목적이다.** 열쇠를 찾기 전에는 못
 * 지나가므로 층을 한 바퀴 돌아야 안쪽에 닿는다. 그 순서가 실제로 강제되는지는
 * 화면에서만 확인된다 — 데이터만 보면 문도 있고 열쇠도 있다.
 */
test('잠긴 문은 열쇠를 줍기 전에는 막고, 주우면 열린다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  // 열쇠 자리 바로 옆에서 시작한다 (`?at=`). 두 층을 가로지르는 여정은 다른 테스트의 몫이고,
  // 여기서 볼 것은 **열쇠 전후로 문이 다르게 구는가**다.
  await page.goto('/?encounters=off&party=full&at=ruin-sanctum:9,24');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });
  await expect(page.locator('body')).toHaveAttribute('data-map', 'ruin-sanctum');

  const walk = async (key: string, times: number): Promise<void> => {
    for (let i = 0; i < times; i += 1) await stepKey(page, key);
  };

  /** 대화는 쪽 수가 제각각이다 — 닫힐 때까지 넘긴다. */
  const closeDialogue = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) {
      if ((await page.locator('body').getAttribute('data-dialogue')) === 'closed') return;
      await stepKey(page, 'Space');
    }
  };

  // 문 앞까지 먼저 가서 **열쇠 없이 막히는지** 본다. 수로 → 통로 → 전실.
  await walk('ArrowRight', 13);
  await walk('ArrowUp', 13);
  await walk('ArrowRight', 9);

  await expect(page.locator('body'), '열쇠 없이 문을 지났다').toHaveAttribute(
    'data-map',
    'ruin-sanctum',
  );
  await expect(page.locator('body'), '막혔는데 아무 말이 없다').not.toHaveAttribute(
    'data-dialogue',
    'closed',
  );
  await page.screenshot({ path: `${SHOT_DIR}/locked-door.png` });
  await closeDialogue();

  // 열쇠를 주우러 되돌아간다.
  await walk('ArrowLeft', 9);
  await walk('ArrowDown', 13);
  await walk('ArrowLeft', 13);
  await expect(page.locator('body')).toHaveAttribute('data-player', '8,24');
  await closeDialogue();

  // 이제 열린다.
  await walk('ArrowRight', 13);
  await walk('ArrowUp', 13);
  await walk('ArrowRight', 9);
  await expect(page.locator('body'), '열쇠를 주웠는데도 막힌다').toHaveAttribute(
    'data-zone',
    'sanctum-inner',
    { timeout: 10_000 },
  );

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 보스 (T-051).
 *
 * **조우가 아니라 자리에 놓인 것이다.** 마주 보고 말을 걸어야 시작하고, 성소가
 * 안전지대라 들어서다가 사고로 전투에 들어가지 않는다.
 */
test('성소의 보스와 싸워 유물을 얻는다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  // 보스 왼쪽 칸에서 시작한다.
  await page.goto('/?encounters=off&party=full&at=ruin-sanctum:33,8');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });
  await expect(page.locator('body')).toHaveAttribute('data-zone', 'sanctum-inner');

  // 성소는 안전지대다 — 걸어다녀도 조우가 없다.
  await expect(page.locator('body')).toHaveAttribute('data-encounter-zone', 'safe');

  // 마주 보고 말을 걸어야 시작한다.
  await stepKey(page, 'ArrowRight');
  await stepKey(page, 'Space');
  await expect(page.locator('body'), '보스와 마주 보고도 전투가 시작되지 않았다').toHaveAttribute(
    'data-scene',
    'battle',
    { timeout: 10_000 },
  );
  await page.screenshot({ path: `${SHOT_DIR}/boss.png` });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 새로 시작하면 처음부터다 (T-064).
 *
 * **씬 데이터가 남아 있었다.** 타이틀에서 새 게임을 시작할 때 위치를 안 넘겼더니
 * Phaser 가 그 씬에 마지막으로 넘긴 값을 그대로 썼고, 그래서 전멸 → 타이틀 →
 * 새로 시작 을 하면 **죽은 자리에서 다시 시작했다.** 파티는 새것인데 위치만 지난 회차였다.
 */
test('전멸한 뒤 새로 시작하면 시작 지점이다', async ({ page }) => {
  /**
   * 이 테스트는 전멸할 때까지 최대 400라운드를 돈다 — 실제 RNG로 플레이하므로
   * 몇 판 만에 지는지가 매번 다르다. 라운드마다 최소 220ms(`stepKey`)가 드니
   * 최악의 경우 기본 45초 한도를 이미 넘을 수 있다 — CI 러너 부하와 무관하게
   * 애초에 여유가 부족했다.
   */
  test.setTimeout(120_000);

  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  /**
   * **한 세션 안에서 층을 옮긴 뒤 죽어야 재현된다.**
   *
   * 버그는 씬에 넘긴 데이터가 남아 있는 것이므로, overworld 를 **값과 함께** 시작한 적이
   * 있어야 한다 — 층 이동이 그 자리다. `?at=` 으로 갈 수도 있지만 그 플래그는 새 게임에도
   * 걸려서 "시작 지점인가" 를 물을 수 없게 만든다. 계단으로 내려가면 플래그가 필요 없다.
   */
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });

  // 야영지 안의 계단(11,3)으로. 안전지대라 가는 길에는 전투가 없다.
  for (let i = 0; i < 3; i += 1) await stepKey(page, 'ArrowRight');
  for (let i = 0; i < 3; i += 1) await stepKey(page, 'ArrowUp');
  await expect(page.locator('body'), '지하로 내려가지 못했다').toHaveAttribute(
    'data-map',
    'ruin-depths',
    { timeout: 10_000 },
  );

  /**
   * 지하는 적 Lv7 이고 파티는 Lv1 둘이다 — 몇 판 안에 전멸한다.
   * 이기면 계속 걷고, 지면 타이틀로 나간다.
   */
  // 전투 한 판에도 입력이 여럿 든다 (커맨드 → 대상 → 연출). 넉넉히 돈다.
  for (let round = 0; round < 400; round += 1) {
    const scene = await page.locator('body').getAttribute('data-scene');
    if (scene === 'title') break;

    if (scene === 'battle') {
      if ((await page.locator('body').getAttribute('data-battle-phase')) === 'over') {
        await page.keyboard.press('Enter', { delay: 60 });
      } else {
        await page.keyboard.press('Enter', { delay: 30 });
      }
      continue;
    }

    await stepKey(page, round % 2 === 0 ? 'ArrowDown' : 'ArrowUp');
  }

  await expect(page.locator('body'), '전멸하지 않았다').toHaveAttribute('data-scene', 'title', {
    timeout: 30_000,
  });

  // 여기서 새로 시작한다 — 페이지를 새로 열지 않는다. 그게 이 버그가 사는 자리다.
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });

  await expect(page.locator('body'), '죽은 층에서 다시 시작했다').toHaveAttribute(
    'data-map',
    'ruin-entrance',
  );
  await expect(page.locator('body')).toHaveAttribute('data-player', '8,6');

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 메뉴의 저장과 이어하기가 서로 다른 화면을 연다 (T-064).
 *
 * **모드를 안 넘겨 "저장" 이 불러오기 화면을 열고 있었다.** 두 화면이 비슷하게 생겨서
 * 눈으로도 안 띄었다 — 슬롯 목록에 커서가 있는 것은 똑같다.
 */
test('메뉴의 저장과 이어하기가 각각 제 모드로 열린다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await page.goto('/?encounters=off');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });

  const openMenu = async (item: string): Promise<void> => {
    await stepKey(page, 'Escape');
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'menu', { timeout: 10_000 });
    for (let i = 0; i < 8; i += 1) {
      if ((await page.locator('body').getAttribute('data-menu-item')) === item) return;
      await stepKey(page, 's');
    }
    throw new Error(`메뉴에서 "${item}" 을 찾지 못했다`);
  };

  await openMenu('저장');
  await stepKey(page, 'Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'save', { timeout: 10_000 });
  await expect(page.locator('body'), '저장을 골랐는데 불러오기가 열렸다').toHaveAttribute(
    'data-save-mode',
    'save',
  );

  // 취소하면 걷던 자리로 돌아온다 — 타이틀로 튕기지 않는다.
  await stepKey(page, 'Escape');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });

  await openMenu('이어하기');
  await stepKey(page, 'Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'save', { timeout: 10_000 });
  await expect(page.locator('body')).toHaveAttribute('data-save-mode', 'load');
  await page.screenshot({ path: `${SHOT_DIR}/menu-load.png` });

  await stepKey(page, 'Escape');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 여관이 묻고 나서 값을 받는다 (T-048).
 *
 * **얼마인지 모르고 쓰는 것은 불친절하다.** 은편은 아이템에도 쓰는 자원이라
 * "지금 자는 게 나은가" 가 실제 판단이다.
 */
test('여관은 값을 알려주고 묻는다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await page.goto('/?encounters=off');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });

  // 거점으로 나간다 (정화소 테스트와 같은 길).
  for (let i = 0; i < 6; i += 1) await stepKey(page, 'ArrowLeft');
  for (let i = 0; i < 4; i += 1) await stepKey(page, 'ArrowUp');
  await expect(page.locator('body')).toHaveAttribute('data-map', 'haven', { timeout: 10_000 });
  await expect(page.locator('body')).toHaveAttribute('data-player', '35,12');

  // 여관(28,8) 아래 칸으로. 도착 (35,12) → 왼쪽 7 → 위 3.
  for (let i = 0; i < 7; i += 1) await stepKey(page, 'ArrowLeft');
  for (let i = 0; i < 3; i += 1) await stepKey(page, 'ArrowUp');
  await expect(page.locator('body')).toHaveAttribute('data-player', '28,9');
  await expect(page.locator('body')).toHaveAttribute('data-facing', 'up');

  /**
   * 은편이 0 이라 **묻지 않고 값만 알려준다** — 고를 수 없는 것을 고르라고 하지 않는다.
   * 확인 창을 띄우는 쪽은 아래 전멸 테스트가 지난다.
   */
  await stepKey(page, 'Space');
  await expect(page.locator('body'), '여관이 아무 말도 하지 않았다').toHaveAttribute(
    'data-dialogue',
    /^1\//,
  );
  await page.screenshot({ path: `${SHOT_DIR}/inn.png` });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 전멸해도 마지막 저장 지점에서 다시 (T-042).
 *
 * **타이틀로 튕기면 이어하기를 다시 찾아 들어가야 한다** — 진 것에 더해 길까지 잃는다.
 * 이어할 세이브가 있을 때만 묻는다: 없으면 고를 것이 하나뿐이고 그건 질문이 아니다.
 */
test('전멸하면 마지막 저장 지점에서 다시 할지 묻는다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'title', { timeout: 20_000 });
  await page.locator('#game canvas').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });

  // 먼저 저장해 둔다 — 세이브가 없으면 묻지 않고 타이틀로 간다.
  await stepKey(page, 'f');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'save', { timeout: 10_000 });
  await stepKey(page, 'Enter');
  await expect(page.locator('body')).toHaveAttribute('data-save-slots', /^ok/);
  await stepKey(page, 'Escape');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'overworld', { timeout: 10_000 });

  // 계단으로 지하에 내려가 죽는다.
  for (let i = 0; i < 3; i += 1) await stepKey(page, 'ArrowRight');
  for (let i = 0; i < 3; i += 1) await stepKey(page, 'ArrowUp');
  await expect(page.locator('body')).toHaveAttribute('data-map', 'ruin-depths', { timeout: 10_000 });

  /**
   * 죽을 때까지 걷고 싸운다. 전멸한 뒤에도 Enter 를 계속 누르면
   * **전멸 알림 → 선택 창 → 첫 항목(마지막 저장 지점)** 순으로 넘어간다.
   *
   * 타이밍을 짚어 확인하지 않는다 — 한 프레임 차이로 어디까지 갔는지가 달라져서,
   * 그걸 맞히려 들면 테스트가 실제 동작이 아니라 속도를 재게 된다. **어디에 닿는가**만 본다.
   */
  let sawDefeat = false;
  for (let round = 0; round < 400; round += 1) {
    const scene = await page.locator('body').getAttribute('data-scene');
    if (scene === 'save' || scene === 'title') break;

    if ((await page.locator('body').getAttribute('data-battle-outcome')) === 'defeat') {
      sawDefeat = true;
    }

    if (scene === 'battle') {
      await page.keyboard.press('Enter', { delay: 30 });
    } else {
      await stepKey(page, round % 2 === 0 ? 'ArrowDown' : 'ArrowUp');
    }
  }

  expect(sawDefeat, '전멸하지 않았다').toBe(true);

  // **타이틀이 아니라 불러오기 화면이다.** 진 것에 더해 길까지 잃지 않는다.
  await expect(page.locator('body'), '전멸하고 타이틀로 튕겼다').toHaveAttribute(
    'data-scene',
    'save',
    { timeout: 10_000 },
  );
  await expect(page.locator('body')).toHaveAttribute('data-save-mode', 'load');
  await page.screenshot({ path: `${SHOT_DIR}/defeat-resume.png` });

  expect(errors, `콘솔/페이지 에러가 발생했습니다:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * 잡몹 여섯 종이 한 화면에 선다 (T-050).
 *
 * **타일 번호는 눈으로 봐야 안다.** 시트에서 번호만 보고 고르면 "떠도는 불씨" 자리에
 * 사람 얼굴이 서 있어도 테스트는 전부 초록이다 — 실제로 그랬다.
 * 스크린샷이 이 검사의 절반이고, 나머지 절반이 아래의 개수 확인이다.
 */
test('잡몹 여섯 종이 한 화면에 선다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  await page.goto('/?scene=battle&mobs=all&party=full');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'battle', { timeout: 20_000 });
  await expect(page.locator('body')).toHaveAttribute('data-battle-phase', 'command', {
    timeout: 10_000,
  });

  await page.screenshot({ path: `${SHOT_DIR}/mobs.png` });

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
