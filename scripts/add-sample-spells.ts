import { connectToMongo, getDb, closeMongo } from '../src/server/config/mongo.js';

const SAMPLE_SPELLS = [
  {
    _id: "spell.alter_arrows_fortune",
    type: "spell",
    canonical_name: "Alter Arrow's Fortune",
    aliases: [],
    claims: [],
    relationships: [],
    version: "1.0.0",
    spell_details: {
      level: 1,
      school: "Divination",
      ritual: true,
      concentration: true,
      casting_time: "1 reaction, which you take when an enemy makes a ranged attack that hits",
      range: "100 feet",
      components: {
        verbal: false,
        somatic: true,
        material: false
      },
      duration: "Instantaneous",
      description: "You clap your hands, setting off a chain of tiny events that culminate in throwing off an enemy's aim. When an enemy makes a ranged attack with a weapon or a spell that hits one of your allies, this spell causes the enemy to reroll the attack roll unless the enemy makes a successful Charisma saving throw. The attack is resolved using the lower of the two rolls (effectively giving the enemy disadvantage on the attack).",
      save_type: "Charisma",
      source: "SRD 5.1 (CC BY 4.0)"
    }
  },
  {
    _id: "spell.alarm",
    type: "spell",
    canonical_name: "Alarm",
    aliases: [],
    claims: [],
    relationships: [],
    version: "1.0.0",
    spell_details: {
      level: 1,
      school: "Abjuration",
      ritual: true,
      concentration: false,
      casting_time: "1 minute",
      range: "30 feet",
      components: {
        verbal: true,
        somatic: true,
        material: true,
        materials: "A tiny bell and a piece of fine silver wire."
      },
      duration: "8 hours",
      description: "You set an alarm against unwanted intrusion. Choose a door, a window, or an area within range that is no larger than a 20-foot cube. Until the spell ends, an alarm alerts you whenever a Tiny or larger creature touches or enters the warded area. \n\nWhen you cast the spell, you can designate creatures that won't set off the alarm. You also choose whether the alarm is mental or audible. A mental alarm alerts you with a ping in your mind if you are within 1 mile of the warded area. This ping awakens you if you are sleeping. An audible alarm produces the sound of a hand bell for 10 seconds within 60 feet.",
      source: "SRD 5.1 (CC BY 4.0)"
    }
  },
  {
    _id: "spell.fireball",
    type: "spell",
    canonical_name: "Fireball",
    aliases: [],
    claims: [],
    relationships: [],
    version: "1.0.0",
    spell_details: {
      level: 3,
      school: "Evocation",
      ritual: false,
      concentration: false,
      casting_time: "1 action",
      range: "150 feet",
      components: {
        verbal: true,
        somatic: true,
        material: true,
        materials: "A tiny ball of bat guano and sulfur."
      },
      duration: "Instantaneous",
      description: "A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one. The fire spreads around corners. It ignites flammable objects in the area that aren't being worn or carried.",
      higher_levels: "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.",
      // Parsed mechanical fields
      damage: [
        {
          dice: "8d6",
          type: "fire",
          on_success: "half"
        }
      ],
      damage_scaling: "+1d6 per slot level above 3rd",
      save_type: "Dexterity",
      area_of_effect: {
        type: "sphere",
        size: "20-foot radius"
      },
      targets: {
        type: "area",
        count: "all creatures in area"
      },
      requires_line_of_sight: true,
      can_target_objects: false,
      ongoing_effects: ["ignites flammable objects in the area that aren't being worn or carried"],
      source: "SRD 5.1 (CC BY 4.0)"
    }
  },
  {
    _id: "spell.counterspell",
    type: "spell",
    canonical_name: "Counterspell",
    aliases: [],
    claims: [],
    relationships: [],
    version: "1.0.0",
    spell_details: {
      level: 3,
      school: "Abjuration",
      ritual: false,
      concentration: false,
      casting_time: "1 reaction, which you take when you see a creature within 60 feet of you casting a spell",
      range: "60 feet",
      components: {
        verbal: false,
        somatic: true,
        material: false
      },
      duration: "Instantaneous",
      description: "You attempt to interrupt a creature in the process of casting a spell. If the creature is casting a spell of 3rd level or lower, its spell fails and has no effect. If it is casting a spell of 4th level or higher, make an ability check using your spellcasting ability. The DC equals 10 + the spell's level. On a success, the creature's spell fails and has no effect.",
      higher_levels: "When you cast this spell using a spell slot of 4th level or higher, the interrupted spell has no effect if its level is less than or equal to the level of the spell slot you used.",
      source: "SRD 5.1 (CC BY 4.0)"
    }
  },
  {
    _id: "spell.call_lightning",
    type: "spell",
    canonical_name: "Call Lightning",
    aliases: [],
    claims: [],
    relationships: [],
    version: "1.0.0",
    spell_details: {
      level: 3,
      school: "Conjuration",
      ritual: false,
      concentration: true,
      casting_time: "1 action",
      range: "120 feet",
      components: {
        verbal: true,
        somatic: true,
        material: false
      },
      duration: "Up to 10 minutes",
      description: "A storm cloud appears in the shape of a cylinder that is 10 feet tall with a 60-foot radius, centered on a point you can see 100 feet directly above you. The spell fails if you can't see a point in the air where the storm cloud could appear (for example, if you are in a room that can't accommodate the cloud). When you cast the spell, choose a point you can see within range. A bolt of lightning flashes down from the cloud to that point. Each creature within 5 feet of that point must make a dexterity saving throw. A creature takes 3d10 lightning damage on a failed save, or half as much damage on a successful one. On each of your turns until the spell ends, you can use your action to call down lightning in this way again, targeting the same point or a different one. If you are outdoors in stormy conditions when you cast this spell, the spell gives you control over the existing storm instead of creating a new one. Under such conditions, the spell's damage increases by 1d10.",
      higher_levels: "When you cast this spell using a spell slot of 4th or higher level, the damage increases by 1d10 for each slot level above 3rd.",
      // Parsed mechanical fields
      damage: [
        {
          dice: "3d10",
          type: "lightning",
          on_success: "half"
        }
      ],
      damage_scaling: "+1d10 per slot level above 3rd",
      save_type: "Dexterity",
      area_of_effect: {
        type: "sphere",
        size: "5-foot radius from target point"
      },
      targets: {
        type: "point",
        count: 1,
        restrictions: ["must be under storm cloud"]
      },
      requires_line_of_sight: true,
      can_target_objects: false,
      ongoing_effects: [
        "storm cloud appears (10 feet tall, 60-foot radius cylinder)",
        "can use action each turn to call lightning again",
        "damage increases by 1d10 if outdoors in stormy conditions"
      ],
      action_economy_effect: "can use action each turn to call down lightning",
      source: "SRD 5.1 (CC BY 4.0)"
    }
  },
  {
    _id: "spell.bestow_curse",
    type: "spell",
    canonical_name: "Bestow Curse",
    aliases: [],
    claims: [],
    relationships: [],
    version: "1.0.0",
    spell_details: {
      level: 3,
      school: "Necromancy",
      ritual: false,
      concentration: true,
      casting_time: "1 action",
      range: "Touch",
      components: {
        verbal: true,
        somatic: true,
        material: false
      },
      duration: "Up to 1 minute",
      description: "You touch a creature, and that creature must succeed on a wisdom saving throw or become cursed for the duration of the spell. When you cast this spell, choose the nature of the curse from the following options: \n- Choose one ability score. While cursed, the target has disadvantage on ability checks and saving throws made with that ability score. \n- While cursed, the target has disadvantage on attack rolls against you. \n- While cursed, the target must make a wisdom saving throw at the start of each of its turns. If it fails, it wastes its action that turn doing nothing. \n- While the target is cursed, your attacks and spells deal an extra 1d8 necrotic damage to the target. A remove curse spell ends this effect. At the DM's option, you may choose an alternative curse effect, but it should be no more powerful than those described above. The DM has final say on such a curse's effect.",
      higher_levels: "If you cast this spell using a spell slot of 4th level or higher, the duration is concentration, up to 10 minutes. If you use a spell slot of 5th level or higher, the duration is 8 hours. If you use a spell slot of 7th level or higher, the duration is 24 hours. If you use a 9th level spell slot, the spell lasts until it is dispelled. Using a spell slot of 5th level or higher grants a duration that doesn't require concentration.",
      // Parsed mechanical fields
      damage: [
        {
          dice: "1d8",
          type: "necrotic",
          on_success: "none"
        }
      ],
      save_type: "Wisdom",
      conditions_inflicted: ["cursed"],
      debuffs_inflicted: [
        "disadvantage on ability checks and saving throws (one ability score)",
        "disadvantage on attack rolls against caster",
        "may waste action on failed save"
      ],
      targets: {
        type: "creature",
        count: 1,
        restrictions: ["must be touched"]
      },
      attack_type: "melee spell attack",
      ongoing_effects: [
        "target makes Wisdom save at start of each turn or wastes action",
        "extra 1d8 necrotic damage from caster's attacks and spells"
      ],
      upcast_effects: [
        "4th level: duration becomes concentration, up to 10 minutes",
        "5th level: duration becomes 8 hours (no concentration)",
        "7th level: duration becomes 24 hours (no concentration)",
        "9th level: lasts until dispelled (no concentration)"
      ],
      source: "SRD 5.1 (CC BY 4.0)"
    }
  }
];

async function addSampleSpells() {
  try {
    console.log('Connecting to MongoDB...');
    await connectToMongo();
    const db = getDb();

    console.log(`Adding ${SAMPLE_SPELLS.length} sample spells...`);

    for (const spell of SAMPLE_SPELLS) {
      const existing = await db.collection('canon_entities').findOne({ _id: spell._id });

      if (existing) {
        console.log(`  - Spell ${spell.canonical_name} already exists, skipping`);
      } else {
        await db.collection('canon_entities').insertOne({
          ...spell,
          created_at: new Date(),
          updated_at: new Date(),
        });
        console.log(`  ✓ Added spell: ${spell.canonical_name}`);
      }
    }

    console.log('\nDone! Sample spells added successfully.');

    const totalSpells = await db.collection('canon_entities').countDocuments({ type: 'spell' });
    console.log(`Total spells in database: ${totalSpells}`);

    await closeMongo();
  } catch (error) {
    console.error('Error adding sample spells:', error);
    process.exit(1);
  }
}

addSampleSpells();
