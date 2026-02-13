/**
 * AI Provider Settings
 *
 * Inline settings panel for configuring the AI provider (BYO key).
 * Stored in localStorage so the developer pays nothing.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState } from 'react';
import { X, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { useAiAssistant } from '../../contexts/AiAssistantContext';
import type { AiProviderType, AiProviderConfig } from '../../contexts/AiAssistantContext';
import { getDefaultModels } from '../../services/aiProvider';

const PROVIDERS: { type: AiProviderType; label: string; description: string; helpUrl?: string }[] = [
  {
    type: 'none',
    label: 'None (Copy/Paste)',
    description: 'Generate prompts to copy into any AI. Paste responses back. Zero cost.',
  },
  {
    type: 'gemini',
    label: 'Google Gemini',
    description: 'Use your own Gemini API key. Free tier available.',
    helpUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    type: 'openai',
    label: 'OpenAI',
    description: 'Use your own OpenAI API key.',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  {
    type: 'ollama',
    label: 'Ollama (Local)',
    description: 'Run models locally with Ollama. Completely free & offline.',
    helpUrl: 'https://ollama.com',
  },
  {
    type: 'openrouter',
    label: 'OpenRouter',
    description: 'Access many models through one API key. Some free models available.',
    helpUrl: 'https://openrouter.ai/keys',
  },
];

interface AiProviderSettingsProps {
  onClose: () => void;
}

export default function AiProviderSettings({ onClose }: AiProviderSettingsProps) {
  const { providerConfig, setProviderConfig } = useAiAssistant();
  const [showKey, setShowKey] = useState(false);
  const [localConfig, setLocalConfig] = useState<AiProviderConfig>({ ...providerConfig });

  const currentProvider = PROVIDERS.find((p) => p.type === localConfig.type) || PROVIDERS[0];
  const defaultModels = getDefaultModels(localConfig.type);

  const handleSave = () => {
    setProviderConfig(localConfig);
    onClose();
  };

  const handleProviderChange = (type: AiProviderType) => {
    const models = getDefaultModels(type);
    setLocalConfig({
      type,
      apiKey: type === localConfig.type ? localConfig.apiKey : '',
      baseUrl: type === 'ollama' ? (localConfig.baseUrl || 'http://localhost:11434') : undefined,
      model: models[0] || '',
    });
  };

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">AI Provider Settings</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Provider selector */}
      <div className="space-y-2 mb-3">
        {PROVIDERS.map((provider) => (
          <label
            key={provider.type}
            className={`flex items-start gap-2 p-2 rounded cursor-pointer border transition-colors ${
              localConfig.type === provider.type
                ? 'border-primary-300 bg-primary-50'
                : 'border-transparent hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="ai-provider"
              checked={localConfig.type === provider.type}
              onChange={() => handleProviderChange(provider.type)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-gray-800">{provider.label}</span>
                {provider.helpUrl && (
                  <a
                    href={provider.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-primary-600"
                    title="Get API key"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <p className="text-xs text-gray-500">{provider.description}</p>
            </div>
          </label>
        ))}
      </div>

      {/* Provider-specific settings */}
      {localConfig.type !== 'none' && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          {/* API Key (not needed for Ollama) */}
          {localConfig.type !== 'ollama' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={localConfig.apiKey || ''}
                  onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                  placeholder={`Enter your ${currentProvider.label} API key`}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Stored locally in your browser. Never sent to our servers.
              </p>
            </div>
          )}

          {/* Base URL (Ollama only) */}
          {localConfig.type === 'ollama' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ollama URL</label>
              <input
                type="text"
                value={localConfig.baseUrl || 'http://localhost:11434'}
                onChange={(e) => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          )}

          {/* Model selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
            <div className="flex gap-1">
              <input
                type="text"
                value={localConfig.model || ''}
                onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
                placeholder="Model name"
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            {defaultModels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {defaultModels.map((model) => (
                  <button
                    key={model}
                    onClick={() => setLocalConfig({ ...localConfig, model })}
                    className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                      localConfig.model === model
                        ? 'bg-primary-100 text-primary-700 border border-primary-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'
                    }`}
                  >
                    {model}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save button */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
        <button
          onClick={handleSave}
          className="flex-1 bg-primary-600 text-white text-xs py-1.5 rounded hover:bg-primary-700 transition-colors"
        >
          Save Settings
        </button>
        <button
          onClick={onClose}
          className="flex-1 bg-gray-200 text-gray-700 text-xs py-1.5 rounded hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
