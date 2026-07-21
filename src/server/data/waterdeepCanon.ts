/**
 * Curated high-level Waterdeep canon for the late 15th century DR.
 *
 * Claims are deliberately short, paraphrased, and independently sourced so
 * retrieval can return only the facts relevant to a generation request.
 */

import {
  generateLibraryEntityId,
  type CanonEntity,
  type EntityType,
  type Relationship,
} from '../models/CanonEntity.js';

export const WATERDEEP_CANON_VERSION = '1.0.0';
export const WATERDEEP_CANON_ERA = 'late-15th-century-dr';
export const WATERDEEP_CANON_REGION = 'sword-coast';
export const WATERDEEP_COLLECTION_ID = 'collection.waterdeep_late_15th_century_dr';
export const WATERDEEP_CIVIC_COLLECTION_ID = 'collection.waterdeep_civic_systems_and_landmarks';

export const WATERDEEP_SOURCES = {
  dragonHeist: 'Waterdeep: Dragon Heist (2018), chapter 9, Volo\'s Waterdeep Enchiridion',
  officialOverview: 'D&D Beyond, "Welcome to Waterdeep! An Introduction to the City of Splendors" (2018), https://www.dndbeyond.com/posts/243-welcome-to-waterdeep-an-introduction-to-the-city',
  dungeonOfTheMadMage: 'Waterdeep: Dungeon of the Mad Mage (2018), https://wpn.wizards.com/en/products/waterdeep-dungeon-of-the-mad-mage',
  dragonHeistFactions: 'Waterdeep: Dragon Heist (2018), introduction and chapter 2, factions and life in Waterdeep',
} as const;

type SeedOptions = {
  aliases?: string[];
  relationships?: Relationship[];
  tags?: string[];
  details?: Record<string, unknown>;
};

const entityId = (type: EntityType, name: string): string => generateLibraryEntityId(type, name);

const claim = (text: string, source: string = WATERDEEP_SOURCES.dragonHeist) => ({ text, source });

const seedEntity = (
  type: EntityType,
  canonicalName: string,
  claims: CanonEntity['claims'],
  options: SeedOptions = {},
): CanonEntity => ({
  _id: entityId(type, canonicalName),
  scope: 'lib',
  type,
  canonical_name: canonicalName,
  aliases: options.aliases ?? [],
  era: WATERDEEP_CANON_ERA,
  region: WATERDEEP_CANON_REGION,
  relationships: options.relationships ?? [],
  claims,
  details: {
    canonLayer: 'high-level',
    setting: 'Forgotten Realms',
    temporalScope: 'Waterdeep: Dragon Heist era, approximately 1492 DR',
    ...(options.details ?? {}),
  },
  is_official: true,
  tags: [
    'forgotten-realms',
    'waterdeep',
    WATERDEEP_CANON_ERA,
    'high-level',
    ...(options.tags ?? []),
  ],
  source: 'Curated from official Wizards of the Coast / D&D Beyond sources',
  version: WATERDEEP_CANON_VERSION,
});

const WATERDEEP_ID = entityId('location', 'Waterdeep');
const CASTLE_WARD_ID = entityId('location', 'Castle Ward');
const DOCK_WARD_ID = entityId('location', 'Dock Ward');
const SEA_WARD_ID = entityId('location', 'Sea Ward');
const UNDERMOUNTAIN_ID = entityId('location', 'Undermountain');
const DEEPWATER_HARBOR_ID = entityId('location', 'Deepwater Harbor');
const MOUNT_WATERDEEP_ID = entityId('location', 'Mount Waterdeep');
const LORDS_OF_WATERDEEP_ID = entityId('faction', 'Lords of Waterdeep');
const CITY_WATCH_ID = entityId('faction', 'City Watch of Waterdeep');

const inWaterdeep: Relationship[] = [{ target_id: WATERDEEP_ID, kind: 'part_of' }];

