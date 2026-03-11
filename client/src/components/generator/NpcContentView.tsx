/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React, { type FC } from 'react';
import {
  AbilityScores,
  Feature,
  NamedEntry,
  NormalizedNpc,
  Relationship,
  ScoredEntry,
  SpellcastingSummary,
  formatArmorClass,
  formatHitPoints,
} from './npcUtils';

interface NpcContentViewProps {
  npc: NormalizedNpc;
}

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  if (children === null || children === undefined) return null;
  if (typeof children === 'string' && !children.trim()) return null;

  return (
    <section className="mb-6">
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
      <div className="space-y-2 text-sm text-gray-800">{children}</div>
    </section>
  );
};

const renderList = (items: string[], empty = 'None provided.') => {
  if (!items.length) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <ul className="list-inside list-disc space-y-1 text-sm text-gray-800">
      {items.map((item, index) => (
        <li key={item + '-' + index}>{item}</li>
      ))}
    </ul>
  );
};

const renderFeatures = (features: Feature[]) => {
  if (!features.length) return <p className="text-sm text-gray-500">No entries.</p>;
  return (
    <ul className="list-inside list-disc space-y-2 text-sm text-gray-800">
      {features.map((feature, index) => (
        <li key={feature.name + '-' + index}>
          <span className="font-medium">{feature.name}</span>
          {feature.description && <span>: {feature.description}</span>}
          {feature.notes && <span className="block text-gray-600">Notes: {feature.notes}</span>}
        </li>
      ))}
    </ul>
  );
};

const renderScoredEntries = (entries: ScoredEntry[]) => {
  if (!entries.length) return <p className="text-sm text-gray-500">No entries.</p>;
  return (
    <ul className="list-inside list-disc space-y-1 text-sm text-gray-800">
      {entries.map((entry, index) => (
        <li key={entry.name + '-' + index}>
          <span className="font-medium">{entry.name}:</span> {entry.value}
          {entry.notes && <span className="text-gray-600"> ({entry.notes})</span>}
        </li>
      ))}
    </ul>
  );
};

const renderRelationships = (relationships: Relationship[]) => {
  if (!relationships.length) return <p className="text-sm text-gray-500">No relationships provided.</p>;
  return (
    <ul className="list-inside list-disc space-y-1 text-sm text-gray-800">
      {relationships.map((relationship, index) => (
        <li key={(relationship.entity ?? 'relationship') + '-' + index}>
          <span className="font-medium">{relationship.entity || 'Unknown entity'}</span>
          {relationship.relationship && <span>: {relationship.relationship}</span>}
          {relationship.notes && <span className="text-gray-600"> ({relationship.notes})</span>}
        </li>
      ))}
    </ul>
  );
};

