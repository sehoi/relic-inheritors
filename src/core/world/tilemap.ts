/**
 * Tiled 맵(.tmj) 파싱과 타일 질의 (ADR-001: 순수 TypeScript).
 *
 * Tiled의 전체 스펙을 지원하지 않는다. 이 게임이 실제로 쓰는 것만 받아들이고
 * 나머지는 명시적으로 거부한다 — 무한 맵, 등각/육각 투영, 오브젝트 레이어 등.
 * 조용히 무시하면 나중에 "왜 안 그려지지"를 디버깅하게 되고, 그건 루프가 가장 못하는 일이다.
 *
 * 렌더링은 여기 없다. 이 모듈은 "무엇이 어디에 있는가"만 답한다.
 */

/** 충돌 판정에 쓰이는 레이어 이름. 0이 아니면 막힌 칸이다. */
export const COLLISION_LAYER = 'collision';

export interface TileLayer {
  name: string;
  width: number;
  height: number;
  /** 행 우선(row-major) 배열. 길이는 width * height. 0은 빈 칸. */
  data: readonly number[];
}

export type MapProperty = string | number | boolean;

/**
 * 맵이 참조하는 타일셋.
 *
 * `assetKey` 는 **파일 경로가 아니라 `assets/index.json` 의 키다** (ADR-006).
 * Tiled 는 보통 여기에 이미지 상대 경로를 쓰지만, 그러면 색인을 우회하게 되고
 * 에셋이 옮겨질 때 맵이 조용히 깨진다. 맵에는 이름만 두고 해석은 색인이 한다.
 */
export interface TilesetRef {
  /** 이 타일셋의 첫 gid. Tiled 규약상 1부터 시작한다 (0은 빈 칸). */
  firstGid: number;
  assetKey: string;
  columns: number;
  tileCount: number;
}

export interface TileMap {
  /** 타일 단위 크기 */
  width: number;
  height: number;
  /** 픽셀 단위 타일 크기 */
  tileWidth: number;
  tileHeight: number;
  tilesets: readonly TilesetRef[];
  layers: readonly TileLayer[];
  properties: Readonly<Record<string, MapProperty>>;
}

export class TileMapError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`타일맵이 유효하지 않습니다 (${problems.length}건):\n- ${problems.join('\n- ')}`);
    this.name = 'TileMapError';
    this.problems = problems;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function parseProperties(raw: unknown, problems: string[]): Record<string, MapProperty> {
  if (raw === undefined) return {};
  if (!Array.isArray(raw)) {
    problems.push('properties 는 배열이어야 합니다.');
    return {};
  }

  const result: Record<string, MapProperty> = {};
  raw.forEach((property, position) => {
    if (!isRecord(property)) {
      problems.push(`properties[${position}]: 객체여야 합니다.`);
      return;
    }
    const name = property['name'];
    const value = property['value'];
    if (typeof name !== 'string' || name.length === 0) {
      problems.push(`properties[${position}]: name 이 비어 있습니다.`);
      return;
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      problems.push(`properties[${position}] "${name}": value 는 string|number|boolean 이어야 합니다.`);
      return;
    }
    result[name] = value;
  });
  return result;
}

function parseTilesets(raw: unknown, problems: string[]): TilesetRef[] {
  if (!Array.isArray(raw)) {
    problems.push('tilesets 는 배열이어야 합니다.');
    return [];
  }
  if (raw.length === 0) {
    problems.push('tilesets 가 비어 있습니다. 어떤 타일도 그릴 수 없습니다.');
    return [];
  }

  const tilesets: TilesetRef[] = [];
  let previousFirstGid = 0;

  raw.forEach((entry, position) => {
    const where = `tilesets[${position}]`;

    if (!isRecord(entry)) {
      problems.push(`${where}: 객체여야 합니다.`);
      return;
    }

    if (entry['source'] !== undefined) {
      problems.push(
        `${where}: 외부 타일셋(.tsx) 참조는 지원하지 않습니다. Tiled에서 "Embed tileset"으로 내보내세요.`,
      );
      return;
    }

    const firstGid = entry['firstgid'];
    const assetKey = entry['name'];
    const columns = entry['columns'];
    const tileCount = entry['tilecount'];
    let valid = true;

    if (!isPositiveInt(firstGid)) {
      problems.push(`${where}: firstgid 는 양의 정수여야 합니다 (받은 값: ${String(firstGid)}).`);
      valid = false;
    } else if (firstGid <= previousFirstGid) {
      problems.push(`${where}: firstgid 는 앞선 타일셋보다 커야 합니다 (${previousFirstGid} 다음에 ${firstGid}).`);
      valid = false;
    }

    if (typeof assetKey !== 'string' || assetKey.trim().length === 0) {
      problems.push(`${where}: name 이 비어 있습니다. name 은 assets/index.json 의 키입니다 (ADR-006).`);
      valid = false;
    }
    if (!isPositiveInt(columns)) {
      problems.push(`${where}: columns 는 양의 정수여야 합니다.`);
      valid = false;
    }
    if (!isPositiveInt(tileCount)) {
      problems.push(`${where}: tilecount 는 양의 정수여야 합니다.`);
      valid = false;
    }

    if (!valid) return;

    previousFirstGid = firstGid as number;
    tilesets.push({
      firstGid: firstGid as number,
      assetKey: assetKey as string,
      columns: columns as number,
      tileCount: tileCount as number,
    });
  });

  return tilesets;
}

