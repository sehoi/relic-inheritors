import type { AiProfile } from '../core/battle/ai.js';
import type { ActorId, BattleActor } from '../core/battle/index.js';
import type { Inventory } from '../core/battle/item.js';
import type { Skill } from '../core/battle/skill.js';
import { aiProfile } from './ai.js';
import { MOB_CURVES, PARTY_CURVES, makeCombatant, statsAtLevel } from './progression.js';
import { skill } from './skills.js';

/**
 * 전투 편성.
 *
 * 고유명사는 확정 전까지 쓰지 않는다 (GDD §10). 여기 이름들은 **역할을 가리키는 보통명사**다 —
 * 계승자의 진짜 이름은 세계관이 정해질 때 붙는다.
 *
 * 능력은 캐릭터가 아니라 유물에서 와야 하지만(ADR-004) 유물은 M3 다.
 * 그때까지는 스킬을 직접 들려준다 — **이 배선은 M3 에서 유물 슬롯으로 교체된다.**
 */

export interface Encounter {
  readonly actors: readonly BattleActor[];
  readonly profiles: Readonly<Record<ActorId, AiProfile>>;
  /** 파티원이 쓸 수 있는 스킬. M3 에서 장착 유물이 이 자리를 대신한다. */
  readonly partySkills: Readonly<Record<ActorId, readonly Skill[]>>;
  readonly inventory: Inventory;
}

export function starterParty(level: number): BattleActor[] {
  const stats = statsAtLevel(PARTY_CURVES, level);
  return [
    makeCombatant('vanguard', 'party', stats, { name: '전위' }),
    makeCombatant('caster', 'party', { ...stats, mag: Math.round(stats.mag * 1.3) }, {
      name: '술사',
    }),
  ];
}

const MOB_TEMPLATES = {
  remnant: { name: '각인 잔재', tile: 108, affinity: { thunder: 1.5, earth: 0.5 } },
  warden: { name: '무너진 파수꾼', tile: 122, affinity: { fire: 1.4 } },
} as const;

export type MobKind = keyof typeof MOB_TEMPLATES;

export function ruinMob(kind: MobKind, index: number, level: number): BattleActor {
  const template = MOB_TEMPLATES[kind];
  return makeCombatant(`${kind}-${index}`, 'enemy', statsAtLevel(MOB_CURVES, level), {
    name: template.name,
    affinity: template.affinity,
  });
}

/** 적 스프라이트의 타일 번호. 화면 표현이라 데이터에 함께 둔다. */
export function mobTile(actorId: ActorId): number {
  const kind = actorId.split('-')[0] as MobKind;
  return MOB_TEMPLATES[kind]?.tile ?? 108;
}

/** 유적 입구의 표준 조우. T-021 에서 인카운터 테이블이 이걸 고른다. */
export function ruinEncounter(level: number, mobCount = 2): Encounter {
  const party = starterParty(level);
  const mobs = Array.from({ length: mobCount }, (_, i) =>
    ruinMob(i % 2 === 0 ? 'remnant' : 'warden', i + 1, level),
  );

  const actors = [...party, ...mobs];
  const profiles: Record<ActorId, AiProfile> = {};
  for (const actor of actors) {
    // 파티는 사람이 조작하지만, 프로필을 채워두면 시뮬레이터와 자동 진행이 같은 편성을 쓴다.
    profiles[actor.id] = actor.side === 'party' ? aiProfile('striker') : aiProfile('brute');
  }

  return {
    actors,
    profiles,
    partySkills: {
      vanguard: [skill('stone-fist')],
      caster: [skill('ember-lash'), skill('sundering-arc')],
    },
    inventory: { herb: 3, antidote: 1, 'cleansing-stone': 1, 'ashen-ember': 1 },
  };
}
