/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect } from 'react';
import { X, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';

type Proposal = {
  question?: string;
  options?: (string | { choice: string; description: string })[];
  rule_impact?: string;
  field_path?: string;
  current_value?: string;
  reason?: string;
  clarification_needed?: string;
  recommended_revision?: string;
};
type Issue = {
  severity?: string;
  description?: string;
  location?: string;
  suggestion?: string;
  new_claim?: string;
  existing_claim?: string;
  issue_type?: string;
  conflict_type?: string;
  // Additional fields from Fact Checker
  field_path?: string;
  summary?: string;
  details?: string;
  chunk_id?: string;
  canon_fact?: string;
  suggested_fix?: string;
};
interface StageOutput {
  proposals?: Proposal[];
  physics_issues?: Issue[];
  conflicts?: Issue[];
}

interface ReviewAdjustModalProps {
  isOpen: boolean;
  stageName: string;
  stageOutput?: StageOutput | null;
  onRetry: (answers: Record<string, string>, issuesToAddress: string[]) => void;
  onAccept: (answers: Record<string, string>) => void;
  onClose: () => void;
}

export default function ReviewAdjustModal({
  isOpen,
  stageName,
  stageOutput,
  onRetry,
  onAccept,
  onClose,
}: ReviewAdjustModalProps) {
  const [proposalAnswers, setProposalAnswers] = useState<Record<number, string>>({});
  const [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set());

  // Reset and initialize state when modal opens or stageOutput changes
  useEffect(() => {
    if (!isOpen) {
      // Clear state when modal closes
      setProposalAnswers({});
      setSelectedIssues(new Set());
      return;
    }

    if (stageOutput) {
      // Don't pre-fill answers - user should explicitly choose
      setProposalAnswers({});
      setSelectedIssues(new Set()); // Clear selected issues
    }
  }, [isOpen, stageOutput]);

  if (!isOpen || !stageOutput) return null;

  const proposals: Proposal[] = stageOutput?.proposals || [];
  const criticalIssues: Issue[] = [
    ...((stageOutput?.physics_issues || []).filter((i) => i.severity === 'critical')),
    ...((stageOutput?.conflicts || []).filter((c) => c.severity === 'critical')),
  ];

  const handleProposalAnswer = (index: number, answer: string) => {
    setProposalAnswers({ ...proposalAnswers, [index]: answer });
  };

  const toggleIssue = (index: number) => {
    const newSelected = new Set(selectedIssues);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIssues(newSelected);
  };

  const handleRetry = () => {
    // Collect all answered proposals
    const answers: Record<string, string> = {};
    proposals.forEach((proposal, index: number) => {
      const ans = proposalAnswers[index];
      if (ans) {
        const key = typeof proposal.question === 'string' && proposal.question.length > 0
          ? proposal.question
          : `proposal_${index}`;
        answers[key] = ans;
      }
    });

    // Collect selected issues
    const issuesToAddress: string[] = [];
    criticalIssues.forEach((issue, index: number) => {
      if (selectedIssues.has(index)) {
        const text = issue.description || issue.new_claim;
        if (typeof text === 'string' && text.length > 0) {
          issuesToAddress.push(text);
        }
      }
    });

    onRetry(answers, issuesToAddress);
  };

  const handleAccept = () => {
    // Collect all answered proposals
    const answers: Record<string, string> = {};
    proposals.forEach((proposal, index: number) => {
      const ans = proposalAnswers[index];
      if (ans) {
        const key = typeof proposal.question === 'string' && proposal.question.length > 0
          ? proposal.question
          : `proposal_${index}`;
        answers[key] = ans;
      }
    });

    onAccept(answers);
  };

  const allProposalsAnswered = proposals.every((_, i: number) => i in proposalAnswers);
  const canProceed = allProposalsAnswered && (criticalIssues.length === 0 || selectedIssues.size > 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-yellow-50 to-orange-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Review & Adjust - {stageName}</h2>
            <p className="text-sm text-gray-600 mt-1">
              Answer questions and address critical issues before proceeding
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Proposals Section */}
          {proposals.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                Questions Needing Answers ({proposals.length})
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                The AI encountered unknowns and needs your guidance. Please provide answers to continue.
              </p>
              <div className="space-y-4">
                {proposals.map((proposal, index: number) => {
                  // Debug logging
                  if (!proposal.question) {
                    console.warn(`[ReviewAdjustModal] Proposal ${index} is missing question:`, proposal);
                  }

                  return (
                  <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-900 mb-2">
                      {proposal.question || `Question ${index + 1} (no question text provided)`}
                    </h4>

                    {/* Field Path */}
                    {proposal.field_path && (
                      <p className="text-xs text-yellow-600 mb-2">
                        <strong>Field:</strong> <code className="bg-white px-1 py-0.5 rounded">{proposal.field_path}</code>
                      </p>
                    )}

                    {/* Current Value */}
                    {proposal.current_value && (
                      <div className="mb-3 p-2 bg-white border border-yellow-300 rounded">
                        <p className="text-xs font-medium text-gray-600 mb-1">Current Value:</p>
                        <p className="text-sm text-gray-800">{proposal.current_value}</p>
                      </div>
                    )}

                    {/* Reason / Clarification Needed */}
                    {(proposal.reason || proposal.clarification_needed) && (
                      <div className="mb-3 p-2 bg-yellow-100 border border-yellow-300 rounded">
                        <p className="text-xs font-medium text-yellow-800 mb-1">
                          {proposal.reason ? 'Reason:' : 'Clarification Needed:'}
                        </p>
                        <p className="text-sm text-yellow-900">
                          {proposal.reason || proposal.clarification_needed}
                        </p>
                      </div>
                    )}

                    {/* Recommended Revision */}
                    {proposal.recommended_revision && (
                      <div className="mb-3 p-2 bg-green-50 border border-green-300 rounded">
                        <p className="text-xs font-medium text-green-700 mb-1">Recommended Revision:</p>
                        <p className="text-sm text-green-900">{proposal.recommended_revision}</p>
                      </div>
                    )}

                    {/* Rule Impact */}
                    {proposal.rule_impact && (
                      <p className="text-sm text-yellow-700 mb-3">
                        <strong>Rule Impact:</strong> {proposal.rule_impact}
                      </p>
                    )}
                    <div className="space-y-2">
                      {proposal.options?.map((option: string | { choice: string; description?: string }, optIndex: number) => {
                        // Handle both string options and object options with {choice, description}
                        const optionValue = typeof option === 'string' ? option : option.choice;
                        const optionDescription = typeof option === 'object' && option.description ? option.description : null;

                        // Special handling: if this is "Use recommended revision", store the actual recommended_revision value
                        const actualValue = optionValue === 'Use recommended revision' && proposal.recommended_revision
                          ? proposal.recommended_revision
                          : optionValue;

                        // Check if this option is selected (compare against actual stored value)
                        const isSelected = proposalAnswers[index] === actualValue ||
                          (optionValue === 'Use recommended revision' && proposalAnswers[index] === proposal.recommended_revision);

                        return (
                          <label key={optIndex} className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50 border-blue-400' : 'bg-white border-yellow-200 hover:bg-yellow-50'
                          }`}>
                            <input
                              type="radio"
                              name={`proposal-${index}`}
                              checked={isSelected}
                              onChange={() => handleProposalAnswer(index, actualValue)}
                              className="mt-1 w-4 h-4 text-blue-600"
                            />
                            <div className="flex-1">
                              <span className="text-sm text-gray-800 font-medium">{optionValue}</span>
                              {optionDescription && (
                                <p className="text-xs text-gray-600 mt-1">{optionDescription}</p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                      <label className="flex items-start gap-3 p-3 bg-white border border-yellow-200 rounded cursor-pointer hover:bg-yellow-50">
                        <input
                          type="radio"
                          name={`proposal-${index}`}
                          checked={(index in proposalAnswers) && !proposal.options?.some((opt: string | { choice: string; description?: string }) => {
                            const optValue = typeof opt === 'string' ? opt : opt.choice;
                            // Check actual stored values, including recommended_revision for "Use recommended revision"
                            const actualValue = optValue === 'Use recommended revision' && proposal.recommended_revision
                              ? proposal.recommended_revision
                              : optValue;
                            return actualValue === proposalAnswers[index];
                          })}
                          onChange={() => {
                            // When clicking "Custom Answer" radio, initialize with empty string
                            handleProposalAnswer(index, '');
                          }}
                          className="mt-1 w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1">
                          <span className="text-sm text-gray-800 block mb-2">Custom Answer</span>
                          {((index in proposalAnswers) && !proposal.options?.some((opt: string | { choice: string; description?: string }) => {
                            const optValue = typeof opt === 'string' ? opt : opt.choice;
                            // Check actual stored values, including recommended_revision for "Use recommended revision"
                            const actualValue = optValue === 'Use recommended revision' && proposal.recommended_revision
                              ? proposal.recommended_revision
                              : optValue;
                            return actualValue === proposalAnswers[index];
                          })) && (
                            <input
                              type="text"
                              value={proposalAnswers[index] || ''}
                              onChange={(e) => handleProposalAnswer(index, e.target.value)}
                              placeholder="Enter your answer..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                            />
                          )}
                        </div>
                      </label>
                      
                      {/* Let AI Decide Option */}
                      <label className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                        proposalAnswers[index] === '[AI_DECIDE]' 
                          ? 'bg-purple-50 border-purple-400' 
                          : 'bg-white border-purple-200 hover:bg-purple-50'
                      }`}>
                        <input
                          type="radio"
                          name={`proposal-${index}`}
                          checked={proposalAnswers[index] === '[AI_DECIDE]'}
                          onChange={() => handleProposalAnswer(index, '[AI_DECIDE]')}
                          className="mt-1 w-4 h-4 text-purple-600"
                        />
                        <div className="flex-1">
                          <span className="text-sm text-purple-800 font-medium flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Let AI Decide
                          </span>
                          <p className="text-xs text-purple-600 mt-1">
                            Allow the AI to use its best judgment for this question
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Critical Issues Section */}
          {criticalIssues.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                Critical Issues Found ({criticalIssues.length})
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Select which issues should be addressed when retrying this stage.
              </p>
              <div className="space-y-3">
                {criticalIssues.map((issue, index: number) => (
                  <label
                    key={index}
                    className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                      selectedIssues.has(index)
                        ? 'border-red-400 bg-red-50'
                        : 'border-red-200 bg-red-50/50 hover:border-red-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIssues.has(index)}
                      onChange={() => toggleIssue(index)}
                      className="mt-1 w-5 h-5 text-red-600 rounded"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 text-xs bg-red-200 text-red-900 rounded font-medium">
                          {issue.severity || 'critical'}
                        </span>
                        <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded">
                          {issue.issue_type || issue.conflict_type || 'issue'}
                        </span>
                        {(issue.field_path || issue.location) && (
                          <code className="px-2 py-0.5 text-xs bg-gray-100 text-gray-800 rounded font-mono">
                            {issue.field_path || issue.location}
                          </code>
                        )}
                      </div>

                      {/* Summary */}
                      {issue.summary && (
                        <p className="text-sm font-bold text-red-900 mb-2">
                          {issue.summary}
                        </p>
                      )}

                      {/* Description or Details */}
                      <p className="text-sm text-gray-900 mb-3 leading-relaxed">
                        {issue.details || issue.description || issue.new_claim}
                      </p>

                      {/* Canon Fact */}
                      {(issue.canon_fact || issue.existing_claim) && (
                        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                          <p className="text-xs font-medium text-blue-900 mb-1">
                            📖 Existing Canon Rule:
                          </p>
                          <p className="text-sm text-blue-800">
                            {issue.canon_fact || issue.existing_claim}
                          </p>
                          {issue.chunk_id && (
                            <p className="text-xs text-blue-600 mt-1">
                              Source: <code className="bg-white px-1 py-0.5 rounded">{issue.chunk_id}</code>
                            </p>
                          )}
                        </div>
                      )}

                      {/* Suggested Fix */}
                      {(issue.suggested_fix || issue.suggestion) && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded">
                          <p className="text-xs font-medium text-green-900 mb-1">
                            ✅ Suggested Fix:
                          </p>
                          <p className="text-sm text-green-800">
                            {issue.suggested_fix || issue.suggestion}
                          </p>
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {(proposals.length > 0 || criticalIssues.length > 0) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">What happens next?</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Your answers will be added to the prompt</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>The AI will retry this stage with your guidance</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Critical issues will be highlighted for the AI to fix</span>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Cancel
          </button>
          <div className="flex gap-3">
            {/* Show Accept button if no proposals/issues OR if all proposals are answered */}
            {(proposals.length === 0 && criticalIssues.length === 0) || allProposalsAnswered ? (
              <button
                onClick={handleAccept}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
              >
                {allProposalsAnswered && proposals.length > 0
                  ? 'Accept with Answers & Continue'
                  : 'Accept & Continue'}
              </button>
            ) : null}
            <button
              onClick={handleRetry}
              disabled={!canProceed}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
            >
              Retry Stage with Answers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