export const WATERDEEP_HIGH_LEVEL_ENTITIES: CanonEntity[] = [
  seedEntity('location', 'Waterdeep', [
    claim('Waterdeep is a large, prosperous, cosmopolitan city on the Sword Coast, widely called the City of Splendors and the Crown of the North.'),
    claim('Waterdeep is a center of trade, culture, learning, and magic whose everyday life is more developed than that of much of the surrounding Sword Coast.', WATERDEEP_SOURCES.officialOverview),
    claim('Waterdeep is governed by an Open Lord and a council of Masked Lords; Laeral Silverhand is Open Lord in the Waterdeep: Dragon Heist era.', WATERDEEP_SOURCES.officialOverview),
    claim('Waterdeep enforces a formal legal code, and open violence or destructive adventuring draws a swift civic response.'),
    claim('The city stands above the vast dungeon complex called Undermountain.', WATERDEEP_SOURCES.officialOverview),
  ], {
    aliases: ['City of Splendors', 'Crown of the North', 'Jewel of the Sword Coast'],
    relationships: [
      { target_id: entityId('faction', 'Lords of Waterdeep'), kind: 'governed_by' },
      { target_id: UNDERMOUNTAIN_ID, kind: 'built_above' },
    ],
    tags: ['city', 'metropolis', 'trade-hub', 'government', 'magic'],
    details: { geographicTier: 'city', parentRegion: 'Sword Coast' },
  }),

  seedEntity('location', 'Castle Ward', [
    claim('Castle Ward is Waterdeep\'s governmental, military, and ceremonial center.'),
    claim('Castle Ward surrounds much of Mount Waterdeep and contains Castle Waterdeep, the Palace of Waterdeep, Blackstaff Tower, the city\'s great Market, and the Yawning Portal.'),
    claim('Its important civic sites, affluent residents, and major thoroughfares bring a strong official and security presence.'),
  ], {
    aliases: ['Waterdeep Castle Ward'],
    relationships: inWaterdeep,
    tags: ['ward', 'government', 'military', 'market'],
    details: { geographicTier: 'district', parentLocationId: WATERDEEP_ID },
  }),

  seedEntity('location', 'Dock Ward', [
    claim('Dock Ward occupies Waterdeep\'s working waterfront beside the commercially active harbor.'),
    claim('Dock Ward is crowded with docks, warehouses, cheap lodgings, taverns, sailors, laborers, and businesses that serve shipping.'),
    claim('Compared with Waterdeep\'s wealthier wards, Dock Ward is poorer, rougher, dirtier, and more vulnerable to organized crime.', WATERDEEP_SOURCES.officialOverview),
  ], {
    aliases: ['Waterdeep Dock Ward'],
    relationships: inWaterdeep,
    tags: ['ward', 'waterfront', 'harbor', 'warehouses', 'working-class'],
    details: { geographicTier: 'district', parentLocationId: WATERDEEP_ID },
  }),

  seedEntity('location', 'Trades Ward', [
    claim('Trades Ward is Waterdeep\'s principal commercial and shopping district.'),
    claim('Many guildhalls, shops, services, workshops, and merchants are concentrated in Trades Ward.'),
    claim('Trades Ward serves much of Waterdeep\'s middle class and receives heavy pedestrian, cart, and delivery traffic.'),
  ], {
    aliases: ['Trade Ward', 'Waterdeep Trades Ward'],
    relationships: inWaterdeep,
    tags: ['ward', 'commerce', 'guilds', 'shops', 'middle-class'],
    details: { geographicTier: 'district', parentLocationId: WATERDEEP_ID },
  }),

  seedEntity('location', 'North Ward', [
    claim('North Ward is an affluent residential district of Waterdeep.'),
    claim('Its residents include prosperous merchants, professionals, lesser nobles, and successful adventurers.', WATERDEEP_SOURCES.officialOverview),
    claim('North Ward is cleaner and quieter than the central commercial wards and benefits from an attentive City Watch presence.', WATERDEEP_SOURCES.officialOverview),
  ], {
    aliases: ['Waterdeep North Ward'],
    relationships: inWaterdeep,
    tags: ['ward', 'residential', 'affluent', 'villas'],
    details: { geographicTier: 'district', parentLocationId: WATERDEEP_ID },
  }),

  seedEntity('location', 'Sea Ward', [
    claim('Sea Ward is Waterdeep\'s wealthiest and most prestigious residential district.'),
    claim('Sea Ward occupies high ground overlooking the Sea of Swords and contains noble villas, major temples, gardens, and ceremonial destinations.', WATERDEEP_SOURCES.officialOverview),
    claim('The Field of Triumph, Waterdeep\'s great arena, stands in Sea Ward.', WATERDEEP_SOURCES.officialOverview),
  ], {
    aliases: ['Waterdeep Sea Ward'],
    relationships: inWaterdeep,
    tags: ['ward', 'nobility', 'wealth', 'temples', 'arena'],
    details: { geographicTier: 'district', parentLocationId: WATERDEEP_ID },
  }),

  seedEntity('location', 'Southern Ward', [
    claim('Southern Ward is Waterdeep\'s principal caravan district and southern overland gateway.'),
    claim('Caravan yards, stables, wagon services, inns, warehouses, teamsters, guards, and visiting traders shape the ward.'),
    claim('Southern Ward is a densely inhabited working and middle-class district with strong ties to commerce arriving by road.'),
  ], {
    aliases: ['South Ward', 'Waterdeep Southern Ward'],
    relationships: inWaterdeep,
    tags: ['ward', 'caravans', 'stables', 'overland-trade', 'working-class'],
    details: { geographicTier: 'district', parentLocationId: WATERDEEP_ID },
  }),

  seedEntity('location', 'City of the Dead', [
    claim('The City of the Dead is Waterdeep\'s walled cemetery district and a major landscaped green space.'),
    claim('By day, Waterdhavians visit tombs, memorials, lawns, and paths in the City of the Dead.'),
    claim('The district\'s gates close at night, when its tombs and supernatural dangers are more tightly controlled.'),
  ], {
    aliases: ['Waterdeep City of the Dead'],
    relationships: inWaterdeep,
    tags: ['ward', 'cemetery', 'park', 'tombs', 'undead'],
    details: { geographicTier: 'district', parentLocationId: WATERDEEP_ID },
  }),

  seedEntity('location', 'Field Ward', [
    claim('Field Ward is an unofficial district between Waterdeep\'s northern walls rather than one of the formally administered inner wards.'),
    claim('Field Ward is overcrowded, poor, and underserved by municipal infrastructure.'),
    claim('Ordinary City Watch patrols do not operate inside Field Ward, leaving residents to rely more heavily on local arrangements and the nearby City Guard.'),
  ], {
    aliases: ['Waterdeep Field Ward'],
    relationships: inWaterdeep,
    tags: ['unofficial-ward', 'poverty', 'outer-city', 'underserved'],
    details: { geographicTier: 'district', parentLocationId: WATERDEEP_ID, officialWard: false },
  }),

  seedEntity('location', 'Deepwater Harbor', [
    claim('Waterdeep takes its name from the exceptional natural deep-water harbor at the city\'s western edge.'),
    claim('Deepwater Harbor includes the commercially active Great Harbor and the restricted Naval Harbor.'),
    claim('Shipping, customs, ferries, pilots, cargo handling, harbor defenses, and naval activity make the harbor a city-scale transportation system.'),
  ], {
    aliases: ['Waterdeep Harbor'],
    relationships: [
      ...inWaterdeep,
      { target_id: DOCK_WARD_ID, kind: 'adjoins' },
    ],
    tags: ['harbor', 'shipping', 'naval', 'customs', 'transport'],
    details: { geographicTier: 'district', parentLocationId: WATERDEEP_ID },
  }),

  seedEntity('location', 'Mount Waterdeep', [
    claim('Mount Waterdeep rises inside the western side of the city and dominates its skyline.'),
    claim('Castle Waterdeep occupies part of the mountain, and the Peaktop Aerie supports Waterdeep\'s griffon cavalry.'),
    claim('Caves and passages beneath Mount Waterdeep connect the surface city with deeper subterranean routes.'),
  ], {
    aliases: [],
    relationships: [
      ...inWaterdeep,
      { target_id: CASTLE_WARD_ID, kind: 'partly_within' },
    ],
    tags: ['mountain', 'castle', 'griffon-cavalry', 'caves'],
    details: { geographicTier: 'landmark', parentLocationId: WATERDEEP_ID },
  }),

  seedEntity('location', 'The Yawning Portal', [
    claim('The Yawning Portal is a famous Castle Ward inn built around an open shaft descending into Undermountain.', WATERDEEP_SOURCES.officialOverview),
    claim('Adventurers are lowered into or raised from Undermountain through the inn\'s well while patrons watch.', WATERDEEP_SOURCES.officialOverview),
    claim('The veteran adventurer Durnan owns and operates the Yawning Portal in the Waterdeep: Dragon Heist era.', WATERDEEP_SOURCES.officialOverview),
  ], {
    aliases: ['Yawning Portal Inn', 'The Yawning Portal Inn and Tavern'],
    relationships: [
      { target_id: CASTLE_WARD_ID, kind: 'located_in' },
      { target_id: UNDERMOUNTAIN_ID, kind: 'entrance_to' },
    ],
    tags: ['inn', 'tavern', 'landmark', 'dungeon-entrance', 'adventurers'],
    details: { geographicTier: 'site', parentLocationId: CASTLE_WARD_ID },
  }),

  seedEntity('location', 'Undermountain', [
    claim('Undermountain is an enormous, ancient dungeon complex beneath Waterdeep.', WATERDEEP_SOURCES.officialOverview),
    claim('Undermountain is the domain of the mad wizard Halaster Blackcloak and contains monsters, traps, magical anomalies, and many distinct levels.', WATERDEEP_SOURCES.dungeonOfTheMadMage),
    claim('Waterdeep: Dungeon of the Mad Mage details twenty-three levels of Undermountain.', WATERDEEP_SOURCES.dungeonOfTheMadMage),
  ], {
    aliases: ['The Dungeon of the Mad Mage'],
    relationships: [
      { target_id: WATERDEEP_ID, kind: 'beneath' },
      { target_id: entityId('location', 'Skullport'), kind: 'contains' },
    ],
    tags: ['megadungeon', 'underground', 'halaster-blackcloak', 'dungeon'],
    details: { geographicTier: 'region', parentLocationId: WATERDEEP_ID },
  }),

  seedEntity('location', 'Skullport', [
    claim('Skullport is a dangerous subterranean settlement within the greater Undermountain complex.', WATERDEEP_SOURCES.dungeonOfTheMadMage),
    claim('Skullport is also called the Port of Shadows and serves as a refuge and marketplace beyond Waterdeep\'s ordinary civic control.'),
    claim('The subterranean River Sargauth provides a navigable approach to Skullport through the depths beneath Waterdeep.'),
  ], {
    aliases: ['Port of Shadows', 'Port of Skulls'],
    relationships: [{ target_id: UNDERMOUNTAIN_ID, kind: 'within' }],
    tags: ['underground-settlement', 'criminal-refuge', 'river-sargauth', 'undermountain'],
    details: { geographicTier: 'settlement', parentLocationId: UNDERMOUNTAIN_ID },
  }),

  seedEntity('faction', 'Lords of Waterdeep', [
    claim('Waterdeep is ruled by an Open Lord together with a council of Masked Lords.', WATERDEEP_SOURCES.officialOverview),
    claim('The Masked Lords conceal their identities to reduce coercion and factional pressure.', WATERDEEP_SOURCES.officialOverview),
    claim('Laeral Silverhand is the Open Lord during the Waterdeep: Dragon Heist era.', WATERDEEP_SOURCES.officialOverview),
  ], {
    aliases: ['The Lords', 'Masked Lords of Waterdeep'],
    relationships: [{ target_id: WATERDEEP_ID, kind: 'governs' }],
    tags: ['government', 'open-lord', 'masked-lords', 'laeral-silverhand'],
    details: { entityTier: 'city-government' },
  }),

  seedEntity('faction', 'City Watch of Waterdeep', [
    claim('The City Watch is Waterdeep\'s civil policing organization and patrols the city\'s streets.'),
    claim('The Watch investigates crimes, makes arrests, protects public order, and enforces Waterdeep\'s Code Legal.'),
    claim('Watch presence is strongest in well-administered central and affluent wards and does not extend to ordinary patrols inside Field Ward.'),
  ], {
    aliases: ['Waterdeep City Watch', 'The Watch'],
    relationships: [{ target_id: WATERDEEP_ID, kind: 'polices' }],
    tags: ['law-enforcement', 'code-legal', 'watch', 'civic-order'],
    details: { entityTier: 'city-faction' },
  }),
];

