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
import { createAssetCatalog, parseAssetIndex } from '../../src/core/assets/index.js';
import {
  CHARACTER_FRAMES,
  CHARACTER_SHEET,
  PARTY_PORTRAITS,
  PORTRAITS,
  portraitOf,
} from '../../src/data/characters.js';
import { NPCS_BY_MAP } from '../../src/data/npcs.js';
import { PORTALS_BY_MAP } from '../../src/data/portals.js';
import { ZONES_BY_MAP, zonesForMap } from '../../src/data/zones.js';
import { SITES_BY_MAP, sitesForMap } from '../../src/data/sites.js';
import { duplicateRewards, validateSites } from '../../src/core/world/site.js';
import { cleansedErosion, validateFacilities } from '../../src/core/world/facility.js';
import { CLEANSING, facilitiesForMap } from '../../src/data/facilities.js';
import { item } from '../../src/data/items.js';
import { RELICS, STARTING_RELICS } from '../../src/data/relics.js';
import { TOTAL_SLOTS } from '../../src/data/party.js';
import { AREA_MOBS, MOB_KINDS, mobProfile } from '../../src/data/encounters.js';
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

  it('모든 NPC 가 존재하는 대화와 유효한 프레임을 가리킨다', () => {
    const problems: string[] = [];

    for (const id of MAP_IDS) {
      for (const npc of NPCS_BY_MAP[id] ?? []) {
        if (DIALOGUE_SCRIPTS[npc.dialogueId] === undefined) {
          problems.push(`${id}/${npc.id}: 없는 대화 "${npc.dialogueId}"`);
        }
        // 사람은 전부 `chars-roguelike` 시트에서 나온다 (`data/characters.ts`).
        if (npc.tile < 0 || npc.tile >= CHARACTER_FRAMES) {
          problems.push(`${id}/${npc.id}: 프레임 ${npc.tile} 이 범위 밖 (0~${CHARACTER_FRAMES - 1})`);
        }
      }
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('NPC 마다 다르게 생겼다', () => {
    // 같은 얼굴이 둘이면 이름표를 읽기 전까지 누구인지 알 수 없다.
    for (const id of MAP_IDS) {
      const frames = (NPCS_BY_MAP[id] ?? []).map((npc) => npc.tile);
      expect(new Set(frames).size, id).toBe(frames.length);
    }
  });
});

describe('회수 지점 (T-039)', () => {
  const occupantsOf = (id: MapId): { x: number; y: number }[] => [
    ...(NPCS_BY_MAP[id] ?? []).map((npc) => npc.position),
    ...(PORTALS_BY_MAP[id] ?? []).map((portal) => portal.position),
  ];

  it.each([...MAP_IDS])('%s: 배치가 유효하다', (id) => {
    // 벽 속·계단 위·NPC 위에 놓이면 영영 못 줍거나 무엇이 발동할지 모호해진다.
    expect(() =>
      validateSites(id, mapOf(id), sitesForMap(id), {
        occupied: occupantsOf(id),
        knownRelics: Object.keys(RELICS),
      }),
    ).not.toThrow();
  });

  it('같은 유물을 두 곳에서 줍지 않는다', () => {
    // 두 번째는 아무 일도 일어나지 않아 버그로 보인다.
    expect(duplicateRewards(SITES_BY_MAP)).toEqual([]);
  });

  it('시작부터 지닌 유물을 놓아두지 않는다', () => {
    const redundant = Object.values(SITES_BY_MAP)
      .flat()
      .filter((site) => STARTING_RELICS.includes(site.relicId))
      .map((site) => `${site.id}: ${site.relicId}`);

    expect(redundant, `이미 지닌 유물입니다:\n${redundant.join('\n')}`).toEqual([]);
  });

  it('모든 유물을 손에 넣을 수 있다 (T-062)', () => {
    // **유물 12종 중 둘이 아무 데서도 나오지 않고 있었다.** 시작 목록에도 회수 지점에도
    // 없어서 도감을 채울 방법이 없었는데, 아무 테스트도 빨개지지 않았다 — 데이터가
    // 늘어난 자리와 데이터를 나눠 놓는 자리가 달라서, 둘을 맞춰 보는 사람이 없었다.
    const obtainable = new Set([
      ...STARTING_RELICS,
      ...Object.values(SITES_BY_MAP)
        .flat()
        .map((site) => site.relicId),
    ]);

    const unreachable = Object.keys(RELICS).filter((id) => !obtainable.has(id));

    expect(
      unreachable,
      `어디서도 얻을 수 없는 유물입니다 — 도감(T-058)을 채울 방법이 없습니다:\n  ${unreachable.join('\n  ')}`,
    ).toEqual([]);
  });

  it('시작 유물이 슬롯을 채운다 (T-062)', () => {
    // 빈 슬롯은 고민이 아니라 그냥 손해다. 파티가 넷이 되며 슬롯이 8 이 됐는데
    // 시작 유물은 여섯이라 두 칸이 비어 있었다.
    expect(
      STARTING_RELICS.length,
      `시작 유물 ${STARTING_RELICS.length}종, 슬롯 ${TOTAL_SLOTS}칸`,
    ).toBeGreaterThanOrEqual(TOTAL_SLOTS);
  });

  it('잡몹 6종이 전부 어딘가에서 나온다 (T-050)', () => {
    // 유물 둘이 아무 데서도 안 나오던 일(T-062)과 같은 종류의 실수다 —
    // `MOB_TEMPLATES` 에 적기만 하고 `AREA_MOBS` 에 안 넣으면 조용히 없는 적이 된다.
    const appearing = new Set(Object.values(AREA_MOBS).flat());
    const unused = MOB_KINDS.filter((kind) => !appearing.has(kind));

    expect(unused, `어느 지역에도 나오지 않는 잡몹입니다:\n  ${unused.join('\n  ')}`).toEqual([]);
  });

  it('종류마다 다른 AI 를 쓴다 (T-050)', () => {
    // **속성만 다르고 행동이 같으면 여섯이어도 싸움은 하나다.**
    // 여섯이 전부 다를 필요는 없지만(둘은 같은 `brute`), 하나로 몰리면 안 된다.
    const profiles = new Set(MOB_KINDS.map((kind) => mobProfile(`${kind}-1`).id));

    expect(
      profiles.size,
      `잡몹 ${MOB_KINDS.length}종이 AI ${profiles.size}종만 쓴다: ${[...profiles].join(', ')}`,
    ).toBeGreaterThanOrEqual(4);
  });

  it('층이 깊어지면 나오는 적이 바뀐다 (T-050)', () => {
    // 같은 여섯이 어디서나 나오면 내려간 보람이 없다.
    const entrance = new Set(AREA_MOBS['ruin-entrance'] ?? []);
    const depths = AREA_MOBS['ruin-depths'] ?? [];
    const fresh = depths.filter((kind) => !entrance.has(kind));

    expect(fresh.length, '지하에 새로운 적이 하나도 없다').toBeGreaterThan(0);
  });

  it('회수 지점은 위험 구역에 있다', () => {
    // 안전지대에 두면 전투를 거치지 않고 유물이 늘어난다.
    const tooSafe: string[] = [];
    for (const id of MAP_IDS) {
      for (const site of sitesForMap(id)) {
        if (!encountersAt(zonesForMap(id), site.position.x, site.position.y)) {
          tooSafe.push(`${id}/${site.id}`);
        }
      }
    }
    expect(tooSafe, `안전지대에 있습니다:\n${tooSafe.join('\n')}`).toEqual([]);
  });

  it('유적 층마다 1~2개다 (GDD §6.1)', () => {
    // 거점에는 없다 — 유물은 유적에서 나온다.
    for (const id of MAP_IDS.filter((mapId) => mapId !== 'haven')) {
      expect(sitesForMap(id).length, id).toBeGreaterThanOrEqual(1);
      expect(sitesForMap(id).length, id).toBeLessThanOrEqual(2);
    }
  });

  it('거점에는 회수 지점이 없다', () => {
    expect(sitesForMap('haven')).toEqual([]);
  });
});

describe('거점 시설 (T-040)', () => {
  it.each([...MAP_IDS])('%s: 배치가 유효하다', (id) => {
    // 벽 속·다른 것 위에 놓이면 쓸 수 없고, 사방이 막혀도 마찬가지다.
    expect(() =>
      validateFacilities(id, mapOf(id), facilitiesForMap(id), {
        occupied: [
          ...(NPCS_BY_MAP[id] ?? []).map((npc) => npc.position),
          ...(PORTALS_BY_MAP[id] ?? []).map((portal) => portal.position),
          ...sitesForMap(id).map((site) => site.position),
        ],
      }),
    ).not.toThrow();
  });

  it('거점에 GDD §6.4 의 시설이 모두 있다', () => {
    // 정화소·여관·상점. 없으면 거점이 그냥 빈 방이다.
    const kinds = new Set(facilitiesForMap('haven').map((f) => f.kind));
    for (const kind of ['cleansing', 'inn', 'shop'] as const) {
      expect(kinds.has(kind), kind).toBe(true);
    }
  });

  it('거점은 통째로 안전지대다', () => {
    // 돌아올 곳에서 전투가 벌어지면 거점의 목적이 성립하지 않는다.
    expect(zonesForMap('haven').every((zone) => !zone.encounters)).toBe(true);
  });

  it('정화소가 정화석보다 낫다 (GDD §5.4)', () => {
    // 그러지 않으면 거점까지 걸어올 이유가 없고, 거점이 없는 것과 같아진다.
    const stoneEffect = item('cleansing-stone').effect;
    const stone = stoneEffect.kind === 'cleanse' ? stoneEffect.erosion : 0;

    // 침식이 정화석 한 개 분량 이상 쌓였을 때를 본다 — 그 아래는 거점에 갈 구간이 아니다.
    for (const erosion of [stone, stone * 2, stone * 4]) {
      const byPool = erosion - cleansedErosion(erosion, CLEANSING);
      expect(byPool, `침식 ${erosion}`).toBeGreaterThanOrEqual(stone);
    }
  });

  it('깊이 쌓인 침식은 한 번에 지워지지 않는다', () => {
    // 다 지워지면 "센 유물을 언제 쓰나" 라는 판단이 사라진다 (침식은 리스크 축이다).
    // 얕은 침식이 말끔히 씻기는 것은 괜찮다 — 남아야 하는 것은 무리한 대가 쪽이다.
    expect(cleansedErosion(200, CLEANSING)).toBeGreaterThan(0);
    expect(cleansedErosion(400, CLEANSING)).toBeGreaterThan(cleansedErosion(200, CLEANSING));
  });

  it('씻을 것이 없으면 0 이다', () => {
    expect(cleansedErosion(0, CLEANSING)).toBe(0);
  });
});

describe('인물 스프라이트', () => {
  it('선언한 격자가 실제 시트 크기와 맞는다', () => {
    // 격자를 잘못 적으면 화면이 비지 않고 **한 칸씩 밀린 그림**이 나온다.
    // 에셋이 없을 때보다 알아채기 어려우므로 여기서 못을 박는다.
    const entry = createAssetCatalog(
      parseAssetIndex(JSON.parse(readFileSync(join(process.cwd(), 'assets/index.json'), 'utf8'))),
    ).get(CHARACTER_SHEET.key);

    const png = readFileSync(join(process.cwd(), entry.path));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);

    const spacing = entry.kind === 'spritesheet' || entry.kind === 'tileset' ? (entry.frame.spacing ?? 0) : 0;
    const cell = 16 + spacing;

    expect(Math.floor((width + spacing) / cell), '열 수').toBe(CHARACTER_SHEET.columns);
    expect(Math.floor((height + spacing) / cell), '행 수').toBe(CHARACTER_SHEET.rows);
  });

  it('파티원마다 얼굴이 다르다', () => {
    const frames = Object.values(PARTY_PORTRAITS);
    expect(new Set(frames).size).toBe(frames.length);
  });

  it('모든 초상이 시트 범위 안이다', () => {
    for (const [name, frame] of Object.entries(PORTRAITS)) {
      expect(frame, name).toBeGreaterThanOrEqual(0);
      expect(frame, name).toBeLessThan(CHARACTER_FRAMES);
    }
  });

  it('모르는 액터도 사람으로 그려진다 (빈 칸이 되지 않는다)', () => {
    expect(portraitOf('nobody')).toBeGreaterThanOrEqual(0);
    expect(portraitOf('nobody')).toBeLessThan(CHARACTER_FRAMES);
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
