# Waterdeep canon library

`Waterdeep — Late 15th Century DR` is a reusable GMC canon collection for the
era of *Waterdeep: Dragon Heist* (approximately 1492 DR). It belongs in GMC's
library scope, not in GameMaster Assistant prompts or campaign facts.

## Completed foundation

The first layer contains the city, eight formal or commonly treated ward
areas, Deepwater Harbor, Mount Waterdeep, the Yawning Portal, Undermountain,
Skullport, the Lords of Waterdeep, and the City Watch. The second layer adds
major government sites, public landmarks, harbor divisions, law, courts,
military and magical defense, and the guild system. Claims are paraphrased,
atomic, era-tagged, and independently attributed so retrieval does not need to
inject an entire city gazetteer for a narrow question.

Run a preview, then import and optionally link the entities to a project:

```powershell
npm run canon:waterdeep -- --dry-run --user-id <clerk-user-id>
npm run canon:waterdeep -- --user-id <clerk-user-id> --project-id <project-id>
```

The importer is idempotent. It owns and replaces the retrieval chunks for its
curated entities while preserving their original creation timestamps.

The same collections can be transported through GMC's authenticated library
bundle API. Exported artifacts are named:

- `waterdeep-late-15th-century-dr.gmc-library.json`
- `waterdeep-civic-systems-and-landmarks.gmc-library.json`

Import the foundation first, followed by the civic bundle. The civic bundle
also carries its relationship dependencies, so it remains valid if imported
on its own.

## Detail layers to add next

1. Ward gazetteers: major streets, gates, squares, temples, markets, civic
   buildings, and public landmarks, each related to its parent ward.
2. Organizations: individual guilds, noble houses, criminal factions, faiths, and
   adventuring factions, with public and secret claims separated.
3. Named places and people: inns, shops, villas, dungeons, officeholders, and
   recurring residents, with explicit era and source boundaries.
4. Daily life: coinage and slang, festivals, weather, food, lodging, hiring,
   customs, and ward-specific encounter context.

## Primary references

- *Waterdeep: Dragon Heist* (2018), especially chapter 9, "Volo's Waterdeep
  Enchiridion": https://www.dndbeyond.com/sources/dnd/wdh
- D&D Beyond, "Welcome to Waterdeep! An Introduction to the City of
  Splendors": https://www.dndbeyond.com/posts/243-welcome-to-waterdeep-an-introduction-to-the-city
- *Waterdeep: Dungeon of the Mad Mage* (2018):
  https://wpn.wizards.com/en/products/waterdeep-dungeon-of-the-mad-mage
