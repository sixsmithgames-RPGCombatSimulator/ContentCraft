# Equipment & NPC Generation – Missing Data Report

## Observed Output
The AI generated an NPC with only a handful of fields:
```json
{
  "name": "Thyra Odinson",
  "race": "Aasimar",
  "equipment": ["long sword of sharpness","sentinel shield","prayer beads","potions"],
  "alignment": "Lawful Good",
  "hit_points": 99,
  "armor_class": 20,
  "proficiency_bonus": 4,
  "background": "Tears of Selune",
  ...
}
```
Key sections such as **class_features**, **subclass_features**, **feats**, **asi_choices**, **ability_scores**, etc., are missing.

## Why It Happens
1. **Schema Required Fields Not Enforced for Some Stages**
   * `getEquipmentSchema` only marks `equipment` and `attuned_items` as required.  The AI therefore never has to supply `ability_scores`, `armor_class`, `hit_points`, etc., even though the prompt asks for them.
   * `getCharacterBuildSchema` does list all feature fields as required, but the server‑side validation was previously set to *strip* missing fields.  After our recent change we now return a 422 on validation failure, but the pipeline was not re‑run after the code change, so the previous successful run still produced the incomplete payload.
2. **Prompt Lacks Explicit “You MUST include these fields” Language**
   * The equipment stage prompt mentions basic gear and magic‑item guardrails but does not explicitly demand the derived stat adjustments or class‑specific gear.
   * The character‑build prompt lists the fields in a “focus” section, but the AI often ignores them when the schema does not make them required.
3. **Pipeline Not Restarted After Validation Change**
   * The server now returns 422 for missing required fields, but the user’s last test run used the old code version where the validator stripped fields silently.  Hence the AI was never forced to provide the missing data.

## Recommendations
* **Make Required Fields Explicit in Schemas** – Add the missing stat and feature keys to the `required` array for the relevant stages (equipment, stats, character build).  This forces the validator to reject incomplete payloads.
* **Update System Prompts** – Add a clear line such as:
  > "You MUST include **all** fields listed in the schema, even if you think the canon does not specify them."
  for each stage.
* **Re‑run the Full Generation Pipeline** after the code changes to verify that the server now returns 422 when required fields are omitted, prompting the AI to supply them.
* **Consider a Fallback** – If the AI repeatedly omits a required field, log a warning and auto‑populate a sensible default (e.g., empty array) before validation, then surface the issue to the user.

## Next Steps
1. Add the missing required keys to `getEquipmentSchema` (e.g., `ability_scores`, `armor_class`, `hit_points`, `proficiency_bonus`).
2. Ensure the character‑build schema’s required list is used by the validator.
3. Update the prompts to stress mandatory inclusion.
4. Run the full pipeline and confirm that the AI now returns complete NPC objects.

*Report generated on $(date).*
