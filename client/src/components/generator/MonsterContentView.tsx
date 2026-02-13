/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React, { type FC } from 'react';

interface MonsterData {
  name?: string;
  description?: string;
  size?: string;
  creature_type?: string;
  subtype?: string;
  alignment?: string;
  challenge_rating?: string;
  experience_points?: number;
  location?: string;
  ability_scores?: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  armor_class?: number | Array<{ value: number; type?: string; notes?: string }>;
  hit_points?: number | { average: number; formula: string };
  hit_dice?: string;
  proficiency_bonus?: number | string;
  speed?: {
    walk?: string;
    fly?: string;
    swim?: string;
    climb?: string;
    burrow?: string;
    hover?: boolean;
  };
  saving_throws?: Array<{ name: string; value: string; notes?: string }>;
  skill_proficiencies?: Array<{ name: string; value: string; notes?: string }>;
  damage_vulnerabilities?: string[];
  damage_resistances?: string[];
  damage_immunities?: string[];
  condition_immunities?: string[];
  senses?: string[];
  languages?: string[];
  abilities?: Array<{ name: string; description?: string; uses?: string; recharge?: string; notes?: string }>;
  actions?: Array<{ name: string; description?: string; uses?: string; recharge?: string; notes?: string }>;
  bonus_actions?: Array<{ name: string; description?: string; uses?: string; recharge?: string; notes?: string }>;
  reactions?: Array<{ name: string; description?: string; uses?: string; recharge?: string; notes?: string }>;
  legendary_actions?: {
    description?: string;
    actions?: Array<{ name: string; description?: string; cost?: number; notes?: string }>;
  };
  mythic_actions?: {
    description?: string;
    actions?: Array<{ name: string; description?: string; cost?: number; notes?: string }>;
  };
  lair_actions?: string[];
  regional_effects?: string[];
  tactics?: string;
  ecology?: string;
  lore?: string;
  sources?: string[];
  notes?: string[];
}

interface MonsterContentViewProps {
  monster: MonsterData;
}

