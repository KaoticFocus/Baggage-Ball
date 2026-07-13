/**
 * Client for Valentine's dynamic AI voice pipeline.
 * API keys and voice IDs stay server-side only.
 */

import { soundManager } from './SoundManager';

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
  audioUrl: string | null;
  durationMs: number;
  source: 'openai-elevenlabs' | 'cache' | 'text-only' | 'fallback';
  message?: string;
};

type ValentineVoiceApiResponse = {
  ok?: boolean;
  text?: string;
  audioBase64?: string;
  mimeType?: string;
  source?: 'openai-elevenlabs' | 'cache';
  durationMs?: number;
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
let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;

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

export function revokeValentineAudioUrl(url: string | null): void {
  if (!url) return;
  if (url === activeObjectUrl) {
    activeAudio?.pause();
    activeAudio = null;
    activeObjectUrl = null;
  }
  URL.revokeObjectURL(url);
}

export async function playValentineAudio(url: string, spokenText = ''): Promise<number> {
  const fallbackDuration = estimateSpeechDurationMs(spokenText);

  if (soundManager.isMuted()) {
    logDev('playback skipped — muted');
    return fallbackDuration;
  }

  soundManager.unlock();

  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }

  return new Promise<number>((resolve) => {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = soundManager.getVoiceOutputVolume();
    activeAudio = audio;
    activeObjectUrl = url;

    const finish = (durationMs: number, reason: string) => {
      logDev(reason, { durationMs });
      activeAudio = null;
      resolve(durationMs);
    };

    audio.addEventListener(
      'playing',
      () => {
        logDev('playback started');
      },
      { once: true }
    );

    audio.addEventListener(
      'ended',
      () => {
        const durationMs =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? Math.round(audio.duration * 1000)
            : fallbackDuration;
        finish(durationMs, 'playback ended');
      },
      { once: true }
    );

    audio.addEventListener(
      'error',
      () => {
        logDev('playback error', {
          code: audio.error?.code,
          message: audio.error?.message,
        });
        finish(fallbackDuration, 'playback error');
      },
      { once: true }
    );

    const startPlayback = (): void => {
      void audio.play().catch((error) => {
        logDev('playback play() rejected', {
          message: error instanceof Error ? error.message : String(error),
        });
        finish(fallbackDuration, 'playback rejected');
      });
    };

    if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      startPlayback();
    } else {
      audio.addEventListener('canplaythrough', startPlayback, { once: true });
      audio.load();
    }
  });
}

function estimateSpeechDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1800, Math.min(7000, words * 280));
}

function base64ToBlobUrl(base64: string, mimeType: string): { url: string; blobSize: number } {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return {
    url: URL.createObjectURL(blob),
    blobSize: blob.size,
  };
}

function buildResultFromApi(
  data: ValentineVoiceApiResponse,
  sanitized: ValentineVoiceRequest
): ValentineVoiceResult {
  const spokenText = data.text?.trim();

  if (data.ok && spokenText && data.audioBase64) {
    if (spokenText.length > 90) {
      logDev('rejected overlong line from server');
      const fallbackText = pickFallbackLine(sanitized);
      return {
        ok: false,
        text: fallbackText,
        audioUrl: null,
        durationMs: estimateSpeechDurationMs(fallbackText),
        source: 'fallback',
        message: 'Generated line too long',
      };
    }

    const { url, blobSize } = base64ToBlobUrl(data.audioBase64, data.mimeType ?? 'audio/mpeg');
    logDev('audio blob ready', {
      audioBase64Length: data.audioBase64.length,
      blobSize,
      mimeType: data.mimeType ?? 'audio/mpeg',
    });

    return {
      ok: true,
      text: spokenText,
      audioUrl: url,
      durationMs: data.durationMs ?? estimateSpeechDurationMs(spokenText),
      source: data.source ?? 'openai-elevenlabs',
    };
  }

  if (spokenText) {
    return {
      ok: false,
      text: spokenText,
      audioUrl: null,
      durationMs: estimateSpeechDurationMs(spokenText),
      source: 'text-only',
      message: data.error ?? 'Speech synthesis unavailable',
    };
  }

  const fallbackText = pickFallbackLine(sanitized);
  return {
    ok: false,
    text: fallbackText,
    audioUrl: null,
    durationMs: estimateSpeechDurationMs(fallbackText),
    source: 'fallback',
    message: data.error ?? 'Voice generation failed',
  };
}

export async function requestValentineVoice(
  payload: ValentineVoiceRequest
): Promise<ValentineVoiceResult> {
  const sanitized = sanitizePayload(payload);
  const fingerprint = normalizeFingerprint(sanitized);

  logDev('requesting voice', {
    eventType: sanitized.eventType,
    url: VALENTINE_VOICE_URL,
  });

  if (inFlightController) {
    logDev('request blocked — another request is in flight');
    const fallbackText = pickFallbackLine(sanitized);
    return {
      ok: false,
      text: fallbackText,
      audioUrl: null,
      durationMs: estimateSpeechDurationMs(fallbackText),
      source: 'fallback',
      message: 'Duplicate in-flight request',
    };
  }

  if (
    fingerprint === lastRequestFingerprint &&
    Date.now() - lastCompletedAt < SESSION_COOLDOWN_MS
  ) {
    logDev('request blocked — session cooldown active');
    const fallbackText = pickFallbackLine(sanitized);
    return {
      ok: false,
      text: fallbackText,
      audioUrl: null,
      durationMs: estimateSpeechDurationMs(fallbackText),
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
      audioBase64Length: data.audioBase64?.length ?? 0,
      error: data.error,
    });

    const result = buildResultFromApi(data, sanitized);

    if (result.ok || result.source === 'text-only') {
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
    const fallbackText = pickFallbackLine(sanitized);
    return {
      ok: false,
      text: fallbackText,
      audioUrl: null,
      durationMs: estimateSpeechDurationMs(fallbackText),
      source: 'fallback',
      message: 'Voice request failed',
    };
  } finally {
    if (inFlightController === controller) {
      inFlightController = null;
    }
  }
}

export function stopValentineAudio(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}
