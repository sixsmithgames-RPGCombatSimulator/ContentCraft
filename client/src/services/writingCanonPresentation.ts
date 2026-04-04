import type {
  WritingCanonBlockReport,
  WritingCanonProjectReport,
} from '../../../src/shared/canon/writingCanon';

const pluralize = (count: number, singular: string, plural?: string): string =>
  `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;

export function getWritingCanonBadge(report?: WritingCanonBlockReport | null): {
  label: string;
  className: string;
} | null {
  if (!report) return null;

  if (report.conflictCount > 0) {
    return {
      label: pluralize(report.conflictCount, 'tension'),
      className: 'bg-amber-50 text-amber-800 border border-amber-200',
    };
  }

  if (report.ambiguityCount > 0) {
    return {
      label: pluralize(report.ambiguityCount, 'check'),
      className: 'bg-yellow-50 text-yellow-800 border border-yellow-200',
    };
  }

  if (report.additiveCount > 0) {
    return {
      label: pluralize(report.additiveCount, 'new detail'),
      className: 'bg-slate-100 text-slate-700 border border-slate-200',
    };
  }

  if (report.matchedEntityCount > 0) {
    return {
      label: 'Canon checked',
      className: 'bg-blue-50 text-blue-700 border border-blue-100',
    };
  }

  return null;
}

export function getWritingCanonBlockSummary(report?: WritingCanonBlockReport | null): string {
  if (!report) return 'No canon signals for this block yet.';
  if (report.conflictCount > 0 || report.ambiguityCount > 0) {
    const total = report.conflictCount + report.ambiguityCount;
    return `Possible canon tension in ${pluralize(total, 'detail')}.`;
  }
  if (report.additiveCount > 0) {
    return `${pluralize(report.additiveCount, 'detail')} may be new to canon.`;
  }
  if (report.matchedEntityCount > 0) {
    return `Checked against ${pluralize(report.matchedEntityCount, 'linked entity')}.`;
  }
  return 'No canon signals for this block yet.';
}

export function getWritingCanonProjectSummary(report?: WritingCanonProjectReport | null): string {
  if (!report) return 'Canon check has not run yet.';

  if (report.summary.conflictCount > 0 || report.summary.ambiguityCount > 0) {
    const total = report.summary.conflictCount + report.summary.ambiguityCount;
    return `Canon check found ${pluralize(total, 'possible tension')} across ${pluralize(report.summary.flaggedBlockCount, 'block')}.`;
  }

  if (report.summary.additiveCount > 0) {
    return `${pluralize(report.summary.additiveCount, 'detail')} may be new canon across ${pluralize(report.summary.flaggedBlockCount, 'block')}.`;
  }

  if (report.summary.matchedBlockCount > 0) {
    return `Canon check found no tensions across ${pluralize(report.summary.matchedBlockCount, 'block')}.`;
  }

  if (report.summary.scannedBlockCount > 0) {
    return 'Canon check did not find direct canon references in the scanned writing yet.';
  }

  return 'Add or draft some writing to scan against your canon.';
}