function parseLayer(
  raw: unknown,
  position: number,
  mapWidth: number,
  mapHeight: number,
  problems: string[],
): TileLayer | undefined {
  const where = `layers[${position}]`;

  if (!isRecord(raw)) {
    problems.push(`${where}: 객체여야 합니다.`);
    return undefined;
  }

  // 타일 레이어만 다룬다. 오브젝트 레이어는 지원 대상이 아니다 (필요해지면 그때 확장한다).
  if (raw['type'] !== 'tilelayer') {
    problems.push(`${where}: type 은 "tilelayer" 여야 합니다 (받은 값: ${String(raw['type'])}).`);
    return undefined;
  }

  const name = raw['name'];
  if (typeof name !== 'string' || name.trim().length === 0) {
    problems.push(`${where}: name 이 비어 있습니다.`);
    return undefined;
  }

  if (raw['width'] !== mapWidth || raw['height'] !== mapHeight) {
    problems.push(
      `${where} "${name}": 레이어 크기(${String(raw['width'])}x${String(raw['height'])})가 ` +
        `맵 크기(${mapWidth}x${mapHeight})와 다릅니다.`,
    );
    return undefined;
  }

  const data = raw['data'];
  if (!Array.isArray(data)) {
    // 압축된 data(base64/zlib)는 문자열로 온다. 지원하지 않으므로 여기서 걸린다.
    problems.push(`${where} "${name}": data 는 배열이어야 합니다. Tiled에서 CSV 형식으로 내보내세요.`);
    return undefined;
  }

  const expected = mapWidth * mapHeight;
  if (data.length !== expected) {
    problems.push(`${where} "${name}": data 길이가 ${data.length} 입니다. ${expected} 여야 합니다.`);
    return undefined;
  }

  const badTile = data.findIndex(
    (gid) => typeof gid !== 'number' || !Number.isInteger(gid) || gid < 0,
  );
  if (badTile !== -1) {
    problems.push(`${where} "${name}": data[${badTile}] 가 음이 아닌 정수가 아닙니다.`);
    return undefined;
  }

  return { name, width: mapWidth, height: mapHeight, data: data as number[] };
}

