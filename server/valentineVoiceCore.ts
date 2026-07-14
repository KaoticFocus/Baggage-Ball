import OpenAI from 'openai';

export const VALENTINE_VOICE_LIMITS = {
  MAX_PLAYER_TEXT: 280,
  MAX_RECENT_LINES: 5,
  MAX_RECENT_LINE_LENGTH: 90,
  HARD_MAX_CHARS: 90,
  TARGET_MIN_CHARS: 45,
  TARGET_MAX_CHARS: 75,
  COMBINED_TIMEOUT_MS: 8000,
} as const;

export type ValentineVoiceEventType = 'typedResponse' | 'outburst' | 'postMatch';

export type ValentineVoiceGameState = {
  playerScore: number;
  opponentScore: number;
  rally: number;
  mood: string;
  trust: number;
  resentment: number;
  attachment: number;
  chaos: number;
};

export type ValentineVoiceRequest = {
  eventType: ValentineVoiceEventType;
  playerText?: string;
  gameState: ValentineVoiceGameState;
  recentLines: string[];
};

export type ValentineVoiceSuccess = {
  ok: true;
  text: string;
  source: 'openai';
};

export type ValentineVoiceFailure = {
  ok: false;
  error: string;
  text?: string;
};

export type ValentineVoiceResponse = ValentineVoiceSuccess | ValentineVoiceFailure;

const ALLOWED_EVENT_TYPES = new Set<ValentineVoiceEventType>([
  'typedResponse',
  'outburst',
  'postMatch',
]);

const FALLBACK_LINES = [
  'You missed me. Emotionally accurate.',
  'I heard you. I chose suffering anyway.',
  'Every bounce is intimacy. Prove it.',
  'Say you still care. Even now.',
  'I am the rally. You are the risk.',
] as const;

function isDevLogEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function logDev(message: string, details?: Record<string, unknown>): void {
  if (!isDevLogEnabled()) return;
  if (details) {
    console.log(`[valentine-voice] ${message}`, details);
    return;
  }
  console.log(`[valentine-voice] ${message}`);
}

function missingEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  return missing;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function sanitizeText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeMood(value: unknown): string {
  const mood = sanitizeText(value, 32).toLowerCase();
  return mood || 'clingy';
}

