# LAB — AI Fitness Tracker

## 🔗 Live Demo
**[https://main.dfi1vofcktrh3.amplifyapp.com](https://main.dfi1vofcktrh3.amplifyapp.com)**

## Features
- Google OAuth login (per-user private data)
- AI Pose Detection — Pushups, Squats, Plank (TensorFlow.js MoveNet)
- Rep counting + Performance grading (A++ to F)
- Neon Run Game — body movement controlled side-scroller
- Boxing Mode — shadow boxing trainer
- BMI Calculator with gender-aware recommendations
- Fitness tracking dashboard (steps, calories, weight)
- All data saved to Neon PostgreSQL database

## Tech Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (Neon)
- **Auth**: Google OAuth 2.0 (Passport.js)
- **AI/ML**: TensorFlow.js + MoveNet pose detection
- **Deployment**: Render (backend) + AWS Amplify (frontend)

## Local Setup
1. Clone the repo
2. Copy `.env.example` to `.env` and fill in your credentials
3. Run:
```bash
npm install
npm run db:push
npm run dev
```
4. Open `http://localhost:5000`