const renderNamedEntries = (entries: NamedEntry[], empty = 'No entries provided.') => {
  if (!entries.length) return <p className="text-sm text-gray-500">{empty}</p>;

  return (
    <ul className="list-inside list-disc space-y-2 text-sm text-gray-800">
      {entries.map((entry, index) => {
        const details: string[] = [];

        if (entry.quantity !== undefined) details.push('Qty ' + String(entry.quantity));
        if (typeof entry.relationship === 'string' && entry.relationship.trim()) details.push(entry.relationship);
        if (typeof entry.role === 'string' && entry.role.trim()) details.push('Role: ' + entry.role);
        if (typeof entry.standing === 'string' && entry.standing.trim()) details.push('Standing: ' + entry.standing);
        if (typeof entry.status === 'string' && entry.status.trim()) details.push('Status: ' + entry.status);
        if (typeof entry.profession === 'string' && entry.profession.trim()) details.push('Profession: ' + entry.profession);
        if (typeof entry.location === 'string' && entry.location.trim()) details.push('Location: ' + entry.location);

        return (
          <li key={entry.name + '-' + index}>
            <span className="font-medium">{entry.name}</span>
            {details.length > 0 && <span>: {details.join(' | ')}</span>}
            {typeof entry.notes === 'string' && entry.notes.trim() && (
              <span className="block text-gray-600">Notes: {entry.notes}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
};

const renderRecordEntries = (record: Record<string, unknown>, empty = 'No details provided.') => {
  const entries = Object.entries(record).filter(([, value]) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
  });

  if (!entries.length) return <p className="text-sm text-gray-500">{empty}</p>;

  return (
    <ul className="list-inside list-disc space-y-1 text-sm text-gray-800">
      {entries.map(([key, value]) => (
        <li key={key}>
          <span className="font-medium">{key.replace(/_/g, ' ')}:</span>{' '}
          {Array.isArray(value) ? value.join(', ') : String(value)}
        </li>
      ))}
    </ul>
  );
};

const renderSpellMap = (map: Record<string, string[]>, empty = 'No spells listed.') => {
  const entries = Object.entries(map).filter(([, spells]) => Array.isArray(spells) && spells.length > 0);
  if (!entries.length) return <p className="text-sm text-gray-500">{empty}</p>;

  return (
    <div className="space-y-2 text-sm text-gray-800">
      {entries.map(([label, spells]) => (
        <div key={label}>
          <p className="font-medium">{label}</p>
          <p>{spells.join(', ')}</p>
        </div>
      ))}
    </div>
  );
};

const AbilityScoresGrid: FC<{ scores: AbilityScores }> = ({ scores }) => (
  <div className="grid grid-cols-3 gap-2 text-sm text-gray-800">
    {(Object.entries(scores) as Array<[string, number]>).map(([ability, score]) => (
      <div key={ability} className="rounded-md border border-gray-200 px-3 py-2 text-center">
        <p className="text-xs font-semibold uppercase text-gray-500">{ability}</p>
        <p className="text-base font-bold text-gray-900">{score}</p>
      </div>
    ))}
  </div>
);

const SpellcastingSection: FC<{ spellcasting?: SpellcastingSummary }> = ({ spellcasting }) => {
  if (!spellcasting) return null;

  return (
    <Section title="Spellcasting">
      <div className="space-y-2">
        {spellcasting.type && (
          <p>
            <span className="font-medium">Type:</span> {spellcasting.type}
          </p>
        )}
        {spellcasting.ability && (
          <p>
            <span className="font-medium">Ability:</span> {spellcasting.ability}
          </p>
        )}
        {spellcasting.focus && (
          <p>
            <span className="font-medium">Focus:</span> {spellcasting.focus}
          </p>
        )}
        {spellcasting.saveDc !== undefined && (
          <p>
            <span className="font-medium">Save DC:</span> {spellcasting.saveDc}
          </p>
        )}
        {spellcasting.attackBonus !== undefined && (
          <p>
            <span className="font-medium">Attack Bonus:</span> {spellcasting.attackBonus}
          </p>
        )}
      </div>

      {spellcasting.knownSpells.length > 0 && (
        <div>
          <p className="font-medium">Known Spells</p>
          {renderList(spellcasting.knownSpells, 'No spells listed.')}
        </div>
      )}

      {Object.keys(spellcasting.preparedSpells).length > 0 && (
        <div>
          <p className="font-medium">Prepared Spells</p>
          {renderSpellMap(spellcasting.preparedSpells)}
        </div>
      )}

      {Object.keys(spellcasting.alwaysPreparedSpells).length > 0 && (
        <div>
          <p className="font-medium">Always Prepared</p>
          {renderSpellMap(spellcasting.alwaysPreparedSpells)}
        </div>
      )}

      {Object.keys(spellcasting.innateSpells).length > 0 && (
        <div>
          <p className="font-medium">Innate Spells</p>
          {renderSpellMap(spellcasting.innateSpells)}
        </div>
      )}

      {Object.keys(spellcasting.spellSlots).length > 0 && (
        <div>
          <p className="font-medium">Spell Slots</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-gray-800">
            {Object.entries(spellcasting.spellSlots)
              .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
              .map(([level, count]) => (
                <li key={level}>
                  <span className="font-medium">Level {level}:</span> {count}
                </li>
              ))}
          </ul>
        </div>
      )}

      {spellcasting.notes && <p className="text-sm text-gray-600">{spellcasting.notes}</p>}
    </Section>
  );
};

const NpcContentView: FC<NpcContentViewProps> = ({ npc }) => {
  const rawTactics = npc.tactics as unknown;
  const tacticsObject = rawTactics && typeof rawTactics === 'object' && !Array.isArray(rawTactics)
    ? rawTactics as Record<string, unknown>
    : undefined;

  return (
    <article className="space-y-6">
      <header className="border-b border-gray-200 pb-4">
        <h2 className="text-2xl font-bold text-gray-900">{npc.name}</h2>
        <div className="mt-2 space-y-1 text-sm text-gray-600">
          {npc.title && <p>Title: {npc.title}</p>}
          {npc.role && <p>Role: {npc.role}</p>}
          {npc.race && <p>Race: {npc.race}</p>}
          {npc.alignment && <p>Alignment: {npc.alignment}</p>}
          {npc.affiliation && <p>Affiliation: {npc.affiliation}</p>}
          {npc.location && <p>Location: {npc.location}</p>}
          {npc.era && <p>Era: {npc.era}</p>}
          {npc.region && <p>Region: {npc.region}</p>}
          {npc.challengeRating && <p>Challenge Rating: {npc.challengeRating}</p>}
          {npc.experiencePoints !== undefined && <p>XP: {npc.experiencePoints}</p>}
          {npc.schemaVersion && <p>Schema Version: {npc.schemaVersion}</p>}
        </div>
      </header>

      <Section title="Description">
        <p>{npc.description || 'No description provided.'}</p>
        {npc.appearance && <p className="text-sm text-gray-700">Appearance: {npc.appearance}</p>}
        {npc.background && <p className="text-sm text-gray-700">Background: {npc.background}</p>}
        {npc.aliases.length > 0 && (
          <p className="text-sm text-gray-700">Aliases: {npc.aliases.join(', ')}</p>
        )}
      </Section>

      <Section title="Personality">
        <div className="grid grid-cols-1 gap-4 text-sm text-gray-800 md:grid-cols-2">
          <div>
            <p className="font-medium">Traits</p>
            {renderList(npc.personality.traits, 'No traits provided.')}
          </div>
          <div>
            <p className="font-medium">Ideals</p>
            {renderList(npc.personality.ideals, 'No ideals provided.')}
          </div>
          <div>
            <p className="font-medium">Bonds</p>
            {renderList(npc.personality.bonds, 'No bonds provided.')}
          </div>
          <div>
            <p className="font-medium">Flaws</p>
            {renderList(npc.personality.flaws, 'No flaws provided.')}
          </div>
          <div>
            <p className="font-medium">Goals</p>
            {renderList(npc.goals, 'No goals provided.')}
          </div>
          <div>
            <p className="font-medium">Fears</p>
            {renderList(npc.fears, 'No fears provided.')}
          </div>
          <div>
            <p className="font-medium">Quirks</p>
            {renderList(npc.quirks, 'No quirks provided.')}
          </div>
          <div>
            <p className="font-medium">Voice & Mannerisms</p>
            {renderList(npc.voiceMannerisms, 'No voice details provided.')}
          </div>
        </div>
      </Section>

      <Section title="Motivations">{renderList(npc.motivations, 'No motivations provided.')}</Section>
      <Section title="Adventure Hooks">{renderList(npc.hooks, 'No hooks provided.')}</Section>

      <Section title="Core Statistics">
        <div className="grid grid-cols-1 gap-4 text-sm text-gray-800 lg:grid-cols-2">
          <div className="rounded-md border border-gray-200 p-4">
            <p className="mb-3 font-medium text-gray-900">Ability Scores</p>
            <AbilityScoresGrid scores={npc.abilityScores} />
          </div>
          <div className="space-y-2 rounded-md border border-gray-200 p-4">
            <p>
              <span className="font-medium">Armor Class:</span> {formatArmorClass(npc.armorClass)}
            </p>
            <p>
              <span className="font-medium">Hit Points:</span> {formatHitPoints(npc.hitPoints)}
            </p>
            {npc.hitDice && (
              <p>
                <span className="font-medium">Hit Dice:</span> {npc.hitDice}
              </p>
            )}
            {npc.proficiencyBonus !== undefined && (
              <p>
                <span className="font-medium">Proficiency Bonus:</span> {npc.proficiencyBonus}
              </p>
            )}
            {npc.passivePerception !== undefined && (
              <p>
                <span className="font-medium">Passive Perception:</span> {npc.passivePerception}
              </p>
            )}
            <div>
              <p className="font-medium">Speed</p>
              {renderRecordEntries(npc.speed, 'No speeds provided.')}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Class Levels">
        {!npc.classLevels.length ? (
          <p className="text-sm text-gray-500">No class levels provided.</p>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-sm text-gray-800">
            {npc.classLevels.map((level, index) => (
              <li key={(level.class ?? 'class') + '-' + index}>
                {level.class || 'Class'} {level.level ?? ''}
                {level.subclass && <span> ({level.subclass})</span>}
                {level.notes && <span className="text-gray-600"> - {level.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Character Build">
        <div className="space-y-4">
          <div>
            <p className="font-medium">Class Features</p>
            {renderFeatures(npc.classFeatures)}
          </div>
          <div>
            <p className="font-medium">Subclass Features</p>
            {renderFeatures(npc.subclassFeatures)}
          </div>
          <div>
            <p className="font-medium">Racial Features</p>
            {renderFeatures(npc.racialFeatures)}
          </div>
          <div>
            <p className="font-medium">Feats</p>
            {renderFeatures(npc.feats)}
          </div>
          <div>
            <p className="font-medium">Fighting Styles</p>
            {renderFeatures(npc.fightingStyles)}
          </div>
          <div>
            <p className="font-medium">ASI Choices</p>
            {npc.asiChoices.length === 0 ? (
              <p className="text-sm text-gray-500">No ASI choices provided.</p>
            ) : (
              <pre className="rounded-md border border-gray-200 bg-gray-50 p-4 text-xs whitespace-pre-wrap text-gray-800">
                {JSON.stringify(npc.asiChoices, null, 2)}
              </pre>
            )}
          </div>
          <div>
            <p className="font-medium">Background Feature</p>
            {npc.backgroundFeature ? (
              <pre className="rounded-md border border-gray-200 bg-gray-50 p-4 text-xs whitespace-pre-wrap text-gray-800">
                {JSON.stringify(npc.backgroundFeature, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-500">No background feature provided.</p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Saving Throws">{renderScoredEntries(npc.savingThrows)}</Section>
      <Section title="Skill Proficiencies">{renderScoredEntries(npc.skills)}</Section>

      <Section title="Senses & Languages">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="font-medium">Senses</p>
            {renderList(npc.senses, 'No senses provided.')}
          </div>
          <div>
            <p className="font-medium">Languages</p>
            {renderList(npc.languages, 'No languages provided.')}
          </div>
        </div>
      </Section>

      <Section title="Damage & Condition Traits">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="font-medium">Resistances</p>
            {renderList(npc.damageResistances, 'None.')}
          </div>
          <div>
            <p className="font-medium">Immunities</p>
            {renderList(npc.damageImmunities, 'None.')}
          </div>
          <div>
            <p className="font-medium">Vulnerabilities</p>
            {renderList(npc.damageVulnerabilities, 'None.')}
          </div>
          <div>
            <p className="font-medium">Condition Immunities</p>
            {renderList(npc.conditionImmunities, 'None.')}
          </div>
        </div>
      </Section>

      <Section title="Abilities & Traits">
        <div className="space-y-4">
          <div>
            <p className="font-medium">Abilities</p>
            {renderFeatures(npc.abilities)}
          </div>
          <div>
            <p className="font-medium">Additional Traits</p>
            {renderFeatures(npc.additionalTraits)}
          </div>
          <div>
            <p className="font-medium">Legendary Resistance</p>
            {npc.legendaryResistance ? renderRecordEntries(npc.legendaryResistance, 'No legendary resistance details.') : (
              <p className="text-sm text-gray-500">No legendary resistance details.</p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Actions">{renderFeatures(npc.actions)}</Section>
      <Section title="Bonus Actions">{renderFeatures(npc.bonusActions)}</Section>
      <Section title="Reactions">{renderFeatures(npc.reactions)}</Section>

      <SpellcastingSection spellcasting={npc.spellcasting} />

      <Section title="Equipment & Items">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="font-medium">Equipment</p>
            {renderList(npc.equipment, 'No equipment provided.')}
          </div>
          <div>
            <p className="font-medium">Magic Items</p>
            {renderList(npc.magicItems, 'No magic items provided.')}
          </div>
          <div>
            <p className="font-medium">Weapons</p>
            {renderNamedEntries(npc.weapons, 'No weapons provided.')}
          </div>
          <div>
            <p className="font-medium">Armor & Shields</p>
            {renderNamedEntries(npc.armorAndShields, 'No armor or shields provided.')}
          </div>
          <div>
            <p className="font-medium">Wondrous Items</p>
            {renderNamedEntries(npc.wondrousItems, 'No wondrous items provided.')}
          </div>
          <div>
            <p className="font-medium">Consumables</p>
            {renderNamedEntries(npc.consumables, 'No consumables provided.')}
          </div>
          <div className="md:col-span-2">
            <p className="font-medium">Other Gear</p>
            {renderNamedEntries(npc.otherGear, 'No additional gear provided.')}
          </div>
        </div>
      </Section>

      <Section title="Relationships">
        <div className="space-y-4">
          <div>
            <p className="font-medium">Relationship Notes</p>
            {renderRelationships(npc.relationships)}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="font-medium">Allies</p>
              {renderList(npc.allies, 'No allies listed.')}
            </div>
            <div>
              <p className="font-medium">Foes</p>
              {renderList(npc.foes, 'No foes listed.')}
            </div>
          </div>
          <div>
            <p className="font-medium">Detailed Allies</p>
            {renderNamedEntries(npc.alliesDetailed, 'No detailed allies provided.')}
          </div>
          <div>
            <p className="font-medium">Detailed Enemies</p>
            {renderNamedEntries(npc.enemiesDetailed, 'No detailed enemies provided.')}
          </div>
          <div>
            <p className="font-medium">Organizations</p>
            {renderNamedEntries(npc.organizations, 'No organizations provided.')}
          </div>
          <div>
            <p className="font-medium">Family</p>
            {renderNamedEntries(npc.family, 'No family details provided.')}
          </div>
          <div>
            <p className="font-medium">Contacts</p>
            {renderNamedEntries(npc.contacts, 'No contacts provided.')}
          </div>
        </div>
      </Section>

      <Section title="Lair & Regional Effects">
        {!npc.lairActions.length && !npc.regionalEffects.length ? (
          <p className="text-sm text-gray-500">No lair or regional effects provided.</p>
        ) : (
          <div className="space-y-4">
            {npc.lairActions.length > 0 && (
              <div>
                <p className="font-medium">Lair Actions</p>
                {renderList(npc.lairActions, 'None listed.')}
              </div>
            )}
            {npc.regionalEffects.length > 0 && (
              <div>
                <p className="font-medium">Regional Effects</p>
                {renderList(npc.regionalEffects, 'None listed.')}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Notes & Sources">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="font-medium">Notes</p>
            {renderList(npc.notes, 'No notes provided.')}
          </div>
          <div>
            <p className="font-medium">Sources</p>
            {renderList(npc.sources, 'No sources listed.')}
          </div>
          <div>
            <p className="font-medium">Sources Used</p>
            {renderList(npc.sourcesUsed, 'No sources used provided.')}
          </div>
          <div>
            <p className="font-medium">Assumptions</p>
            {renderList(npc.assumptions, 'No assumptions recorded.')}
          </div>
        </div>
      </Section>

      {(typeof rawTactics === 'string' && rawTactics.trim().length > 0) || tacticsObject ? (
        <Section title="Combat Tactics">
          {typeof rawTactics === 'string' && rawTactics.trim().length > 0 ? (
            <p className="whitespace-pre-wrap text-sm text-gray-800">{rawTactics}</p>
          ) : (
            <div className="space-y-2 text-sm text-gray-800">
              {tacticsObject && renderRecordEntries(tacticsObject, 'No tactics provided.')}
            </div>
          )}
        </Section>
      ) : null}

      {npc.factCheckReport && Object.keys(npc.factCheckReport).length > 0 && (
        <Section title="Fact Check Report">
          <pre className="rounded-md border border-gray-200 bg-gray-50 p-4 text-xs whitespace-pre-wrap text-gray-800">
            {JSON.stringify(npc.factCheckReport, null, 2)}
          </pre>
        </Section>
      )}

      {!!((npc as unknown as Record<string, unknown>).balance_notes) && (
        <Section title="Balance Notes">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{String((npc as unknown as Record<string, unknown>).balance_notes)}</p>
        </Section>
      )}

      {!!((npc as unknown as Record<string, unknown>).logic_score !== undefined) && (
        <Section title="Generation Quality">
          <div className="space-y-2 text-sm text-gray-800">
            <p>
              <span className="font-medium">Logic Score:</span> {String((npc as unknown as Record<string, unknown>).logic_score)}/100
            </p>
            {!!(((npc as unknown as Record<string, unknown>).conflicts && Array.isArray((npc as unknown as Record<string, unknown>).conflicts) &&
             ((npc as unknown as Record<string, unknown>).conflicts as unknown[]).length > 0)) && (
              <div>
                <p className="font-medium">Canon Conflicts:</p>
                {renderList(((npc as unknown as Record<string, unknown>).conflicts as unknown[]).map(String), 'None.')}
              </div>
            )}
            {!!(((npc as unknown as Record<string, unknown>).physics_issues && Array.isArray((npc as unknown as Record<string, unknown>).physics_issues) &&
             ((npc as unknown as Record<string, unknown>).physics_issues as unknown[]).length > 0)) && (
              <div>
                <p className="font-medium">Physics Issues:</p>
                {renderList(((npc as unknown as Record<string, unknown>).physics_issues as unknown[]).map(String), 'None.')}
              </div>
            )}
            {!!(((npc as unknown as Record<string, unknown>).proposals && Array.isArray((npc as unknown as Record<string, unknown>).proposals) &&
             ((npc as unknown as Record<string, unknown>).proposals as unknown[]).length > 0)) && (
              <div>
                <p className="font-medium">Canon Proposals:</p>
                {renderList(((npc as unknown as Record<string, unknown>).proposals as unknown[]).map(String), 'None.')}
              </div>
            )}
          </div>
        </Section>
      )}

      {!!((npc as unknown as Record<string, unknown>).canon_update) && (
        <Section title="Canon Update">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{String((npc as unknown as Record<string, unknown>).canon_update)}</p>
        </Section>
      )}

      <Section title="Stat Block">
        {Object.keys(npc.statBlock).length === 0 ? (
          <p className="text-sm text-gray-500">No stat block provided.</p>
        ) : (
          <pre className="rounded-md border border-gray-200 bg-gray-50 p-4 text-xs whitespace-pre-wrap text-gray-800">
            {JSON.stringify(npc.statBlock, null, 2)}
          </pre>
        )}
      </Section>
    </article>
  );
};

export default NpcContentView;
