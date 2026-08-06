import type { AiProfile } from '../core/battle/ai.js';
import type { ActorId, BattleActor } from '../core/battle/index.js';
import type { Occupant } from '../core/world/interaction.js';
import { aiProfile } from './ai.js';
import type { MapId } from './maps.js';
import { BOSS_MULTIPLIERS, MOB_CURVES, makeCombatant, statsAtLevel } from './progression.js';

/**
 * 보스 (GDD §8 — 1종, 2페이즈, 유물 드랍. T-051).
 *
 * **조우가 아니라 자리에 놓인 것이다.** 잡몹은 걷다 보면 튀어나오지만 보스는 거기 서서
 * 기다린다 — 성소가 안전지대인 것도 그래서다. 들어선 순간 습격당하면 문을 연 것이
 * 보상이 아니라 함정이 된다.
 *
 * **한 번만 이긴다.** 다시 잡을 수 있으면 유물을 무한히 얻고, 그건 회수 지점에서 이미
 * 막아둔 구멍이다 (GDD §6.1). 처치 여부를 따로 저장하지 않고 **드랍 유물을 지녔는지로
 * 판정한다** — 유물을 잃는 기제가 없으므로 둘은 같은 뜻이고, 상태를 하나로 두면
 * 둘이 어긋날 일도 없다.
 */
export interface BossPlacement extends Occupant {
  readonly tile: number;
  readonly name: string;
  /** 적 레벨. 그 층의 잡몹보다 높다 — 보스는 층의 끝이다. */
  readonly level: number;
  readonly ai: string;
  /** 이기면 얻는 유물. 이것을 지녔는지가 곧 "이미 잡았는가" 다. */
  readonly dropRelicId: string;
  readonly intro: readonly string[];
  /** 이미 잡은 뒤에 말을 걸면. */
  readonly afterwards: readonly string[];
}

export const BOSSES_BY_MAP: Readonly<Partial<Record<MapId, readonly BossPlacement[]>>> = {
  'ruin-sanctum': [
    {
      id: 'sanctum-warden',
      position: { x: 34, y: 8 },
      // 흰 잔재. 각인 잔재(108, 초록)와 같은 계열이되 색이 달라 "격이 다른 것" 으로 읽힌다.
      tile: 121,
      name: '문을 지키던 것',
      // 2층 잡몹(Lv10)보다 넷 위. 층의 끝이라는 것이 숫자로도 드러나야 한다.
      level: 14,
      ai: 'warden',
      dropRelicId: 'severed-crest',
      intro: [
        '문이 열린 자리에 그것이 서 있었다.',
        '지키라는 명령만 남고, 지킬 것은 이미 사라진 뒤였다.',
      ],
      afterwards: ['부서진 자리에 아직 온기가 남아 있다.'],
    },
  ],
};

export function bossesForMap(mapId: MapId): readonly BossPlacement[] {
  return BOSSES_BY_MAP[mapId] ?? [];
}

/**
 * 보스전 편성.
 *
 * 배수는 `BOSS_MULTIPLIERS` 를 그대로 쓴다 — 밸런스 불변식(전투 길이 12~25라운드)이
 * 재는 것과 실제 보스가 같은 값이어야 한다. 여기서 따로 곱하면 측정과 게임이 갈라진다.
 */
export function bossActor(boss: BossPlacement): BattleActor {
  return makeCombatant(boss.id, 'enemy', statsAtLevel(MOB_CURVES, boss.level, BOSS_MULTIPLIERS), {
    name: boss.name,
    // 불에 약하다. 잿불 계열을 모아둔 편성이 여기서 값을 한다.
    affinity: { fire: 0.75 },
  });
}

export function bossProfiles(
  actors: readonly BattleActor[],
  boss: BossPlacement,
): Readonly<Record<ActorId, AiProfile>> {
  const profiles: Record<ActorId, AiProfile> = {};
  for (const actor of actors) {
    profiles[actor.id] = actor.side === 'party' ? aiProfile('striker') : aiProfile(boss.ai);
  }
  return profiles;
}
