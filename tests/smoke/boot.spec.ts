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

  await stepKey(page, 's');
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
