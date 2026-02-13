/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

// import { Router } from 'express';
// import { AIServiceManager, AIRequest } from '../services/AIService.js';
// import { APIResponse } from '../../shared/types/index.js';

// export const aiRouter = Router();
// const aiManager = new AIServiceManager();

// aiRouter.get('/services', async (req, res) => {
//   try {
//     const services = aiManager.getAvailableServices();

//     const response: APIResponse<typeof services> = {
//       success: true,
//       data: services
//     };

//     res.json(response);
//   } catch (error) {
//     const response: APIResponse = {
//       success: false,
//       error: 'Failed to get AI services',
//       message: error instanceof Error ? error.message : 'Unknown error'
//     };
//     res.status(500).json(response);
//   }
// });

// aiRouter.post('/generate', async (req, res) => {
//   try {
//     const { service = 'anthropic', prompt, maxTokens, temperature, model } = req.body;

//     if (!prompt) {
//       const response: APIResponse = {
//         success: false,
//         error: 'Prompt is required'
//       };
//       return res.status(400).json(response);
//     }

//     const aiRequest: AIRequest = {
//       prompt,
//       maxTokens,
//       temperature,
//       model
//     };

//     const result = await aiManager.generateContent(service, aiRequest);

//     const response: APIResponse<typeof result> = {
//       success: true,
//       data: result
//     };

//     res.json(response);
//   } catch (error) {
//     const response: APIResponse = {
//       success: false,
//       error: 'Failed to generate content',
//       message: error instanceof Error ? error.message : 'Unknown error'
//     };
//     res.status(500).json(response);
//   }
// });

// aiRouter.post('/generate-from-template', async (req, res) => {
//   try {
//     const { templateId, variables, service = 'anthropic' } = req.body;

//     if (!templateId || !variables) {
//       const response: APIResponse = {
//         success: false,
//         error: 'Template ID and variables are required'
//       };
//       return res.status(400).json(response);
//     }

//     const response: APIResponse = {
//       success: false,
//       error: 'Template-based generation not yet implemented',
//       message: 'This feature will be available in the next version'
//     };

//     res.status(501).json(response);
//   } catch (error) {
//     const response: APIResponse = {
//       success: false,
//       error: 'Failed to generate content from template',
//       message: error instanceof Error ? error.message : 'Unknown error'
//     };
//     res.status(500).json(response);
//   }
// });