/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React from 'react';
import { AlertTriangle, CheckCircle, FileText, Shield } from 'lucide-react';

interface LocationAccuracyPreviewProps {
  data: Record<string, unknown>;
}

const LocationAccuracyPreview: React.FC<LocationAccuracyPreviewProps> = ({ data }) => {
  const accuracyReport = data.accuracy_report as Record<string, unknown> | undefined;
  const gmNotes = (data.gm_notes || []) as Array<string>;
  const tacticalSummary = data.tactical_summary as Record<string, unknown> | undefined;

  const dimensionalIssues = (accuracyReport?.dimensional_issues || []) as Array<Record<string, unknown>>;
  const connectionIssues = (accuracyReport?.connection_issues || []) as Array<Record<string, unknown>>;
  const geometryIssues = (accuracyReport?.geometry_issues || []) as Array<Record<string, unknown>>;
  const accessibilityIssues = (accuracyReport?.accessibility_issues || []) as Array<Record<string, unknown>>;
  const recommendations = (accuracyReport?.recommendations || []) as Array<string>;

  const totalIssues = dimensionalIssues.length + connectionIssues.length + geometryIssues.length + accessibilityIssues.length;

  return (
    <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
      {/* Accuracy Report Overview */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-2">
          {totalIssues === 0 ? (
            <>
              <CheckCircle className="w-6 h-6 text-green-600" />
              <h3 className="text-lg font-semibold text-green-900">All Validation Checks Passed</h3>
            </>
          ) : (
            <>
              <AlertTriangle className="w-6 h-6 text-amber-600" />
              <h3 className="text-lg font-semibold text-gray-900">Validation Report</h3>
            </>
          )}
        </div>
        <p className="text-sm text-gray-700">
          {totalIssues === 0
            ? 'Location structure is geometrically sound and ready for use.'
            : `Found ${totalIssues} issue${totalIssues !== 1 ? 's' : ''} requiring attention.`}
        </p>
      </div>

      {/* Accuracy Report Section */}
      {accuracyReport && totalIssues > 0 && (
        <Section title="Accuracy Report" icon={<AlertTriangle className="w-5 h-5" />}>
          {dimensionalIssues.length > 0 && (
            <IssuesList
              title="Dimensional Issues"
              issues={dimensionalIssues}
              color="red"
            />
          )}

          {connectionIssues.length > 0 && (
            <IssuesList
              title="Connection Issues"
              issues={connectionIssues}
              color="orange"
            />
          )}

          {geometryIssues.length > 0 && (
            <IssuesList
              title="Geometry Issues"
              issues={geometryIssues}
              color="yellow"
            />
          )}

          {accessibilityIssues.length > 0 && (
            <IssuesList
              title="Accessibility Issues"
              issues={accessibilityIssues}
              color="blue"
            />
          )}

          {recommendations.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Recommendations</h4>
              <div className="space-y-2">
                {recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-gray-700 bg-blue-50 rounded p-2">
                    <span className="text-blue-600">💡</span>
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* GM Notes Section */}
      {gmNotes.length > 0 && (
        <Section title="GM Notes" icon={<FileText className="w-5 h-5" />}>
          <div className="space-y-3">
            {gmNotes.map((note, idx) => (
              <div key={idx} className="bg-purple-50 border-l-4 border-purple-400 p-3">
                <p className="text-sm text-gray-700">{note}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Tactical Summary Section */}
      {tacticalSummary && (
        <Section title="Tactical Summary" icon={<Shield className="w-5 h-5" />}>
          {!!(tacticalSummary.choke_points && Array.isArray(tacticalSummary.choke_points) && (tacticalSummary.choke_points as Array<unknown>).length > 0) && (
            <TacticalSubSection
              title="Choke Points"
              items={tacticalSummary.choke_points as Array<string | Record<string, unknown>>}
              color="red"
              icon="🚧"
            />
          )}

          {!!(tacticalSummary.escape_routes && Array.isArray(tacticalSummary.escape_routes) && (tacticalSummary.escape_routes as Array<unknown>).length > 0) && (
            <TacticalSubSection
              title="Escape Routes"
              items={tacticalSummary.escape_routes as Array<string | Record<string, unknown>>}
              color="green"
              icon="🚪"
            />
          )}

          {!!(tacticalSummary.defensible_positions && Array.isArray(tacticalSummary.defensible_positions) && (tacticalSummary.defensible_positions as Array<unknown>).length > 0) && (
            <TacticalSubSection
              title="Defensible Positions"
              items={tacticalSummary.defensible_positions as Array<string | Record<string, unknown>>}
              color="blue"
              icon="🛡️"
            />
          )}

          {!!(tacticalSummary.hazards && Array.isArray(tacticalSummary.hazards) && (tacticalSummary.hazards as Array<unknown>).length > 0) && (
            <TacticalSubSection
              title="Hazards"
              items={tacticalSummary.hazards as Array<string | Record<string, unknown>>}
              color="amber"
              icon="⚠️"
            />
          )}
        </Section>
      )}

      {/* Empty State */}
      {!accuracyReport && gmNotes.length === 0 && !tacticalSummary && (
        <div className="text-center py-8 text-gray-500">
          <p>No accuracy data generated yet.</p>
        </div>
      )}
    </div>
  );
};

// Helper Components
const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="text-gray-600">{icon}</div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
      </div>
      <div className="p-4 space-y-4">
        {children}
      </div>
    </div>
  );
};

const IssuesList: React.FC<{
  title: string;
  issues: Array<Record<string, unknown>>;
  color: 'red' | 'orange' | 'yellow' | 'blue';
}> = ({ title, issues, color }) => {
  const colorClasses = {
    red: 'bg-red-50 border-red-300 text-red-800',
    orange: 'bg-orange-50 border-orange-300 text-orange-800',
    yellow: 'bg-yellow-50 border-yellow-300 text-yellow-800',
    blue: 'bg-blue-50 border-blue-300 text-blue-800',
  };

  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">{title} ({issues.length})</h4>
      <div className="space-y-2">
        {issues.map((issue, idx) => (
          <div key={idx} className={`border rounded p-3 ${colorClasses[color]}`}>
            <div className="font-medium mb-1">{String(issue.space_id || issue.from_space || 'Unknown Location')}</div>
            <div className="text-sm">{String(issue.issue || issue.description || 'No description')}</div>
            {!!issue.recommendation && (
              <div className="text-xs mt-2 font-medium">
                💡 {String(issue.recommendation)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const TacticalSubSection: React.FC<{
  title: string;
  items: Array<string | Record<string, unknown>>;
  color: 'red' | 'green' | 'blue' | 'amber';
  icon: string;
}> = ({ title, items, color, icon }) => {
  const colorClasses = {
    red: 'bg-red-50 border-l-red-400',
    green: 'bg-green-50 border-l-green-400',
    blue: 'bg-blue-50 border-l-blue-400',
    amber: 'bg-amber-50 border-l-amber-400',
  };

  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
        <span>{icon}</span>
        <span>{title}</span>
      </h4>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className={`border-l-4 ${colorClasses[color]} rounded p-3`}>
            {typeof item === 'string' ? (
              <p className="text-sm text-gray-700">{item}</p>
            ) : (
              <>
                <div className="font-medium text-gray-900">{String(item.name || item.location || '')}</div>
                <p className="text-sm text-gray-700 mt-1">{String(item.description || item.details || '')}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LocationAccuracyPreview;