/** Tiled JSON을 검증해 `TileMap` 으로 만든다. 문제는 전부 모아서 한 번에 던진다. */
export function parseTiledMap(raw: unknown): TileMap {
  const problems: string[] = [];

  if (!isRecord(raw)) {
    throw new TileMapError(['맵 최상위는 객체여야 합니다.']);
  }

  if (raw['type'] !== 'map') {
    problems.push(`type 은 "map" 이어야 합니다 (받은 값: ${String(raw['type'])}).`);
  }
  if (raw['orientation'] !== 'orthogonal') {
    problems.push(`orientation 은 "orthogonal" 만 지원합니다 (받은 값: ${String(raw['orientation'])}).`);
  }
  if (raw['infinite'] === true) {
    problems.push('무한 맵은 지원하지 않습니다. Tiled에서 infinite 를 끄세요.');
  }

  const width = raw['width'];
  const height = raw['height'];
  const tileWidth = raw['tilewidth'];
  const tileHeight = raw['tileheight'];

  for (const [key, value] of [
    ['width', width],
    ['height', height],
    ['tilewidth', tileWidth],
    ['tileheight', tileHeight],
  ] as const) {
    if (!isPositiveInt(value)) {
      problems.push(`${key} 는 양의 정수여야 합니다 (받은 값: ${String(value)}).`);
    }
  }

  if (problems.length > 0) {
    throw new TileMapError(problems);
  }

  const layersRaw = raw['layers'];
  if (!Array.isArray(layersRaw)) {
    throw new TileMapError(['layers 는 배열이어야 합니다.']);
  }

  const layers = layersRaw
    .map((layer, position) =>
      parseLayer(layer, position, width as number, height as number, problems),
    )
    .filter((layer): layer is TileLayer => layer !== undefined);

  if (layers.length === 0) {
    problems.push('타일 레이어가 하나도 없습니다.');
  }
  if (!layers.some((layer) => layer.name === COLLISION_LAYER)) {
    problems.push(
      `"${COLLISION_LAYER}" 레이어가 없습니다. 이동 판정이 불가능하므로 필수입니다.`,
    );
  }

  const tilesets = parseTilesets(raw['tilesets'], problems);
  const properties = parseProperties(raw['properties'], problems);

  // 모든 gid 가 어느 타일셋의 범위에 드는지 확인한다.
  // 이걸 안 하면 맵을 손으로 고치다 범위를 벗어난 순간 화면에 구멍이 뚫리는데,
  // 그 원인을 런타임에서 역추적하는 건 루프가 가장 못하는 일이다.
  if (tilesets.length > 0) {
    const outOfRange = new Set<number>();
    for (const layer of layers) {
      for (const gid of layer.data) {
        if (gid !== 0 && findTilesetForGid(tilesets, gid) === undefined) outOfRange.add(gid);
      }
    }
    if (outOfRange.size > 0) {
      const last = tilesets[tilesets.length - 1] as TilesetRef;
      problems.push(
        `어떤 타일셋에도 속하지 않는 gid: ${[...outOfRange].sort((a, b) => a - b).join(', ')}. ` +
          `유효 범위는 1 ~ ${last.firstGid + last.tileCount - 1} 입니다.`,
      );
    }
  }

  if (problems.length > 0) {
    throw new TileMapError(problems);
  }

  return {
    width: width as number,
    height: height as number,
    tileWidth: tileWidth as number,
    tileHeight: tileHeight as number,
    tilesets,
    layers,
    properties,
  };
}

function findTilesetForGid(
  tilesets: readonly TilesetRef[],
  gid: number,
): TilesetRef | undefined {
  return tilesets.find(
    (tileset) => gid >= tileset.firstGid && gid < tileset.firstGid + tileset.tileCount,
  );
}

/** 이 gid 를 담당하는 타일셋. 빈 칸(0)이거나 범위 밖이면 undefined. */
export function tilesetForGid(map: TileMap, gid: number): TilesetRef | undefined {
  if (gid === 0) return undefined;
  return findTilesetForGid(map.tilesets, gid);
}

/** gid 를 해당 타일셋 안의 프레임 번호(0부터)로 바꾼다. */
export function localTileIndex(tileset: TilesetRef, gid: number): number {
  return gid - tileset.firstGid;
}

export function findLayer(map: TileMap, name: string): TileLayer | undefined {
  return map.layers.find((layer) => layer.name === name);
}

/** 없으면 던진다. 레이어 이름 오타를 빈 화면으로 만나는 것보다 즉시 터지는 편이 싸다. */
export function requireLayer(map: TileMap, name: string): TileLayer {
  const layer = findLayer(map, name);
  if (layer === undefined) {
    throw new Error(
      `레이어 "${name}" 가 없습니다. 존재하는 레이어: ${map.layers.map((l) => l.name).join(', ')}`,
    );
  }
  return layer;
}

/** 범위 밖은 0(빈 칸)으로 본다. */
export function tileAt(layer: TileLayer, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= layer.width || y >= layer.height) return 0;
  return layer.data[y * layer.width + x] ?? 0;
}

export function isInBounds(map: TileMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

/**
 * 그 칸이 막혔는가.
 * **맵 밖은 막힌 것으로 본다** — 경계 검사를 호출부마다 반복하면 언젠가 하나를 빠뜨린다.
 */
export function isSolid(map: TileMap, x: number, y: number): boolean {
  if (!isInBounds(map, x, y)) return true;
  return tileAt(requireLayer(map, COLLISION_LAYER), x, y) !== 0;
}
