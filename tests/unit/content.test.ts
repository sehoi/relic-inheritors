import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSolid, parseTiledMap, type TileMap } from '../../src/core/world/tilemap.js';
import { spawnWalker } from '../../src/core/world/movement.js';
import { validatePortalNetwork } from '../../src/core/world/portal.js';
import {
  TEXT_BOX_LAYOUT,
  openDialogue,
  validateDialogueScript,
} from '../../src/core/dialogue/index.js';
import { DIALOGUE_SCRIPTS, dialogueScript } from '../../src/data/dialogue.js';
import { NPCS_BY_MAP } from '../../src/data/npcs.js';
import { PORTALS_BY_MAP } from '../../src/data/portals.js';
import { ZONES_BY_MAP, zonesForMap } from '../../src/data/zones.js';
import { encountersAt, validateZones, zoneAt } from '../../src/core/world/zone.js';
import { MAP_FILES, MAP_IDS, MAP_NAMES, STARTING_MAP, type MapId } from '../../src/data/maps.js';

/**
 * 콘텐츠 정합성.
 *
 * 코드가 맞아도 데이터가 어긋나면 게임은 깨진다 — 벽 속에 선 NPC, 존재하지 않는 대화 ID,
 * 상자 밖으로 넘치는 대사, 무한히 오가는 계단.
 * 루프가 콘텐츠를 늘릴수록 이런 실수가 늘어나므로 여기서 막는다.
 */

const maps = new Map<MapId, TileMap>(
  MAP_IDS.map((id) => [
    id,
    parseTiledMap(JSON.parse(readFileSync(join(process.cwd(), MAP_FILES[id]), 'utf8'))),
  ]),
);

const mapOf = (id: MapId): TileMap => {
  const map = maps.get(id);
  if (map === undefined) throw new Error(`맵을 읽지 못했습니다: ${id}`);
  return map;
};

describe('맵', () => {
  it('모든 맵이 파싱된다', () => {
    expect(maps.size).toBe(MAP_IDS.length);
  });

  it('시작 맵이 목록에 있다', () => {
    expect(MAP_IDS).toContain(STARTING_MAP);
  });

  it.each([...MAP_IDS])('%s: 스폰 지점이 유효하다', (id) => {
    expect(() => spawnWalker(mapOf(id))).not.toThrow();
  });

  it.each([...MAP_IDS])('%s: 화면보다 크다 (카메라 추적이 의미를 가지려면)', (id) => {
    const map = mapOf(id);
    expect(map.width * map.tileWidth).toBeGreaterThan(480);
    expect(map.height * map.tileHeight).toBeGreaterThan(270);
  });

  it.each([...MAP_IDS])('%s: 색인된 타일셋만 참조한다', (id) => {
    expect(mapOf(id).tilesets.map((t) => t.assetKey)).toEqual(['tiles-dungeon']);
  });

  it.each([...MAP_IDS])('%s: 화면에 띄울 이름이 있다', (id) => {
    expect(MAP_NAMES[id].trim().length).toBeGreaterThan(0);
  });
});

