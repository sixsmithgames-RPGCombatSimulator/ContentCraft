# ContentCraft

© 2025 Sixsmith Games. All rights reserved.

An iterative content creation app for fiction, non-fiction, D&D adventures, and fact-checked articles. ContentCraft helps writers build on ideas, iteratively refine content, fact-check information, and generate targeted prompts for AI tools.

**License**: Proprietary & Confidential

## Features

### Core Features
- **Project Management**: Organize your writing projects by type (fiction, non-fiction, D&D adventures, health advice, etc.)
- **Hierarchical Content Structure**: Break down projects into manageable content blocks
- **Version Tracking**: Keep track of content iterations and changes
- **AI Integration**: Generate content using Claude, ChatGPT, or Gemini with context-aware prompts

### Content Types
- Text and outlines
- Chapters and sections
- D&D characters, locations, and stat blocks
- Research facts and citations
- Health and safety information

### AI-Powered Features
- Template-based prompt generation
- Context-aware content suggestions
- Fact-checking workflow integration
- Multi-service AI support (Anthropic, OpenAI, Google)

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd contentcraft
```

2. Install server dependencies:
```bash
npm install
```

3. Install client dependencies:
```bash
cd client && npm install
```

4. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- Database path
- AI service API keys (optional)
- Server port and CORS settings

### Running the Application

#### Development Mode
Start both server and client in development mode:
```bash
npm run dev
```

Or run them separately:
```bash
# Terminal 1 - API Server
npm run dev:server

# Terminal 2 - React Client
npm run dev:client
```

The application will be available at:
- Frontend: http://localhost:5173
- API: http://localhost:3001

#### Production Build
```bash
npm run build
npm start
```

### Docker Deployment (Recommended) 🐳

ContentCraft is fully containerized for easy deployment. **MongoDB is included** - no external database hosting required!

See [DOCKER.md](./DOCKER.md) for complete documentation and [DATABASE_OPTIONS.md](./DATABASE_OPTIONS.md) for database configuration options.

#### Quick Start with Docker

**Prerequisites:**
- Docker Engine 20.10+
- Docker Compose 2.0+

**1. Configure environment:**
```bash
cp .env.example .env
# Edit .env and set your OPENAI_API_KEY and MONGO_ROOT_PASSWORD
```

**2. Start the application:**
```bash
# Windows
scripts\docker-start.bat

# Linux/Mac
./scripts/docker-start.sh
```

This automatically starts:
- ✅ MongoDB container (database)
- ✅ ContentCraft app container (client + server)

**3. Access the application:**
- Application: http://localhost:3000
- MongoDB: localhost:27017 (internal use only)

**4. View logs:**
```bash
docker-compose logs -f
```

**5. Stop the application:**
```bash
docker-compose down
```

> **💡 About the Database:** MongoDB runs in a Docker container automatically. You don't need Railway, MongoDB Atlas, or any external database service. Data persists in Docker volumes even when containers are stopped. See [DATABASE_OPTIONS.md](./DATABASE_OPTIONS.md) for details or if you prefer using external hosted MongoDB.

#### Docker Development Mode

For development with hot reload:

```bash
# Windows
scripts\docker-dev.bat