export const WATERDEEP_HIGH_LEVEL_COLLECTION = {
  _id: WATERDEEP_COLLECTION_ID,
  name: 'Waterdeep — Late 15th Century DR',
  description: 'High-level official canon for Waterdeep in the Waterdeep: Dragon Heist era: city identity, wards, government, policing, harbor, mountain, and major underground gateways.',
  entity_ids: WATERDEEP_HIGH_LEVEL_ENTITIES.map((entity) => entity._id),
  tags: ['forgotten-realms', 'waterdeep', WATERDEEP_CANON_ERA, 'high-level'],
  category: 'setting-library',
  is_official: true,
};

export const WATERDEEP_CIVIC_ENTITIES: CanonEntity[] = [
  seedEntity('location', 'Castle Waterdeep', [
    claim('Castle Waterdeep is a massive fortress built into a spur of Mount Waterdeep.'),
    claim('The castle serves as a military stronghold, defensive command site, garrison, and secure place of confinement.'),
    claim('Castle Waterdeep is distinct from the Palace of Waterdeep, which is the center of ordinary civic administration.'),
  ], {
    relationships: [
      { target_id: CASTLE_WARD_ID, kind: 'located_in' },
      { target_id: MOUNT_WATERDEEP_ID, kind: 'built_into' },
    ],
    tags: ['landmark', 'fortress', 'military', 'detention'],
    details: { canonLayer: 'civic-detail', geographicTier: 'site', parentLocationId: CASTLE_WARD_ID },
  }),

  seedEntity('location', 'Palace of Waterdeep', [
    claim('The Palace of Waterdeep is the center of the city\'s civil government and the official seat of the Open Lord.'),
    claim('The palace supports government offices, audiences, courts, diplomatic business, and meetings connected to the Lords of Waterdeep.'),
    claim('Public copies of the Code Legal can be obtained at the Palace of Waterdeep.'),
  ], {
    aliases: ['Palace of the Open Lord'],
    relationships: [
      { target_id: CASTLE_WARD_ID, kind: 'located_in' },
      { target_id: LORDS_OF_WATERDEEP_ID, kind: 'seat_of' },
    ],
    tags: ['landmark', 'government', 'courts', 'diplomacy'],
    details: { canonLayer: 'civic-detail', geographicTier: 'site', parentLocationId: CASTLE_WARD_ID },
  }),

  seedEntity('location', 'Blackstaff Tower', [
    claim('Blackstaff Tower is the magically protected home and stronghold associated with Waterdeep\'s Blackstaff.'),
    claim('The Blackstaff is a principal defender of Waterdeep against major magical and supernatural threats.'),
    claim('Vajra Safahr holds the office of Blackstaff during the Waterdeep: Dragon Heist era.', WATERDEEP_SOURCES.dragonHeistFactions),
  ], {
    relationships: [{ target_id: CASTLE_WARD_ID, kind: 'located_in' }],
    tags: ['landmark', 'blackstaff', 'magic', 'city-defense', 'vajra-safahr'],
    details: { canonLayer: 'civic-detail', geographicTier: 'site', parentLocationId: CASTLE_WARD_ID },
  }),

  seedEntity('location', 'The Market of Waterdeep', [
    claim('Waterdeep\'s great Market is a large open commercial space in Castle Ward.'),
    claim('Stalls and carts sell goods from across Waterdeep, the Sword Coast, and more distant parts of Faerûn.'),
    claim('The Market is busy across both daytime and nighttime hours and draws customers from every social class.'),
  ], {
    aliases: ['The Market', 'Waterdeep Market'],
    relationships: [{ target_id: CASTLE_WARD_ID, kind: 'located_in' }],
    tags: ['landmark', 'market', 'commerce', 'public-space'],
    details: { canonLayer: 'civic-detail', geographicTier: 'site', parentLocationId: CASTLE_WARD_ID },
  }),

  seedEntity('location', 'Walking Statues of Waterdeep', [
    claim('Eight colossal magical constructs known as the walking statues stand in and around Waterdeep.'),
    claim('Most of the statues are dormant in the Waterdeep: Dragon Heist era and function as unmistakable city landmarks.'),
    claim('Waterdeep repaired streets and constructed buildings around several statues after their earlier appearances and rampages.'),
    claim('The walking statues remain symbols and potential instruments of Waterdeep\'s magical defense.'),
  ], {
    aliases: ['The Walking Statues'],
    relationships: [{ target_id: WATERDEEP_ID, kind: 'distributed_across' }],
    tags: ['landmark', 'constructs', 'magic', 'city-defense'],
    details: { canonLayer: 'civic-detail', geographicTier: 'distributed-landmark' },
  }),

  seedEntity('location', 'Field of Triumph', [
    claim('The Field of Triumph is Waterdeep\'s great public arena in Sea Ward.'),
    claim('The arena hosts races, martial displays, contests, spectacles, proclamations, and large civic celebrations.'),
    claim('A monumental lion-shaped entrance is one of the Field of Triumph\'s defining features.'),
  ], {
    aliases: ['Fields of Triumph'],
    relationships: [{ target_id: SEA_WARD_ID, kind: 'located_in' }],
    tags: ['landmark', 'arena', 'spectacles', 'public-events'],
    details: { canonLayer: 'civic-detail', geographicTier: 'site', parentLocationId: SEA_WARD_ID },
  }),

  seedEntity('location', 'Heroes\' Garden', [
    claim('Heroes\' Garden is a large landscaped public garden in Sea Ward.'),
    claim('The garden contains memorial features honoring heroes and provides lawns, trees, paths, and water features within the wealthy ward.'),
    claim('Heroes\' Garden is open to the public despite its location among Sea Ward estates and temples.'),
  ], {
    aliases: ['Heroes Garden'],
    relationships: [{ target_id: SEA_WARD_ID, kind: 'located_in' }],
    tags: ['landmark', 'park', 'memorial', 'public-space'],
    details: { canonLayer: 'civic-detail', geographicTier: 'site', parentLocationId: SEA_WARD_ID },
  }),

  seedEntity('location', 'Sea\'s Edge Beach', [
    claim('Sea\'s Edge Beach is a public coastal area beneath Waterdeep\'s affluent northern cliffs.'),
    claim('The beach gives Waterdhavians direct access to the shore below Sea Ward.'),
    claim('The cliffs and the elevated Sea Ward loom above Sea\'s Edge Beach.'),
  ], {
    aliases: ['Sea\'s Edge'],
    relationships: [{ target_id: SEA_WARD_ID, kind: 'below' }],
    tags: ['landmark', 'beach', 'coast', 'public-space'],
    details: { canonLayer: 'civic-detail', geographicTier: 'site', parentLocationId: SEA_WARD_ID },
  }),

  seedEntity('location', 'Great Harbor', [
    claim('The Great Harbor is the commercially active portion of Deepwater Harbor.'),
    claim('Merchant ships, cargo craft, ferries, pilots, customs activity, and dock labor concentrate in the Great Harbor.'),
    claim('Great Harbor traffic directly supports Dock Ward warehouses, yards, taverns, and shipping businesses.'),
  ], {
    aliases: ['Waterdeep Great Harbor'],
    relationships: [
      { target_id: DEEPWATER_HARBOR_ID, kind: 'part_of' },
      { target_id: DOCK_WARD_ID, kind: 'adjoins' },
    ],
    tags: ['harbor', 'commercial-shipping', 'customs', 'waterfront'],
    details: { canonLayer: 'civic-detail', geographicTier: 'district', parentLocationId: DEEPWATER_HARBOR_ID },
  }),

  seedEntity('location', 'Naval Harbor', [
    claim('The Naval Harbor is the restricted military portion of Deepwater Harbor.'),
    claim('Waterdeep reserves the Naval Harbor for naval vessels, harbor defense, and authorized traffic.'),
    claim('Access and activity in the Naval Harbor are more tightly controlled than in the commercial Great Harbor.'),
  ], {
    aliases: ['Waterdeep Naval Harbor'],
    relationships: [{ target_id: DEEPWATER_HARBOR_ID, kind: 'part_of' }],
    tags: ['harbor', 'naval', 'restricted', 'city-defense'],
    details: { canonLayer: 'civic-detail', geographicTier: 'district', parentLocationId: DEEPWATER_HARBOR_ID },
  }),

  seedEntity('location', 'Peaktop Aerie', [
    claim('Peaktop Aerie is the Mount Waterdeep base of the city\'s Griffon Cavalry.'),
    claim('The aerie houses and supports griffons, riders, and aerial operations.'),
    claim('Its elevation allows rapid observation of and response across the city, harbor, and approaches to Waterdeep.'),
  ], {
    relationships: [{ target_id: MOUNT_WATERDEEP_ID, kind: 'located_on' }],
    tags: ['military', 'griffons', 'aerie', 'city-defense'],
    details: { canonLayer: 'civic-detail', geographicTier: 'site', parentLocationId: MOUNT_WATERDEEP_ID },
  }),

  seedEntity('rule', 'Waterdeep Code Legal', [
    claim('The Code Legal summarizes Waterdeep\'s major criminal offenses and their typical punishments.'),
    claim('Potential penalties include fines, damages, imprisonment, hard labor, exile, flogging, and death, depending on the offense and judgment.'),
    claim('Waterdeep\'s magisters have discretion when applying the Code Legal, and the city\'s broader law also depends on precedent.'),
    claim('Copies of the Code Legal are available from the Palace and from magisters at city gates and the harbor.'),
  ], {
    aliases: ['Code Legal'],
    relationships: [
      { target_id: WATERDEEP_ID, kind: 'law_of' },
      { target_id: LORDS_OF_WATERDEEP_ID, kind: 'promulgated_by' },
      { target_id: CITY_WATCH_ID, kind: 'enforced_by' },
    ],
    tags: ['law', 'crime', 'punishment', 'magisters'],
    details: { canonLayer: 'civic-detail', ruleTier: 'city-law' },
  }),

  seedEntity('faction', 'City Guard of Waterdeep', [
    claim('The City Guard is Waterdeep\'s military force, distinct from the civil City Watch.'),
    claim('The Guard defends walls, gates, roads, key military sites, and the city against organized external threats.'),
    claim('City Guard posts also watch important approaches beyond the city, including major roads and bridges.'),
  ], {
    aliases: ['Waterdeep City Guard', 'The Guard'],
    relationships: [{ target_id: WATERDEEP_ID, kind: 'defends' }],
    tags: ['military', 'gates', 'walls', 'city-defense'],
    details: { canonLayer: 'civic-detail', entityTier: 'city-faction' },
  }),

  seedEntity('faction', 'Griffon Cavalry of Waterdeep', [
    claim('Waterdeep\'s Griffon Cavalry is an aerial arm of the City Guard.'),
    claim('Griffon riders patrol the city, harbor, and approaches and can respond quickly to major threats.'),
    claim('The Griffon Cavalry operates from Peaktop Aerie on Mount Waterdeep.'),
  ], {
    aliases: ['Waterdeep Griffon Cavalry'],
    relationships: [
      { target_id: entityId('faction', 'City Guard of Waterdeep'), kind: 'part_of' },
      { target_id: entityId('location', 'Peaktop Aerie'), kind: 'based_at' },
    ],
    tags: ['military', 'griffons', 'aerial-patrol', 'city-defense'],
    details: { canonLayer: 'civic-detail', entityTier: 'specialist-unit' },
  }),

  seedEntity('faction', 'Force Grey', [
    claim('Force Grey is an elite group of adventurers used to defend Waterdeep from exceptional threats.', WATERDEEP_SOURCES.dragonHeistFactions),
    claim('The Blackstaff directs Force Grey when ordinary civic and military forces are insufficient.', WATERDEEP_SOURCES.dragonHeistFactions),
    claim('Prospective or less-established operatives associated with Force Grey are commonly called the Gray Hands.', WATERDEEP_SOURCES.dragonHeistFactions),
  ], {
    aliases: ['Gray Hands', 'Grey Hands'],
    relationships: [{ target_id: WATERDEEP_ID, kind: 'defends' }],
    tags: ['elite-adventurers', 'blackstaff', 'city-defense', 'faction'],
    details: { canonLayer: 'civic-detail', entityTier: 'elite-faction' },
  }),

  seedEntity('faction', 'Watchful Order of Magists and Protectors', [
    claim('The Watchful Order of Magists and Protectors is Waterdeep\'s organized guild of arcane practitioners.'),
    claim('The Order supports magical regulation, professional services, and the city\'s response to magical threats.'),
    claim('Resident arcane spellcasters are expected to register with the Order so the city can call on magical aid in an emergency.'),
  ], {
    aliases: ['Watchful Order', 'Order of Magists and Protectors'],
    relationships: [{ target_id: WATERDEEP_ID, kind: 'operates_in' }],
    tags: ['guild', 'arcane-magic', 'registration', 'city-defense'],
    details: { canonLayer: 'civic-detail', entityTier: 'guild' },
  }),

  seedEntity('faction', 'Guilds of Waterdeep', [
    claim('Waterdeep\'s many trade guilds regulate a broad range of crafts, services, and commercial professions.'),
    claim('Guild membership, dues, licenses, standards, and access to suppliers strongly shape how businesses operate in the city.'),
    claim('Independent practitioners can work outside a guild, but guild pressure can make unlicensed competition difficult.'),
  ], {
    aliases: ['Waterdhavian Guilds'],
    relationships: [{ target_id: WATERDEEP_ID, kind: 'operates_in' }],
    tags: ['guilds', 'commerce', 'licenses', 'trades'],
    details: { canonLayer: 'civic-detail', entityTier: 'institutional-network' },
  }),

  seedEntity('faction', 'Magisters of Waterdeep', [
    claim('Waterdeep\'s magisters are civic judges identifiable by their black robes.'),
    claim('Magisters hear legal matters, register qualifying arrivals, and can issue sentences under the city\'s law.'),
    claim('Magisters exercise broad judgment within the Code Legal and Waterdeep\'s body of precedent.'),
  ], {
    aliases: ['Black Robes', 'Waterdeep Magisters'],
    relationships: [
      { target_id: WATERDEEP_ID, kind: 'administers_law_in' },
      { target_id: LORDS_OF_WATERDEEP_ID, kind: 'serves_government_of' },
    ],
    tags: ['law', 'judges', 'registration', 'government'],
    details: { canonLayer: 'civic-detail', entityTier: 'civic-office' },
  }),
];

export const WATERDEEP_CIVIC_COLLECTION = {
  _id: WATERDEEP_CIVIC_COLLECTION_ID,
  name: 'Waterdeep — Civic Systems and Landmarks',
  description: 'Second-layer Waterdeep canon covering government sites, public landmarks, law, military defense, magical defense, guild influence, and the harbor\'s major divisions.',
  entity_ids: WATERDEEP_CIVIC_ENTITIES.map((entity) => entity._id),
  tags: ['forgotten-realms', 'waterdeep', WATERDEEP_CANON_ERA, 'civic-detail'],
  category: 'setting-library',
  is_official: true,
};

export const WATERDEEP_CANON_ENTITIES = [
  ...WATERDEEP_HIGH_LEVEL_ENTITIES,
  ...WATERDEEP_CIVIC_ENTITIES,
];

export const WATERDEEP_CANON_COLLECTIONS = [
  WATERDEEP_HIGH_LEVEL_COLLECTION,
  WATERDEEP_CIVIC_COLLECTION,
];
