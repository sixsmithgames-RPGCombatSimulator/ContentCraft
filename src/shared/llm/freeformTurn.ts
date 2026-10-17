/** Owner-generated workflow projection, never a model-authored contract. */
export const FREEFORM_TURN_VERSION = 'gma.freeform-turn/1';
export const FREEFORM_DECISION_VERSION = 'gma.freeform-clarification/1';
export const FREEFORM_WINDOW_MAXIMUM = 64;
export const FREEFORM_DECISION_MAXIMUM = 2;
export const FREEFORM_ANSWER_MAXIMUM_BYTES = 2_048;
/** One accepted consequential question and its immutable human-answer link. */
export interface FreeformDecision {
  schemaVersion: typeof FREEFORM_DECISION_VERSION;
  ticketRef: string; questionDigest: string; question: string;
  originalInstructionRef: string; answerInstructionRef: string | null;
}
/** One bounded instruction segment, not evidence of completed gameplay. */
export interface FreeformWindow {
  windowId: string; ordinal: number; instructionRef: string;
  parentProgramRef: string | null; ticketRef: string | null; programRef: string | null;
  pendingDecision: FreeformDecision | null;
  status: 'awaiting_reply' | 'awaiting_clarification' | 'plan_saved' | 'completed' | 'retired';
}
/** Root lineage referencing exact windows and their protected programs. */
export interface FreeformTurn {
  schemaVersion: typeof FREEFORM_TURN_VERSION; turnId: string; campaignId: string;
  rootInstructionRef: string; revision: number; status: 'active' | 'completed' | 'retired';
  activeWindowRef: string; windows: FreeformWindow[];
}
const closed = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value);
const nullableId = (value: unknown) => value === null || id(value);
/** Closed workflow validation prevents browser progress from becoming authority. */
export function freeformTurnIssues(value: unknown): string[] {
  if (!closed(value, ['schemaVersion', 'turnId', 'campaignId', 'rootInstructionRef', 'revision', 'status', 'activeWindowRef', 'windows'])) return ['/'];
  const issues: string[] = [];
  if (value.schemaVersion !== FREEFORM_TURN_VERSION || ![value.turnId, value.campaignId, value.rootInstructionRef, value.activeWindowRef].every(id)
    || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1
    || typeof value.status !== 'string' || !['active', 'completed', 'retired'].includes(value.status)) issues.push('/binding');
  if (!Array.isArray(value.windows) || !value.windows.length || value.windows.length > FREEFORM_WINDOW_MAXIMUM) return [...issues, '/windows'];
  const seen = new Set<string>();
  value.windows.forEach((row: unknown, index: number) => {
    if (!closed(row, ['windowId', 'ordinal', 'instructionRef', 'parentProgramRef', 'ticketRef', 'programRef', 'pendingDecision', 'status'])
      || !id(row.windowId) || !id(row.instructionRef) || row.ordinal !== index + 1 || seen.has(row.windowId)
      || ![row.parentProgramRef, row.ticketRef, row.programRef].every(nullableId)
      || typeof row.status !== 'string' || !['awaiting_reply', 'awaiting_clarification', 'plan_saved', 'completed', 'retired'].includes(row.status)) { issues.push(`/windows/${index}`); return; }
    seen.add(row.windowId);
    if (row.pendingDecision !== null) {
      const d = row.pendingDecision;
      if (!closed(d, ['schemaVersion', 'ticketRef', 'questionDigest', 'question', 'originalInstructionRef', 'answerInstructionRef'])
        || d.schemaVersion !== FREEFORM_DECISION_VERSION || !id(d.ticketRef) || !id(d.originalInstructionRef)
        || !nullableId(d.answerInstructionRef) || typeof d.questionDigest !== 'string' || !/^[a-f0-9]{64}$/.test(d.questionDigest)
        || typeof d.question !== 'string' || !d.question.trim() || d.question.length > 500) issues.push(`/windows/${index}/pendingDecision`);
    }
  });
  if (typeof value.activeWindowRef !== 'string' || !seen.has(value.activeWindowRef)) issues.push('/activeWindowRef');
  return issues;
}
