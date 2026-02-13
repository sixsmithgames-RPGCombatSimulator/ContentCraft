/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

// import axios from 'axios';

export interface AIRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface AIResponse {
  content: string;
  tokensUsed: number;
  service: string;
}

export abstract class AIService {
  abstract generateContent(request: AIRequest): Promise<AIResponse>;
  abstract isConfigured(): boolean;
  abstract getName(): string;
}

// export class AnthropicService extends AIService {
//   private apiKey: string;

//   constructor(apiKey?: string) {
//     super();
//     this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
//   }

//   isConfigured(): boolean {
//     return !!this.apiKey;
//   }

//   getName(): string {
//     return 'Anthropic Claude';
//   }

//   async generateContent(request: AIRequest): Promise<AIResponse> {
//     if (!this.isConfigured()) {
//       throw new Error('Anthropic API key not configured');
//     }

//     try {
//       const response = await axios.post(
//         'https://api.anthropic.com/v1/messages',
//         {
//           model: request.model || 'claude-3-haiku-20240307',
//           max_tokens: request.maxTokens || 1000,
//           messages: [
//             {
//               role: 'user',
//               content: request.prompt
//             }
//           ],
//           temperature: request.temperature || 0.7
//         },
//         {
//           headers: {
//             'Content-Type': 'application/json',
//             'x-api-key': this.apiKey,
//             'anthropic-version': '2023-06-01'
//           }
//         }
//       );

//       return {
//         content: response.data.content[0].text,
//         tokensUsed: response.data.usage?.input_tokens + response.data.usage?.output_tokens || 0,
//         service: this.getName()
//       };
//     } catch (error) {
//       console.error('Anthropic API error:', error);
//       throw new Error('Failed to generate content with Anthropic');
//     }
//   }
// }

// export class OpenAIService extends AIService {
//   private apiKey: string;

//   constructor(apiKey?: string) {
//     super();
//     this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
//   }

//   isConfigured(): boolean {
//     return !!this.apiKey;
//   }

//   getName(): string {
//     return 'OpenAI GPT';
//   }

//   async generateContent(request: AIRequest): Promise<AIResponse> {
//     if (!this.isConfigured()) {
//       throw new Error('OpenAI API key not configured');
//     }

//     try {
//       const response = await axios.post(
//         'https://api.openai.com/v1/chat/completions',
//         {
//           model: request.model || 'gpt-3.5-turbo',
//           messages: [
//             {
//               role: 'user',
//               content: request.prompt
//             }
//           ],
//           max_tokens: request.maxTokens || 1000,
//           temperature: request.temperature || 0.7
//         },
//         {
//           headers: {
//             'Content-Type': 'application/json',
//             'Authorization': `Bearer ${this.apiKey}`
//           }
//         }
//       );

//       return {
//         content: response.data.choices[0].message.content,
//         tokensUsed: response.data.usage?.total_tokens || 0,
//         service: this.getName()
//       };
//     } catch (error) {
//       console.error('OpenAI API error:', error);
//       throw new Error('Failed to generate content with OpenAI');
//     }
//   }
// }

// export class GoogleService extends AIService {
//   private apiKey: string;

//   constructor(apiKey?: string) {
//     super();
//     this.apiKey = apiKey || process.env.GOOGLE_API_KEY || '';
//   }

//   isConfigured(): boolean {
//     return !!this.apiKey;
//   }

//   getName(): string {
//     return 'Google Gemini';
//   }

//   async generateContent(request: AIRequest): Promise<AIResponse> {
//     if (!this.isConfigured()) {
//       throw new Error('Google API key not configured');
//     }

//     try {
//       const response = await axios.post(
//         `https://generativelanguage.googleapis.com/v1/models/${request.model || 'gemini-pro'}:generateContent?key=${this.apiKey}`,
//         {
//           contents: [
//             {
//               parts: [
//                 {
//                   text: request.prompt
//                 }
//               ]
//             }
//           ],
//           generationConfig: {
//             temperature: request.temperature || 0.7,
//             maxOutputTokens: request.maxTokens || 1000
//           }
//         },
//         {
//           headers: {
//             'Content-Type': 'application/json'
//           }
//         }
//       );

//       return {
//         content: response.data.candidates[0].content.parts[0].text,
//         tokensUsed: response.data.usageMetadata?.totalTokenCount || 0,
//         service: this.getName()
//       };
//     } catch (error) {
//       console.error('Google API error:', error);
//       throw new Error('Failed to generate content with Google');
//     }
//   }
// }

export class AIServiceManager {
  private static readonly DISABLED_MESSAGE = 'AI services are disabled.';

  // private services: Map<string, AIService> = new Map();

  // constructor() {
  //   this.services.set('anthropic', new AnthropicService());
  //   // this.services.set('openai', new OpenAIService());
  //   this.services.set('google', new GoogleService());
  // }

  getService(_serviceName: string): AIService {
    throw new Error(AIServiceManager.DISABLED_MESSAGE);
  }

  getAvailableServices(): Array<{ name: string; configured: boolean; displayName: string }> {
    return [];
  }

  async generateContent(_serviceName: string, _request: AIRequest): Promise<AIResponse> {
    throw new Error(AIServiceManager.DISABLED_MESSAGE);
  }
}