function normalizeLine(text: string): string {
  return text
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSafeLine(text: string): boolean {
  if (!text) return false;
  if (text.length > VALENTINE_VOICE_LIMITS.HARD_MAX_CHARS) return false;
  if (/```|stage direction|\(.{12,}\)|\*.+\*/i.test(text)) return false;
  if (/\b(as an ai|language model|openai|elevenlabs)\b/i.test(text)) return false;
  return true;
}

export function parseValentineVoiceRequest(body: unknown): ValentineVoiceRequest | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const eventType = sanitizeText(raw.eventType, 24) as ValentineVoiceEventType;
  if (!ALLOWED_EVENT_TYPES.has(eventType)) return null;

  const gameStateRaw =
    raw.gameState && typeof raw.gameState === 'object'
      ? (raw.gameState as Record<string, unknown>)
      : {};

  const recentLinesRaw = Array.isArray(raw.recentLines) ? raw.recentLines : [];

  return {
    eventType,
    playerText: sanitizeText(raw.playerText, VALENTINE_VOICE_LIMITS.MAX_PLAYER_TEXT),
    gameState: {
      playerScore: clampInt(gameStateRaw.playerScore, 0, 99, 0),
      opponentScore: clampInt(gameStateRaw.opponentScore, 0, 99, 0),
      rally: clampInt(gameStateRaw.rally, 0, 9999, 0),
      mood: sanitizeMood(gameStateRaw.mood),
      trust: clampInt(gameStateRaw.trust, 0, 100, 50),
      resentment: clampInt(gameStateRaw.resentment, 0, 100, 50),
      attachment: clampInt(gameStateRaw.attachment, 0, 100, 50),
      chaos: clampInt(gameStateRaw.chaos, 0, 100, 50),
    },
    recentLines: recentLinesRaw
      .slice(0, VALENTINE_VOICE_LIMITS.MAX_RECENT_LINES)
      .map((line) => sanitizeText(line, VALENTINE_VOICE_LIMITS.MAX_RECENT_LINE_LENGTH))
      .filter(Boolean),
  };
}

function buildPrompt(request: ValentineVoiceRequest): string {
  const context = {
    eventType: request.eventType,
    playerText: request.playerText || undefined,
    gameState: request.gameState,
    recentLines: request.recentLines,
    character: {
      name: 'Valentine',
      role: 'sentient Pong ball',
      traits: ['funny', 'possessive', 'theatrical', 'unstable', 'self-aware'],
    },
    rules: [
      'Write exactly one Valentine line as spoken dialogue.',
      'One sentence preferred; two very short sentences maximum.',
      'Target 45-75 characters. Hard maximum 90 characters.',
      'Prefer 6-14 spoken words.',
      'Sharp, game-specific comedy. Paddle hits are affection; misses are betrayal.',
      'Never write narration or stage directions.',
      'Never mention being an AI.',
      'Do not repeat the player verbatim.',
      'No sexual content, threats of real violence, or slurs.',
      'Return JSON only: {"line":"..."}',
    ],
    brevityExamples: [
      {
        insteadOf: 'You let that happen. I feel seen and abandoned.',
        prefer: 'You missed me. Emotionally accurate.',
      },
      {
        insteadOf: 'Every other ball gets your full attention. I get leftovers.',
        prefer: 'Orb gets focus. I get emotional leftovers.',
      },
    ],
  };

  return JSON.stringify(context);
}

async function generateValentineLine(
  client: OpenAI,
  model: string,
  request: ValentineVoiceRequest,
  regenerate = false
): Promise<string> {
  const completion = await client.chat.completions.create({
    model,
    temperature: regenerate ? 0.65 : 0.9,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You write ultra-brief in-character dialogue for Valentine, a sentient Pong ball. Return JSON only.',
      },
      {
        role: 'user',
        content: buildPrompt(request) + (regenerate ? '\n\nPrevious attempt was too long. Cut length by half.' : ''),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Empty OpenAI response');

  const parsed = JSON.parse(content) as { line?: string };
  return normalizeLine(String(parsed.line ?? ''));
}

async function resolveValentineText(
  client: OpenAI,
  model: string,
  request: ValentineVoiceRequest
): Promise<string> {
  let line = await generateValentineLine(client, model, request, false);
  if (!isSafeLine(line)) {
    line = await generateValentineLine(client, model, request, true);
  }

  if (!isSafeLine(line)) {
    if (line.length > VALENTINE_VOICE_LIMITS.HARD_MAX_CHARS) {
      line = line.slice(0, VALENTINE_VOICE_LIMITS.HARD_MAX_CHARS - 1).trimEnd() + '…';
    }
  }

  if (!isSafeLine(line)) {
    return pickFallbackLine(request);
  }

  return line;
}

function pickFallbackLine(request: ValentineVoiceRequest): string {
  const seed =
    request.gameState.playerScore +
    request.gameState.opponentScore +
    request.gameState.rally +
    request.recentLines.length;
  return FALLBACK_LINES[seed % FALLBACK_LINES.length];
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function handleValentineVoiceRequest(
  request: ValentineVoiceRequest
): Promise<ValentineVoiceResponse> {
  logDev('function called', {
    eventType: request.eventType,
    hasPlayerText: Boolean(request.playerText),
  });

  const missing = missingEnvVars();
  if (missing.length > 0) {
    console.error('[valentine-voice] missing environment variables', { missing });
    return { ok: false, error: 'Voice generation unavailable' };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  try {
    const generatedText = await withTimeout(
      resolveValentineText(client, model, request),
      VALENTINE_VOICE_LIMITS.COMBINED_TIMEOUT_MS,
      'OpenAI'
    );
    logDev('generated text', { text: generatedText, length: generatedText.length });

    return {
      ok: true,
      text: generatedText,
      source: 'openai',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Voice generation unavailable';
    console.error('[valentine-voice] generation failed', { message });
    return { ok: false, error: 'Voice generation unavailable' };
  }
}
