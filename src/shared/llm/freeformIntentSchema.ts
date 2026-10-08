export const FREEFORM_INTENT_PROPOSAL_SCHEMA = {
  "$id": "gma.freeform-intent-proposal/1",
  "description": "Compact interpretation proposal; never authority to apply game changes.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "ticket",
    "windowText",
    "referents",
    "steps",
    "observations",
    "clarification"
  ],
  "properties": {
    "schemaVersion": {
      "const": "gma.freeform-intent-proposal/1"
    },
    "ticket": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "windowText": {
      "type": "string",
      "minLength": 1,
      "maxLength": 32768
    },
    "referents": {
      "type": "array",
      "maxItems": 32,
      "items": {
        "$ref": "#/$defs/referent"
      }
    },
    "steps": {
      "type": "array",
      "minItems": 1,
      "maxItems": 8,
      "items": {
        "$ref": "#/$defs/step"
      }
    },
    "observations": {
      "type": "array",
      "maxItems": 32,
      "items": {
        "$ref": "#/$defs/observation"
      }
    },
    "clarification": {
      "type": [
        "string",
        "null"
      ],
      "maxLength": 500
    }
  },
  "$defs": {
    "index": {
      "type": "integer",
      "minimum": 0,
      "maximum": 31
    },
    "optionalIndex": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 0,
      "maximum": 31
    },
    "stepIndex": {
      "type": "integer",
      "minimum": 0,
      "maximum": 7
    },
    "optionalStep": {
      "type": [
        "integer",
        "null"
      ],
      "minimum": 0,
      "maximum": 7
    },
    "evidence": {
      "type": "array",
      "minItems": 1,
      "maxItems": 8,
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 1000
      }
    },
    "links": {
      "type": "array",
      "maxItems": 7,
      "uniqueItems": true,
      "items": {
        "$ref": "#/$defs/stepIndex"
      }
    },
    "referent": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "text",
        "catalogKey",
        "methodKind"
      ],
      "properties": {
        "kind": {
          "enum": [
            "actor",
            "subject",
            "place",
            "object",
            "form",
            "method"
          ]
        },
        "text": {
          "type": "string",
          "minLength": 1,
          "maxLength": 500
        },
        "catalogKey": {
          "type": [
            "string",
            "null"
          ],
          "maxLength": 32
        },
        "methodKind": {
          "enum": [
            null,
            "approach",
            "capability",
            "spell",
            "item",
            "tool",
            "other"
          ]
        }
      }
    },
    "step": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "purpose",
        "goal",
        "evidence",
        "actor",
        "targets",
        "method",
        "results",
        "after",
        "parallel",
        "when"
      ],
      "properties": {
        "kind": {
          "enum": [
            "action",
            "question",
            "discussion",
            "correction",
            "preparation"
          ]
        },
        "purpose": {
          "enum": [
            null,
            "relocate_actor",
            "exchange_information",
            "influence_actor",
            "discover_information",
            "observe_situation",
            "manipulate_object",
            "apply_capability",
            "make_purchase",
            "change_resource",
            "recover",
            "wait_for_change",
            "choose_course",
            "other"
          ]
        },
        "goal": {
          "type": "string",
          "minLength": 1,
          "maxLength": 500
        },
        "evidence": {
          "$ref": "#/$defs/evidence"
        },
        "actor": {
          "$ref": "#/$defs/optionalIndex"
        },
        "targets": {
          "type": "array",
          "maxItems": 8,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "ref",
              "role"
            ],
            "properties": {
              "ref": {
                "$ref": "#/$defs/index"
              },
              "role": {
                "enum": [
                  "recipient",
                  "subject",
                  "object",
                  "origin",
                  "destination",
                  "area"
                ]
              }
            }
          }
        },
        "method": {
          "$ref": "#/$defs/optionalIndex"
        },
        "results": {
          "type": "array",
          "maxItems": 8,
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 500
          }
        },
        "after": {
          "$ref": "#/$defs/links"
        },
        "parallel": {
          "$ref": "#/$defs/links"
        },
        "when": {
          "anyOf": [
            {
              "type": "null"
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "predicate",
                "step",
                "requirement"
              ],
              "properties": {
                "predicate": {
                  "enum": [
                    "completed",
                    "succeeded",
                    "failed",
                    "impossible",
                    "declined",
                    "interrupted",
                    "selected",
                    "state",
                    "event"
                  ]
                },
                "step": {
                  "$ref": "#/$defs/optionalStep"
                },
                "requirement": {
                  "type": [
                    "string",
                    "null"
                  ],
                  "maxLength": 500
                }
              }
            }
          ]
        }
      }
    },
    "observation": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "step",
        "observer",
        "observerKind",
        "method",
        "form",
        "viewpointAfter",
        "subject",
        "origin",
        "facet",
        "valueKind",
        "precision",
        "evidence"
      ],
      "properties": {
        "step": {
          "$ref": "#/$defs/stepIndex"
        },
        "observer": {
          "$ref": "#/$defs/index"
        },
        "observerKind": {
          "enum": [
            "character",
            "familiar",
            "sensor",
            "ally"
          ]
        },
        "method": {
          "$ref": "#/$defs/index"
        },
        "form": {
          "$ref": "#/$defs/optionalIndex"
        },
        "viewpointAfter": {
          "$ref": "#/$defs/optionalStep"
        },
        "subject": {
          "$ref": "#/$defs/index"
        },
        "origin": {
          "$ref": "#/$defs/optionalIndex"
        },
        "facet": {
          "enum": [
            "surface_description",
            "apparent_classification",
            "identity",
            "spatial_relation",
            "contents",
            "activity",
            "presence",
            "quantity",
            "extent",
            "condition",
            "signal",
            "other_observable"
          ]
        },
        "valueKind": {
          "enum": [
            "description",
            "classification",
            "identity_ref",
            "measurement",
            "measurement_range",
            "measurement_or_relation",
            "relation",
            "boolean",
            "count",
            "set",
            "statement"
          ]
        },
        "precision": {
          "enum": [
            "ordinary",
            "bounded",
            "exact"
          ]
        },
        "evidence": {
          "$ref": "#/$defs/evidence"
        }
      }
    }
  }
} as const;
