# Baggage Ball

**Every ball has emotional baggage. And they are all your problem.**

A darkly funny arcade comedy prototype — paddle, rally, and negotiate with sentient emotionally unstable balls.

> **Local dev only.** This setup is for Keith's Mac mini. Not ready for public deployment with runtime AI.

## Quick Start (Mac mini)

```bash
npm install
cp .env.example .env
# Edit .env — add OPENAI_API_KEY

npm run dev
```

- **Game:** http://localhost:5173  
- **Local AI server:** http://localhost:8787/health  

`npm run dev` starts **both** the Vite game and the local AI server via `concurrently`.

## Environment (.env)

Create a root `.env` file (never commit it):

```
OPENAI_API_KEY=sk-your-real-key-here
OPENAI_MODEL=gpt-4o-mini
LOCAL_AI_PORT=8787
```

**Security:** The OpenAI key is read via `process.env` in Node scripts and the local AI server only. It is **never** in Vite/Phaser/browser code. No `VITE_OPENAI_*` variables.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Game + local AI server |
| `npm run dev:game` | Vite only (port 5173) |
| `npm run dev:ai` | AI server only (port 8787) |
| `npm run ai:generate-dialogue` | Offline OpenAI dialogue matrix generator |
| `npm run build` | Production build |

## Generate Dialogue Matrix (Offline)

```bash
npm run ai:generate-dialogue
```

Writes `src/game/data/generatedDialogueEvents.ts`. Requires `OPENAI_API_KEY`.

Options:
```bash
npm run ai:generate-dialogue -- --ball=valentine
npm run ai:generate-dialogue -- --model=gpt-4o
npm run generate:dialogue:dry
```

The game **prefers generated dialogue** when that file has content; otherwise uses hand-authored lines in `src/game/data/dialogues/`.

## Controls

| Input | Action |
|-------|--------|
| Mouse / ← → | Move paddle |
| **T** | Toggle Voice / Text mode |
| **1–4** | Select canned response during hover |
| **✎ Type my own response** | Custom typed response (AI-classified) |
| **Enter / Send** | Submit custom response |

### Debug Controls

| Key | Action |
|-----|--------|
| **H** | Force random hover |
| **V** | Force clingy hover |
| **M** | Force mode-switch dialogue |
| **R** | +15 resentment |
| **C** | +15 chaos |

## AI Features (Local)

| Feature | Requires AI server | Requires OPENAI_API_KEY | Fallback |
|---------|-------------------|------------------------|----------|
| Canned dialogue | No | No | Hand-authored matrix |
| Generated dialogue | No | Only for generation script | Hand-authored |
| Custom typed response | Yes | Yes | Mild stat change + funny fallback line |
| AI end-of-round recap | Yes | Yes | Local RecapSystem |

### Custom Response Fallback

If the AI server is down:
> "The ball squints at your response, but the local AI server is apparently having a small breakdown."

Game continues — no crash.

## Architecture

```
server/
  local-ai-server.ts     POST /api/classify-response, /api/generate-recap
  schemas.ts             Zod validation
src/game/
  services/LocalAiClient.ts   Browser → localhost:8787
  systems/BallEmotionDirector.ts
  data/
    generatedDialogueEvents.ts   AI-generated (optional)
    dialogueRegistry.ts          Prefers generated when present
scripts/
  generateDialogueMatrix.ts      Offline content generation
```

## Balls

| Ball | Title | Vibe |
|------|-------|------|
| **Orb** | Diva Existentialist | Theatrical, demands praise |
| **Bolt** | Moody Bad-Day Ball | Irritable, wants quiet |
| **Valentine** | Over-Attached Ex-Ball | Clingy, streamer-worthy chaos |

---

*In 1972, Pong gave us the ball. In 2026, the ball has questions.*
