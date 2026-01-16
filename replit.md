# Fitness Tracker

## Overview

A full-stack fitness tracking application that allows users to log daily fitness metrics (steps, calories, weight) and perform AI-powered workout sessions with real-time pose detection. The app uses TensorFlow.js for pose detection during exercises like push-ups and squats, providing rep counting and performance grading.

### Neon Run Game Mode

The app includes "Neon Run" - a neon-themed side-scrolling game controlled by body movements:
- **Running**: Jog in place facing the camera to make the character run (detects vertical shoulder oscillation)
- **Jump**: Raise arms above shoulders to jump over enemies
- **Pushup Revival**: When health depletes, 30-second challenge to do 10 pushups to revive with 50% health

#### Game Features:
- **3 Difficulty Levels**: Easy, Medium, Hard - affecting speed, enemy spawn rate, and damage
- **5 Unlockable Stages**: Progressive difficulty with increasing target scores (500-3000 points)
- **3 Enemy Types**: Walkers (ground), Flyers (aerial), Bouncers (jumping)
- **Movement System**: Character only moves when player jogs; enemies slow to 50% when player stops
- **Stage Progression**: Complete stages to unlock the next; progress saved to localStorage
- **Neon Aesthetic**: Purple/pink gradient sky, glowing player, colored enemies by type

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state caching and synchronization
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom dark theme (red/black fitness aesthetic)
- **Charts**: Recharts for fitness data visualization
- **Pose Detection**: TensorFlow.js with @tensorflow-models/pose-detection for real-time exercise tracking

### Backend Architecture

- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Design**: REST API with typed contracts defined in `shared/routes.ts`
- **Validation**: Zod schemas for request/response validation shared between client and server

### Data Storage

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with type-safe schema definitions
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Tables**:
  - `entries`: Daily fitness logs (steps, calories, weight, date)
  - `workout_sessions`: Exercise session records (type, difficulty, reps, grade, timing)

### Project Structure

```
├── client/               # React frontend
│   └── src/
│       ├── components/   # UI components
│       ├── hooks/        # Custom React hooks
│       ├── pages/        # Route components
│       └── lib/          # Utilities
├── server/               # Express backend
│   ├── routes.ts         # API route handlers
│   ├── storage.ts        # Database operations
│   └── db.ts             # Database connection
├── shared/               # Shared code between client/server
│   ├── schema.ts         # Drizzle table definitions
│   └── routes.ts         # API contract definitions
└── migrations/           # Database migrations
```

### Key Design Patterns

1. **Type-Safe API Contract**: Routes and schemas defined in `shared/` folder ensure type consistency across the stack
2. **Database Storage Abstraction**: `IStorage` interface in `server/storage.ts` abstracts database operations
3. **Component-Based UI**: Modular React components with shadcn/ui design system
4. **Pose Detection Hook**: Custom `usePoseDetection` hook encapsulates TensorFlow.js logic for exercise tracking

## External Dependencies

### Database

- PostgreSQL database (connection via `DATABASE_URL` environment variable)
- Drizzle Kit for migrations (`npm run db:push`)

### AI/ML Services

- TensorFlow.js (`@tensorflow/tfjs`) - Client-side machine learning runtime
- Pose Detection Model (`@tensorflow-models/pose-detection`) - MoveNet model for body pose estimation

### UI Libraries

- Radix UI - Accessible component primitives
- shadcn/ui - Pre-built component library
- Recharts - Chart visualization
- Lucide React - Icon library

### Build Tools

- Vite - Frontend bundler with HMR
- esbuild - Server-side bundling for production
- TypeScript - Type checking across the stack