const Section: FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className = ''
}) => {
  if (children === null || children === undefined) return null;
  if (typeof children === 'string' && !children.trim()) return null;

  return (
    <section className={`mb-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-2 border-b-2 border-red-700 pb-1">{title}</h3>
      <div className="space-y-2 text-sm text-gray-800">{children}</div>
    </section>
  );
};

const StatBlock: FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="flex items-baseline gap-2">
    <span className="font-semibold text-gray-700">{label}:</span>
    <span className="text-gray-900">{value}</span>
  </div>
);

const AbilityScoreDisplay: FC<{ scores?: MonsterData['ability_scores'] }> = ({ scores }) => {
  if (!scores) return null;

  const calcModifier = (score: number): string => {
    const mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  return (
    <div className="grid grid-cols-6 gap-4 p-3 bg-gray-50 rounded border border-gray-300">
      {Object.entries(scores).map(([ability, score]) => (
        <div key={ability} className="text-center">
          <div className="text-xs font-semibold text-gray-600 uppercase">{ability}</div>
          <div className="text-lg font-bold text-gray-900">{score}</div>
          <div className="text-sm text-gray-600">({calcModifier(score)})</div>
        </div>
      ))}
    </div>
  );
};

const FeatureList: FC<{
  features?: Array<{ name: string; description?: string; uses?: string; recharge?: string; notes?: string }>;
  emptyMessage?: string;
}> = ({ features, emptyMessage = 'None' }) => {
  if (!features || features.length === 0) {
    return <p className="text-sm text-gray-500 italic">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {features.map((feature, index) => (
        <div key={`${feature.name}-${index}`} className="pl-2">
          <div className="font-semibold text-gray-900">
            {feature.name}
            {feature.uses && <span className="text-gray-600 font-normal"> ({feature.uses})</span>}
            {feature.recharge && <span className="text-gray-600 font-normal"> (Recharge {feature.recharge})</span>}
          </div>
          {feature.description && <p className="text-sm text-gray-700 mt-1">{feature.description}</p>}
          {feature.notes && <p className="text-xs text-gray-500 mt-1 italic">{feature.notes}</p>}
        </div>
      ))}
    </div>
  );
};

const formatArmorClass = (ac?: number | Array<{ value: number; type?: string; notes?: string }>): string => {
  if (!ac) return 'Not specified';
  if (typeof ac === 'number') return `${ac}`;
  if (Array.isArray(ac) && ac.length > 0) {
    return ac.map(entry => {
      let str = `${entry.value}`;
      if (entry.type) str += ` (${entry.type})`;
      if (entry.notes) str += ` - ${entry.notes}`;
      return str;
    }).join(', ');
  }
  return 'Not specified';
};

const formatHitPoints = (hp?: number | { average: number; formula: string }): string => {
  if (!hp) return 'Not specified';
  if (typeof hp === 'number') return `${hp}`;
  if (typeof hp === 'object' && 'average' in hp) {
    return `${hp.average}${hp.formula ? ` (${hp.formula})` : ''}`;
  }
  return 'Not specified';
};

const formatSpeed = (speed?: MonsterData['speed']): string => {
  if (!speed) return 'Not specified';

  const parts: string[] = [];
  if (speed.walk) parts.push(`walk ${speed.walk}`);
  if (speed.fly) parts.push(`fly ${speed.fly}${speed.hover ? ' (hover)' : ''}`);
  if (speed.swim) parts.push(`swim ${speed.swim}`);
  if (speed.climb) parts.push(`climb ${speed.climb}`);
  if (speed.burrow) parts.push(`burrow ${speed.burrow}`);

  return parts.length > 0 ? parts.join(', ') : 'Not specified';
};

const MonsterContentView: FC<MonsterContentViewProps> = ({ monster }) => {
  return (
    <div className="max-w-4xl mx-auto p-6 bg-white">
      {/* Header */}
      <div className="mb-6 pb-4 border-b-4 border-red-700">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {monster.name || 'Unnamed Creature'}
        </h1>
        <p className="text-lg italic text-gray-700">
          {monster.size && `${monster.size} `}
          {monster.creature_type}
          {monster.subtype && ` (${monster.subtype})`}
          {monster.alignment && `, ${monster.alignment}`}
        </p>
      </div>

      {/* Description */}
      {monster.description && (
        <Section title="Description">
          <p className="text-sm text-gray-800 leading-relaxed">{monster.description}</p>
        </Section>
      )}

      {/* Core Stats */}
      <div className="mb-6 p-4 bg-amber-50 rounded-lg border-2 border-amber-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatBlock label="Armor Class" value={formatArmorClass(monster.armor_class)} />
          <StatBlock label="Hit Points" value={formatHitPoints(monster.hit_points)} />
          <StatBlock label="Speed" value={formatSpeed(monster.speed)} />
          <StatBlock label="Challenge Rating" value={monster.challenge_rating || 'Not specified'} />
          {monster.experience_points && (
            <StatBlock label="Experience Points" value={monster.experience_points} />
          )}
          {monster.proficiency_bonus && (
            <StatBlock label="Proficiency Bonus" value={monster.proficiency_bonus} />
          )}
        </div>
      </div>

      {/* Ability Scores */}
      <Section title="Ability Scores">
        <AbilityScoreDisplay scores={monster.ability_scores} />
      </Section>

      {/* Saving Throws & Skills */}
      {(monster.saving_throws && monster.saving_throws.length > 0) && (
        <Section title="Saving Throws">
          <p className="text-sm text-gray-800">
            {monster.saving_throws
              .filter(st => st && st.name && st.value)
              .map(st => `${st.name} ${st.value}`)
              .join(', ')}
          </p>
        </Section>
      )}

      {(monster.skill_proficiencies && monster.skill_proficiencies.length > 0) && (
        <Section title="Skills">
          <p className="text-sm text-gray-800">
            {monster.skill_proficiencies
              .filter(sk => sk && sk.name && sk.value)
              .map(sk => `${sk.name} ${sk.value}`)
              .join(', ')}
          </p>
        </Section>
      )}

      {/* Defenses */}
      {(monster.damage_vulnerabilities && monster.damage_vulnerabilities.length > 0) && (
        <Section title="Damage Vulnerabilities">
          <p className="text-sm text-gray-800">{monster.damage_vulnerabilities.join(', ')}</p>
        </Section>
      )}

      {(monster.damage_resistances && monster.damage_resistances.length > 0) && (
        <Section title="Damage Resistances">
          <p className="text-sm text-gray-800">{monster.damage_resistances.join(', ')}</p>
        </Section>
      )}

      {(monster.damage_immunities && monster.damage_immunities.length > 0) && (
        <Section title="Damage Immunities">
          <p className="text-sm text-gray-800">{monster.damage_immunities.join(', ')}</p>
        </Section>
      )}

      {(monster.condition_immunities && monster.condition_immunities.length > 0) && (
        <Section title="Condition Immunities">
          <p className="text-sm text-gray-800">{monster.condition_immunities.join(', ')}</p>
        </Section>
      )}

      {/* Senses & Languages */}
      {(monster.senses && monster.senses.length > 0) && (
        <Section title="Senses">
          <p className="text-sm text-gray-800">{monster.senses.join(', ')}</p>
        </Section>
      )}

      {(monster.languages && monster.languages.length > 0) && (
        <Section title="Languages">
          <p className="text-sm text-gray-800">{monster.languages.join(', ')}</p>
        </Section>
      )}

      {/* Location */}
      {monster.location && (
        <Section title="Typical Habitat">
          <p className="text-sm text-gray-800">{monster.location}</p>
        </Section>
      )}

      {/* Abilities */}
      {(monster.abilities && monster.abilities.length > 0) && (
        <Section title="Abilities" className="bg-blue-50 p-4 rounded">
          <FeatureList features={monster.abilities} emptyMessage="No special abilities" />
        </Section>
      )}

      {/* Actions */}
      {(monster.actions && monster.actions.length > 0) && (
        <Section title="Actions" className="bg-green-50 p-4 rounded">
          <FeatureList features={monster.actions} emptyMessage="No actions defined" />
        </Section>
      )}

      {/* Bonus Actions */}
      {(monster.bonus_actions && monster.bonus_actions.length > 0) && (
        <Section title="Bonus Actions" className="bg-yellow-50 p-4 rounded">
          <FeatureList features={monster.bonus_actions} emptyMessage="No bonus actions" />
        </Section>
      )}

      {/* Reactions */}
      {(monster.reactions && monster.reactions.length > 0) && (
        <Section title="Reactions" className="bg-purple-50 p-4 rounded">
          <FeatureList features={monster.reactions} emptyMessage="No reactions" />
        </Section>
      )}

      {/* Legendary Actions */}
      {monster.legendary_actions && monster.legendary_actions.actions && monster.legendary_actions.actions.length > 0 && (
        <Section title="Legendary Actions" className="bg-red-50 p-4 rounded border-2 border-red-300">
          {monster.legendary_actions.description && (
            <p className="text-sm text-gray-700 mb-3 italic">{monster.legendary_actions.description}</p>
          )}
          <div className="space-y-3">
            {monster.legendary_actions.actions.map((action, index) => (
              <div key={`${action.name}-${index}`} className="pl-2">
                <div className="font-semibold text-gray-900">
                  {action.name}
                  {action.cost && action.cost > 1 && <span className="text-gray-600 font-normal"> (Costs {action.cost} Actions)</span>}
                </div>
                {action.description && <p className="text-sm text-gray-700 mt-1">{action.description}</p>}
                {action.notes && <p className="text-xs text-gray-500 mt-1 italic">{action.notes}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Mythic Actions */}
      {monster.mythic_actions && monster.mythic_actions.actions && monster.mythic_actions.actions.length > 0 && (
        <Section title="Mythic Actions" className="bg-orange-50 p-4 rounded border-2 border-orange-300">
          {monster.mythic_actions.description && (
            <p className="text-sm text-gray-700 mb-3 italic">{monster.mythic_actions.description}</p>
          )}
          <div className="space-y-3">
            {monster.mythic_actions.actions.map((action, index) => (
              <div key={`${action.name}-${index}`} className="pl-2">
                <div className="font-semibold text-gray-900">
                  {action.name}
                  {action.cost && action.cost > 1 && <span className="text-gray-600 font-normal"> (Costs {action.cost} Actions)</span>}
                </div>
                {action.description && <p className="text-sm text-gray-700 mt-1">{action.description}</p>}
                {action.notes && <p className="text-xs text-gray-500 mt-1 italic">{action.notes}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Lair Actions */}
      {(monster.lair_actions && monster.lair_actions.length > 0) && (
        <Section title="Lair Actions" className="bg-indigo-50 p-4 rounded">
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
            {monster.lair_actions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Regional Effects */}
      {(monster.regional_effects && monster.regional_effects.length > 0) && (
        <Section title="Regional Effects" className="bg-teal-50 p-4 rounded">
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
            {monster.regional_effects.map((effect, index) => (
              <li key={index}>{effect}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Tactics */}
      {monster.tactics && (
        <Section title="Combat Tactics">
          <p className="text-sm text-gray-800 leading-relaxed">{monster.tactics}</p>
        </Section>
      )}

      {/* Ecology */}
      {monster.ecology && (
        <Section title="Ecology">
          <p className="text-sm text-gray-800 leading-relaxed">{monster.ecology}</p>
        </Section>
      )}

      {/* Lore */}
      {monster.lore && (
        <Section title="Lore">
          <p className="text-sm text-gray-800 leading-relaxed">{monster.lore}</p>
        </Section>
      )}

      {/* Sources & Notes */}
      {(monster.sources && monster.sources.length > 0) && (
        <Section title="Sources">
          <p className="text-xs text-gray-600 italic">{monster.sources.join(', ')}</p>
        </Section>
      )}

      {(monster.notes && monster.notes.length > 0) && (
        <Section title="Notes">
          <ul className="list-disc list-inside space-y-1 text-xs text-gray-600">
            {monster.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};

export default MonsterContentView;
