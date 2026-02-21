/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../services/api';
import GeneratorPanel, { GenerationConfig } from '../components/generator/GeneratorPanel';
import ResourcesPanel from '../components/generator/ResourcesPanel';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function Generator() {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleGenerate = async (config: GenerationConfig) => {
    setIsGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error('Failed to start generation');
      }

      const { runId } = await response.json();
      setSuccess(`Generation started! Run ID: ${runId}`);

      // Navigate to run view after a short delay
      setTimeout(() => {
        navigate(`/runs/${runId}`);
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to generate content');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Content Generator</h1>
          <p className="text-gray-600 mt-1">
            Generate content using your project resources
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Status Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-green-800">Success!</h3>
              <p className="text-sm text-green-700 mt-1">{success}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Generator */}
          <div className="lg:col-span-2">
            <GeneratorPanel onGenerate={handleGenerate} isLoading={isGenerating} />

            {/* Info Box */}
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <h3 className="font-medium text-blue-900 mb-2">How It Works</h3>
              <ol className="text-sm text-blue-800 space-y-2">
                <li>
                  <strong>1. Planner:</strong> Analyzes your prompt and identifies what canon to
                  search
                </li>
                <li>
                  <strong>2. Retriever:</strong> Finds relevant facts from your resources
                </li>
                <li>
                  <strong>3. Creator:</strong> Generates content using only retrieved facts
                </li>
                <li>
                  <strong>4. Validators:</strong> Checks D&D rules, physics, and balance
                </li>
                <li>
                  <strong>5. Stylist:</strong> Polishes the prose while keeping facts intact
                </li>
                <li>
                  <strong>6. Review:</strong> You approve any canon changes before they're saved
                </li>
              </ol>
            </div>
          </div>

          {/* Right Column: Resources */}
          <div className="lg:col-span-1">
            <ResourcesPanel projectId="default" />
          </div>
        </div>
      </div>
    </div>
  );
}