describe('구역 배치', () => {
  it.each([...MAP_IDS])('%s: 걸어갈 수 있는 모든 칸이 어느 구역엔가 속한다', (id) => {
    // 빈틈이 남으면 이름도 없고 전투도 안 나오는 유령 구역이 된다.
    expect(() => validateZones(id, mapOf(id), zonesForMap(id))).not.toThrow();
  });

  it.each([...MAP_IDS])('%s: 스폰 지점이 어느 구역엔가 속한다', (id) => {
    const spawn = spawnWalker(mapOf(id)).position;
    expect(zoneAt(zonesForMap(id), spawn.x, spawn.y), `${id} 스폰 (${spawn.x}, ${spawn.y})`)
      .toBeDefined();
  });

  it('NPC 는 안전지대에 선다', () => {
    // 말을 거는 도중에 습격당하면 안전해 보이는 곳이 안전하지 않다는 뜻이 된다.
    const problems: string[] = [];

    for (const id of MAP_IDS) {
      const zones = zonesForMap(id);
      for (const npc of NPCS_BY_MAP[id] ?? []) {
        if (encountersAt(zones, npc.position.x, npc.position.y)) {
          const zone = zoneAt(zones, npc.position.x, npc.position.y);
          problems.push(`${id}/${npc.id}: 전투가 벌어지는 구역 "${zone?.id ?? '없음'}" 에 서 있다`);
        }
      }
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('시작 맵에 안전지대가 있다', () => {
    // 처음 조작을 배우는 곳에서 습격당하면 무엇을 배우는 중인지 알 수 없게 된다.
    expect(zonesForMap(STARTING_MAP).some((zone) => !zone.encounters)).toBe(true);
  });

  it('시작 지점이 안전지대다', () => {
    const spawn = spawnWalker(mapOf(STARTING_MAP)).position;
    expect(encountersAt(zonesForMap(STARTING_MAP), spawn.x, spawn.y)).toBe(false);
  });

  it('구역 이름이 맵 사이에서도 겹치지 않는다 (같은 이름이 두 곳이면 위치를 알려주지 못한다)', () => {
    const names = Object.values(ZONES_BY_MAP).flatMap((zones) => zones.map((zone) => zone.name));
    expect(names.length).toBe(new Set(names).size);
  });

  it('탐색할 수 있는 구역이 안전지대보다 많다 (안전지대가 흔하면 탐색의 긴장이 사라진다)', () => {
    const all = Object.values(ZONES_BY_MAP).flat();
    const safe = all.filter((zone) => !zone.encounters).length;
    expect(safe * 2).toBeLessThan(all.length);
  });
});

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
  it.each([...MAP_IDS])('%s: 벽 속에 선 NPC 가 없다', (id) => {
    const map = mapOf(id);
    const stuck = (NPCS_BY_MAP[id] ?? [])
      .filter((npc) => isSolid(map, npc.position.x, npc.position.y))
      .map((npc) => `${npc.id} (${npc.position.x}, ${npc.position.y})`);

    expect(stuck, `벽 속에 있습니다:\n${stuck.join('\n')}`).toEqual([]);
  });

  it.each([...MAP_IDS])('%s: 겹치거나 스폰을 막는 NPC 가 없다', (id) => {
    const npcs = NPCS_BY_MAP[id] ?? [];
    const spawn = spawnWalker(mapOf(id)).position;

    const seen = new Set<string>();
    const problems: string[] = [];

    for (const npc of npcs) {
      const key = `${npc.position.x},${npc.position.y}`;
      if (seen.has(key)) problems.push(`${npc.id}: 다른 NPC 와 같은 칸 (${key})`);
      seen.add(key);
      if (npc.position.x === spawn.x && npc.position.y === spawn.y) {
        problems.push(`${npc.id}: 스폰 칸에 서 있어 시작하자마자 갇힌다`);
      }
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('모든 NPC 가 존재하는 대화와 유효한 타일을 가리킨다', () => {
    const problems: string[] = [];

    for (const id of MAP_IDS) {
      const tileCount = mapOf(id).tilesets[0]?.tileCount ?? 0;
      for (const npc of NPCS_BY_MAP[id] ?? []) {
        if (DIALOGUE_SCRIPTS[npc.dialogueId] === undefined) {
          problems.push(`${id}/${npc.id}: 없는 대화 "${npc.dialogueId}"`);
        }
        if (npc.tile < 0 || npc.tile >= tileCount) {
          problems.push(`${id}/${npc.id}: 타일 ${npc.tile} 이 범위 밖`);
        }
      }
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });
});

describe('포탈 배치', () => {
  it('포탈망이 유효하다 (무한 왕복·끊어진 연결 없음)', () => {
    expect(() => validatePortalNetwork(PORTALS_BY_MAP)).not.toThrow();
  });

  it('맵이 서로 오갈 수 있다 (한 방향만 뚫린 계단이 없다)', () => {
    const problems: string[] = [];

    for (const [mapId, portals] of Object.entries(PORTALS_BY_MAP)) {
      for (const portal of portals) {
        const backLinks = PORTALS_BY_MAP[portal.target.mapId as MapId] ?? [];
        const hasReturn = backLinks.some((back) => back.target.mapId === mapId);
        if (!hasReturn) {
          problems.push(`${mapId}/${portal.id} → ${portal.target.mapId}: 돌아올 길이 없다`);
        }
      }
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });

  it.each([...MAP_IDS])('%s: 포탈과 도착 지점이 벽 속이 아니다', (id) => {
    const problems: string[] = [];

    for (const portal of PORTALS_BY_MAP[id] ?? []) {
      if (isSolid(mapOf(id), portal.position.x, portal.position.y)) {
        problems.push(`${portal.id}: 포탈이 벽 속 (${portal.position.x}, ${portal.position.y})`);
      }

      const targetMap = mapOf(portal.target.mapId as MapId);
      const { x, y } = portal.target.position;
      if (isSolid(targetMap, x, y)) {
        problems.push(`${portal.id}: 도착 지점이 벽 속 (${portal.target.mapId} ${x}, ${y})`);
      }
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('포탈 칸에 NPC 가 서 있지 않다 (계단을 막으면 진행이 끊긴다)', () => {
    const problems: string[] = [];

    for (const id of MAP_IDS) {
      for (const portal of PORTALS_BY_MAP[id] ?? []) {
        const blocker = (NPCS_BY_MAP[id] ?? []).find(
          (npc) => npc.position.x === portal.position.x && npc.position.y === portal.position.y,
        );
        if (blocker !== undefined) problems.push(`${id}: ${blocker.id} 가 ${portal.id} 를 막는다`);
      }
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });
});
