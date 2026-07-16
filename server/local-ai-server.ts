/**
 * Baggage Ball local AI server — Node only. Never bundled into Vite/browser.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import {
  classifyRequestSchema,
  classifyResponseSchema,
  recapRequestSchema,
  recapResponseSchema,
} from './schemas.js';

import {
  handleCharacterSpeechRequest,
  parseCharacterSpeechRequest,
} from './characterSpeechCore.js';

import {
  handleValentineVoiceRequest,
  parseValentineVoiceRequest,
} from './valentineVoiceCore.js';

import {
  handleGenerateLoadoutLineRequest,
  parseGenerateLoadoutLineRequest,
} from './generateLoadoutLineCore.js';

const PORT = Number(process.env.LOCAL_AI_PORT ?? 8787);
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const app = express();

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  })
);
app.use(express.json({ limit: '32kb' }));

function requireOpenAI(res: express.Response): OpenAI | null {
  if (!OPENAI_API_KEY) {
    res.status(503).json({
      error: 'OPENAI_API_KEY is not configured. Add it to your root .env file.',
    });
    return null;
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY });
}

async function callJson<T>(
  client: OpenAI,
  system: string,
  user: string,
  schemaName: string
): Promise<T> {
  const completion = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.9,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Empty OpenAI response');
  return JSON.parse(content) as T;
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    message: 'Baggage Ball local AI server is alive. The ball is already forming opinions.',
    openaiConfigured: Boolean(OPENAI_API_KEY),
    model: MODEL,
  });
});

app.post('/api/classify-response', async (req, res) => {
  const parsed = classifyRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const client = requireOpenAI(res);
  if (!client) return;

  const data = parsed.data;
  const system = `You are the local AI emotion engine for a darkly funny arcade comedy game called Baggage Ball.

The game is about sentient balls with emotional baggage. The player controls the paddle and negotiates with the ball.

Your job is to classify the player's typed response and return strict JSON with these keys:
tone, emotionalResult, ballReaction, behaviorModifier, statChanges

tone must be one of: sincere, sarcastic, absurd, boundary, flattering, provoking, apologetic, evasive, hostile, tender

behaviorModifier must be one of: helpfulCurve, hostileFakeOut, erraticBounce, speedSpike, slowDown, gentleReturn, dramaticPause, clingyDrift, resentmentShot, chaosWobble, none

statChanges should include only changed stats as integers from -30 to 30.

The ball reaction should be funny, short, emotionally specific, and consistent with the current ball personality and stats.

Do not be generic.
Do not write long speeches.
Do not moralize.
Do not break character.
Do not include markdown.
Return JSON only.`;

  const user = JSON.stringify({
    ballName: data.ballName,
    ballPersonality: data.ballPersonality,
    ballStats: data.ballStats,
    ballLine: data.ballLine,
    playerResponse: data.playerResponse,
    situation: data.situation,
  });

  try {
    const raw = await callJson<unknown>(client, system, user, 'classify');
    const validated = classifyResponseSchema.parse(raw);
    res.json(validated);
  } catch (err) {
    console.error('[classify-response]', err);
    res.status(500).json({ error: 'Failed to classify response' });
  }
});

app.post('/api/generate-recap', async (req, res) => {
  const parsed = recapRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const client = requireOpenAI(res);
  if (!client) return;

  const data = parsed.data;
  const system = `You write darkly funny end-of-round recaps for Baggage Ball.

The recap should feel like a Steam comedy game:
- witty
- specific
- slightly emotionally accusatory
- short enough to fit on a game recap screen
- personalized to the ball personality and final stats

Return JSON with keys:
relationshipStatus, emotionalDiagnosis, finalNote, worstThingThePlayerDid, replayHook

Do not include markdown.
Return JSON only.`;

  const user = JSON.stringify(data);

  try {
    const raw = await callJson<unknown>(client, system, user, 'recap');
    const validated = recapResponseSchema.parse(raw);
    res.json(validated);
  } catch (err) {
    console.error('[generate-recap]', err);
    res.status(500).json({ error: 'Failed to generate recap' });
  }
});

app.post('/api/valentine-voice', async (req, res) => {
  const request = parseValentineVoiceRequest(req.body);
  if (!request) {
    res.status(400).json({ ok: false, error: 'Invalid request body' });
    return;
  }

  const result = await handleValentineVoiceRequest(request);
  res.status(result.ok ? 200 : 503).json(result);
});

app.post('/api/character-speech', async (req, res) => {
  const request = parseCharacterSpeechRequest(req.body);
  if (!request) {
    res.status(400).json({ ok: false, error: 'Invalid request body' });
    return;
  }

  const result = await handleCharacterSpeechRequest(request);
  res.status(result.ok ? 200 : 503).json(result);
});

app.post('/api/generate-loadout-line', async (req, res) => {
  const request = parseGenerateLoadoutLineRequest(req.body);
  if (!request) {
    res.status(400).json({ ok: false, error: 'Invalid request body' });
    return;
  }

  const result = await handleGenerateLoadoutLineRequest(request);
  res.status(result.ok ? 200 : 503).json(result);
});

app.listen(PORT, () => {
  console.log(`[local-ai] http://localhost:${PORT}`);
  console.log(`[local-ai] model: ${MODEL}`);
  console.log(
    `[local-ai] OPENAI_API_KEY ${OPENAI_API_KEY ? 'loaded' : 'MISSING — add to .env'}`
  );
});
