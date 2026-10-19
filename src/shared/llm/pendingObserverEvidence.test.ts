import { expect, it } from 'vitest';
import { pendingObserverFormMatches } from './pendingObserverEvidence.js';

it.each([
  [{}, true], [{ formRef: null, formTargetId: null }, true],
  [{ formRef: 'vcs:form:rat', formTargetId: 'requested:rat' }, true],
  [{ formRef: null, formTargetId: 'requested:rat' }, false],
  [{ formRef: 'vcs:form:owl', formTargetId: 'requested:owl' }, false],
])('keeps omitted form distinct from an explicit requested form: %j', (group, expected) => {
  expect(pendingObserverFormMatches(group, { formRef: 'vcs:form:rat' })).toBe(expected);
});