# Linux/Mac
./scripts/docker-dev.sh
```

Services will be available at:
- Client (with HMR): http://localhost:5173
- Server API: http://localhost:3000
- MongoDB: localhost:27017

## Project Structure

```
contentcraft/
├── src/
│   ├── server/           # Express.js API server
│   │   ├── models/       # Database models
│   │   ├── routes/       # API route handlers
│   │   ├── services/     # Business logic services
│   │   └── middleware/   # Express middleware
│   └── shared/           # Shared types and utilities
│       ├── types/        # TypeScript interfaces
│       ├── constants/    # App constants
│       └── validators/   # Zod validation schemas
├── client/               # React frontend
│   └── src/
│       ├── components/   # Reusable UI components
│       ├── pages/        # Page components
│       ├── services/     # API client services
│       └── types/        # Frontend type definitions
└── data/                 # SQLite database storage
```

## Architecture Overview

### High-Level System
- **`client/` React SPA**: Vite-powered TypeScript UI that orchestrates authoring workflows, content review flows, and resource management.
- **`src/server/` Express API**: Node.js backend that brokers persistence, orchestrates AI-assisted generation, and normalizes canon data.
- **Persistence Layer**: Hybrid **SQLite** (`data/`) for project/content authoring and **MongoDB** (configured via `src/server/config/mongo.ts`) for library-scale canon entities and generation artifacts.
- **Shared Contracts**: Cross-cutting types, constants, and validators live in `src/shared/`, ensuring both client and server operate against the same schemas.
- **AI Integrations**: Pluggable services in `src/server/services/AIService.ts` coordinate Anthropic, OpenAI, and Google providers through a common interface.

### Frontend (React + TypeScript)
- **Entry & Routing**: `client/src/App.tsx` wires React Router views for dashboarding, manual generation (`client/src/pages/ManualGenerator.tsx`), canon management, and project detail pages.
- **State & Data Fetching**: Components consume REST endpoints via local hook logic; complex flows (e.g., `client/src/components/generator/*`) manage multi-step modals for generation review, canon delta resolution, and resource uploads.
- **Type Safety**: UI contracts rely on `client/src/types/` plus shared definitions to eliminate `any` usage and enforce schema compliance across generated content and canon entities.
- **UI Composition**: Feature areas are split into focused component directories (e.g., `client/src/components/generator/` for pipeline modals, `client/src/components/canon/` for library and collection management), enabling reuse and targeted refactors.

### Server (Express + Orchestration)
- **API Composition**: `src/server/index.ts` configures middleware (CORS, Helmet, JSON parsing) and mounts REST routes from `src/server/routes/`, covering projects, content blocks, canon, and generation endpoints.
- **Orchestration Pipeline**: `src/server/orchestration/Orchestrator.ts` coordinates multi-stage generation, delegating to modular stages in `src/server/orchestration/stages/` (prompting, validation, canon alignment, etc.) and `validators/` for schema enforcement.
- **Services Layer**: Business logic lives in `src/server/services/`, notably `generatedContentMapper.ts` for normalizing AI output to the canonical NPC schema and `AIService.ts` for provider abstraction.
- **Models & Persistence**: SQLite models in `src/server/models/` handle project/content storage, while Mongo collections (`CanonEntity`, `CanonChunk`, `ProjectLibraryLink`, etc.) capture structured canon data and generation metadata.
- **Configuration**: Environment handling and provider credentials are centralized in `src/server/config/` (e.g., `env.ts`, `openai.ts`, `mongo.ts`).

### Content Generation & Review Flow
1. **Request Initiation**: Client components in `client/src/components/generator/` submit generation payloads to `/api/generator` routes.
2. **Stage-Oriented Processing**: `Orchestrator` runs ordered stages (prompting, AI invocation, mapping, validation). Each stage emits structured `GeneratedContent`, proposal lists, conflicts, and physics issues.
3. **Normalization & Mapping**: `generatedContentMapper.ts` transforms raw AI responses into normalized entities aligned to schemas under `src/server/schemas/` (e.g., `npc.schema.json`).
4. **Review UI**: Modals such as `GeneratedContentModal.tsx`, `ReviewAdjustModal.tsx`, and `CanonDeltaModal.tsx` surface proposals/conflicts to the user, enforcing type-safe adjustments before persistence.
5. **Persistence & Linking**: Approved story content saves via `/upload/approve`, landing in SQLite (content blocks) and Mongo (canon resources) with cross-link records managed by `ProjectLibraryLink` models.

### Data & Schema Governance
- **Zod/JSON Schemas**: Validation assets under `src/server/schemas/` and `src/shared/validators/` define canonical shapes for NPCs, locations, and generated resources.
- **Shared Types**: `src/shared/types/` exports interfaces consumed by both server and client builds to ensure consistent typing (e.g., `GeneratedContent`, `CanonEntity`).
- **Database Bootstrapping**: `initializeDatabase()` in `src/server/models/database.js` ensures SQLite migrations, while `connectToMongo()` performs environment-aware connection pooling and index management.

### Deployment Considerations
- **Server Startup**: `npm run build` builds client assets to `dist/`, while `npm start` launches the Express server with static asset hosting.
- **Environment Profiles**: `.env` covers both database paths and AI provider keys. Production deployments should set CORS origins, API keys, JWT secrets, and ensure Mongo connectivity.

## Architectural Policy for Future Changes

- **Honor Shared Contracts**: Add or modify data shapes in `src/shared/types/` and companion validators first. Server models, mappers, and client types must remain in sync—avoid introducing `any` or diverging schemas.
- **Stage-Based Orchestration**: Extend the generation pipeline by adding new stage modules under `src/server/orchestration/stages/` with explicit inputs/outputs. Update orchestrator configuration rather than embedding logic in routes or services.
- **Normalization First**: All AI responses must flow through `generatedContentMapper.ts` (or dedicated mappers) before storage. Guard outputs with JSON schemas to maintain canonical consistency.
- **UI Modularity**: Introduce new generator or canon features by creating scoped components within `client/src/components/{domain}/`. Reuse modal patterns and shared hooks to keep UX consistent.
- **Persistence Discipline**: Favor existing models in `src/server/models/`. When new entities are required, define SQLite tables/migrations and Mongo collections together, plus update linking logic in `ProjectLibraryLink` or analogous mapping layers.
- **Type Safety & Linting**: All new code must pass `npm run lint` and `npm run typecheck`. Avoid disabling ESLint rules—prefer type narrowing, explicit interfaces, and exhaustive switch handling.
- **Configuration Management**: Add provider credentials or feature toggles to `src/server/config/env.ts` and document them in the README. Do not hardcode secrets or environment-specific values.
- **Testing & Verification**: For orchestration changes, add stage-level unit tests or integration harnesses under `src/server/orchestration/validators/` to protect schema and business rules.
- **Documentation Updates**: Any architectural shift (new services, pipelines, data stores) must be reflected in this README and cross-referenced with runbooks (`START_SERVER.md`, `QUICKSTART.md`).

## API Documentation

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create new project
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Content Blocks
- `GET /api/content/project/:projectId` - Get content blocks for project
- `POST /api/content` - Create new content block
- `PUT /api/content/:id` - Update content block
- `DELETE /api/content/:id` - Delete content block
- `POST /api/content/reorder/:projectId` - Reorder content blocks

### AI Services
- `GET /api/ai/services` - List available AI services
- `POST /api/ai/generate` - Generate content with AI
- `POST /api/ai/generate-from-template` - Generate using templates (planned)

## Configuration

### AI Services
To use AI features, add your API keys to the `.env` file:

```env
# Optional AI service API keys
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
```

### Database
ContentCraft uses SQLite for local storage. The database is automatically created and initialized on first run.

## Development

### Scripts
- `npm run dev` - Start both server and client in development mode
- `npm run dev:server` - Start only the API server
- `npm run dev:client` - Start only the React client
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

### Adding New Features
1. Define types in `src/shared/types/`
2. Add validation schemas in `src/shared/validators/`
3. Implement database models in `src/server/models/`
4. Create API routes in `src/server/routes/`
5. Add frontend components and pages in `client/src/`

## Deployment

### Docker Deployment (Recommended)

The easiest way to deploy ContentCraft is using Docker. See [DOCKER.md](./DOCKER.md) for complete documentation.

**Production deployment:**
```bash
# Build and start
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

**Security checklist:**
- [ ] Set strong `MONGO_ROOT_PASSWORD` in `.env`
- [ ] Set unique `SESSION_SECRET` (minimum 32 characters)
- [ ] Configure HTTPS with reverse proxy (nginx/Traefik)
- [ ] Restrict MongoDB port access
- [ ] Enable firewall rules
- [ ] Set up regular database backups

### Manual Deployment

The application can also be deployed to any Node.js hosting platform. Build the project and start with `npm start`.

For production:
1. Set `NODE_ENV=production`
2. Configure MongoDB connection (`MONGO_URI`)
3. Set secure `SESSION_SECRET`
4. Configure CORS for your domain
5. Set `OPENAI_API_KEY` for AI features

## License

© 2025 Sixsmith Games. All rights reserved.

This software is proprietary and confidential. See [COPYRIGHT.md](./COPYRIGHT.md) for full copyright notice and restrictions.

**UNLICENSED** - This software may not be used, copied, modified, or distributed without explicit written permission from Sixsmith Games.

## Roadmap

### Planned Features
- Fact-checking workflow with source verification
- Advanced prompt template system
- Content export in multiple formats (PDF, Markdown, HTML)
- Collaboration features
- Publishing workflow integration
- Advanced search and filtering
- Content analytics and insights
- Plugin system for custom content types