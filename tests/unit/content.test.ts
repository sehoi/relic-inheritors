import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTiledMap } from '../../src/core/world/tilemap.js';
import { isSolid } from '../../src/core/world/tilemap.js';
import { spawnWalker } from '../../src/core/world/movement.js';
import {
  TEXT_BOX_LAYOUT,
  openDialogue,
  validateDialogueScript,
} from '../../src/core/dialogue/index.js';
import { DIALOGUE_SCRIPTS, dialogueScript } from '../../src/data/dialogue.js';
import { NPCS_BY_MAP } from '../../src/data/npcs.js';

/**
 * 콘텐츠 정합성.
 *
 * 코드가 맞아도 데이터가 어긋나면 게임은 깨진다 — 벽 속에 선 NPC, 존재하지 않는 대화 ID,
 * 상자 밖으로 넘치는 대사. 루프가 콘텐츠를 늘릴수록 이런 실수가 늘어나므로 여기서 막는다.
 */

const map = parseTiledMap(
  JSON.parse(readFileSync(join(process.cwd(), 'src/data/maps/ruin-entrance.tmj'), 'utf8')),
);

describe('대화 스크립트', () => {
  it('모든 스크립트가 스키마를 통과한다', () => {
    for (const [key, script] of Object.entries(DIALOGUE_SCRIPTS)) {
      expect(() => validateDialogueScript(script), key).not.toThrow();
    }
  });

  it('레코드 키와 스크립트 id 가 일치한다', () => {
    const mismatched = Object.entries(DIALOGUE_SCRIPTS)
      .filter(([key, script]) => key !== script.id)
      .map(([key, script]) => `${key} !== ${script.id}`);

    expect(mismatched, `키와 id 가 어긋납니다:\n${mismatched.join('\n')}`).toEqual([]);
  });

  it('실제 텍스트 상자 크기로 펼쳐진다', () => {
    // 레이아웃을 바꿨을 때 기존 대사가 감당되는지 여기서 드러난다.
    for (const script of Object.values(DIALOGUE_SCRIPTS)) {
      const session = openDialogue(script, TEXT_BOX_LAYOUT);
      expect(session.pages.length, script.id).toBeGreaterThan(0);

      for (const page of session.pages) {
        const lines = page.text.split('\n');
        expect(lines.length, `${script.id}: 줄 수 초과`).toBeLessThanOrEqual(
          TEXT_BOX_LAYOUT.maxLines,
        );
        for (const line of lines) {
          expect(line.length, `${script.id}: "${line}"`).toBeLessThanOrEqual(
            TEXT_BOX_LAYOUT.maxCharsPerLine,
          );
        }
      }
    }
  });

  it('없는 스크립트를 조회하면 무엇이 있는지 알려주며 던진다', () => {
    expect(() => dialogueScript('nope')).toThrow(/ruin-scholar/);
  });
});

describe('NPC 배치', () => {
  const npcs = NPCS_BY_MAP['ruin-entrance'] ?? [];

  it('배치가 비어 있지 않다', () => {
    expect(npcs.length).toBeGreaterThan(0);
  });

  it('벽 속에 선 NPC 가 없다', () => {
    const stuck = npcs
      .filter((npc) => isSolid(map, npc.position.x, npc.position.y))
      .map((npc) => `${npc.id} (${npc.position.x}, ${npc.position.y})`);

    expect(stuck, `벽 속에 있습니다:\n${stuck.join('\n')}`).toEqual([]);
  });

  it('같은 칸에 겹친 NPC 가 없다', () => {
    const seen = new Set<string>();
    const overlapping = npcs
      .filter((npc) => {
        const key = `${npc.position.x},${npc.position.y}`;
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
      })
      .map((npc) => npc.id);

    expect(overlapping).toEqual([]);
  });

  it('플레이어 스폰 지점을 막지 않는다', () => {
    const spawn = spawnWalker(map).position;
    const blocker = npcs.find(
      (npc) => npc.position.x === spawn.x && npc.position.y === spawn.y,
    );
    expect(blocker?.id, '스폰 칸에 NPC 가 서 있으면 시작하자마자 갇힌다').toBeUndefined();
  });

  it('모든 NPC 가 존재하는 대화를 가리킨다', () => {
    const dangling = npcs
      .filter((npc) => DIALOGUE_SCRIPTS[npc.dialogueId] === undefined)
      .map((npc) => `${npc.id} → ${npc.dialogueId}`);

    expect(dangling, `없는 대화를 가리킵니다:\n${dangling.join('\n')}`).toEqual([]);
  });

  it('타일 번호가 타일셋 범위 안이다', () => {
    const tileset = map.tilesets[0];
    expect(tileset).toBeDefined();

    const outOfRange = npcs
      .filter((npc) => npc.tile < 0 || npc.tile >= (tileset?.tileCount ?? 0))
      .map((npc) => `${npc.id} → ${npc.tile}`);

    expect(outOfRange).toEqual([]);
  });
});
