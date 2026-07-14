/**
 * Client for Valentine's OpenAI text generation (custom/outburst/post-match lines).
 * Speech synthesis is handled separately by speakValentineLine → character-speech.
 */

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

export type ValentineVoiceResult = {
  ok: boolean;
  text: string;
  source: 'openai' | 'fallback';
  message?: string;
};

type ValentineVoiceApiResponse = {
  ok?: boolean;
  text?: string;
  source?: 'openai';
  error?: string;
};

const VALENTINE_VOICE_URL = '/.netlify/functions/valentine-voice';
const REQUEST_TIMEOUT_MS = 8000;
const SESSION_COOLDOWN_MS = 12000;
const MAX_PLAYER_TEXT = 280;
const MAX_RECENT_LINES = 5;

const FALLBACK_LINES = [
  'You missed me. Emotionally accurate.',
  'I heard you. I chose suffering anyway.',
  'Every bounce is intimacy. Prove it.',
  'Say you still care. Even now.',
  'I am the rally. You are the risk.',
] as const;

let inFlightController: AbortController | null = null;
let lastCompletedAt = 0;
let lastRequestFingerprint = '';

function logDev(message: string, details?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (details) {
    console.log(`[ValentineVoice] ${message}`, details);
    return;
  }
  console.log(`[ValentineVoice] ${message}`);
}

function normalizeFingerprint(payload: ValentineVoiceRequest): string {
  return [
    payload.eventType,
    (payload.playerText ?? '').trim().toLowerCase(),
    payload.gameState.mood,
    payload.gameState.playerScore,
    payload.gameState.opponentScore,
    payload.gameState.rally,
  ].join('|');
}

function pickFallbackLine(payload: ValentineVoiceRequest): string {
  const seed =
    payload.gameState.playerScore +
    payload.gameState.opponentScore +
    payload.gameState.rally +
    payload.recentLines.length;
  return FALLBACK_LINES[seed % FALLBACK_LINES.length];
}

function sanitizePayload(payload: ValentineVoiceRequest): ValentineVoiceRequest {
  return {
    eventType: payload.eventType,
    playerText: payload.playerText?.trim().slice(0, MAX_PLAYER_TEXT),
    gameState: {
      playerScore: Math.max(0, Math.min(99, Math.round(payload.gameState.playerScore))),
      opponentScore: Math.max(0, Math.min(99, Math.round(payload.gameState.opponentScore))),
      rally: Math.max(0, Math.min(9999, Math.round(payload.gameState.rally))),
      mood: payload.gameState.mood.trim().slice(0, 32) || 'clingy',
      trust: Math.max(0, Math.min(100, Math.round(payload.gameState.trust))),
      resentment: Math.max(0, Math.min(100, Math.round(payload.gameState.resentment))),
      attachment: Math.max(0, Math.min(100, Math.round(payload.gameState.attachment))),
      chaos: Math.max(0, Math.min(100, Math.round(payload.gameState.chaos))),
    },
    recentLines: payload.recentLines
      .slice(0, MAX_RECENT_LINES)
      .map((line) => line.trim().slice(0, 90))
      .filter(Boolean),
  };
}

export function canRequestValentineVoice(payload: ValentineVoiceRequest): boolean {
  if (inFlightController) return false;
  const fingerprint = normalizeFingerprint(payload);
  const now = Date.now();
  if (fingerprint === lastRequestFingerprint && now - lastCompletedAt < SESSION_COOLDOWN_MS) {
    return false;
  }
  return true;
}

function buildResultFromApi(
  data: ValentineVoiceApiResponse,
  sanitized: ValentineVoiceRequest
): ValentineVoiceResult {
  const spokenText = data.text?.trim();

  if (data.ok && spokenText) {
    if (spokenText.length > 90) {
      logDev('rejected overlong line from server');
      return {
        ok: false,
        text: pickFallbackLine(sanitized),
        source: 'fallback',
        message: 'Generated line too long',
      };
    }

    return {
      ok: true,
      text: spokenText,
      source: data.source ?? 'openai',
    };
  }

  const fallbackText = spokenText || pickFallbackLine(sanitized);
  return {
    ok: false,
    text: fallbackText,
    source: spokenText ? 'openai' : 'fallback',
    message: data.error ?? 'Voice generation failed',
  };
}

export async function requestValentineVoice(
  payload: ValentineVoiceRequest
): Promise<ValentineVoiceResult> {
  const sanitized = sanitizePayload(payload);
  const fingerprint = normalizeFingerprint(sanitized);

  logDev('requesting text', {
    eventType: sanitized.eventType,
    url: VALENTINE_VOICE_URL,
  });

  if (inFlightController) {
    logDev('request blocked — another request is in flight');
    return {
      ok: false,
      text: pickFallbackLine(sanitized),
      source: 'fallback',
      message: 'Duplicate in-flight request',
    };
  }

  if (
    fingerprint === lastRequestFingerprint &&
    Date.now() - lastCompletedAt < SESSION_COOLDOWN_MS
  ) {
    logDev('request blocked — session cooldown active');
    return {
      ok: false,
      text: pickFallbackLine(sanitized),
      source: 'fallback',
      message: 'Cooldown active',
    };
  }

  const controller = new AbortController();
  inFlightController = controller;
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(VALENTINE_VOICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitized),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data: ValentineVoiceApiResponse = {};
    try {
      data = (await response.json()) as ValentineVoiceApiResponse;
    } catch {
      data = {};
    }

    logDev('function response', {
      httpStatus: response.status,
      source: data.source,
      ok: data.ok,
      text: data.text,
      error: data.error,
    });

    const result = buildResultFromApi(data, sanitized);

    if (result.ok) {
      lastRequestFingerprint = fingerprint;
      lastCompletedAt = Date.now();
    }

    if (!response.ok && import.meta.env.DEV) {
      console.warn(`[ValentineVoice] HTTP ${response.status}`, result.message);
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    logDev('request failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      text: pickFallbackLine(sanitized),
      source: 'fallback',
      message: 'Voice request failed',
    };
  } finally {
    if (inFlightController === controller) {
      inFlightController = null;
    }
  }
}
