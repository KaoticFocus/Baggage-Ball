/**
 * Unified Valentine speech: ElevenLabs TTS for all scripted and dynamic lines.
 */

import { soundManager } from './SoundManager';
import { uiManager } from '../../ui/UIManager';
import type { DialogueSituation } from '../types/DialogueTypes';

export type ValentineSpeechEvent =
  | 'opening'
  | 'scoreReaction'
  | 'missReaction'
  | 'hoverPrompt'
  | 'responseReaction'
  | 'nearMiss'
  | 'resentment'
  | 'praise'
  | 'strategy'
  | 'longRally'
  | 'lowTrust'
  | 'typedResponse'
  | 'outburst'
  | 'postMatch'
  | 'other';

export type ValentineSpeechPriority = 'low' | 'medium' | 'high';

export type ValentineSpeechContext = {
  eventType?: ValentineSpeechEvent;
  priority?: ValentineSpeechPriority;
  ballScreen?: { x: number; y: number };
  showBubble?: boolean;
  waitForPlayback?: boolean;
};

export type ValentineSpeechResult = {
  ok: boolean;
  text: string;
  durationMs: number;
  hadAudio: boolean;
  source: 'elevenlabs' | 'cache' | 'text-only' | 'skipped';
  message?: string;
};

const CHARACTER_SPEECH_URL = '/.netlify/functions/character-speech';
const REQUEST_TIMEOUT_MS = 8000;
const BUBBLE_MIN_MS = 5000;
const BUBBLE_TAIL_MS = 300;

const PRIORITY_RANK: Record<ValentineSpeechPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let currentPriority: ValentineSpeechPriority | null = null;
let inFlightByText = new Map<string, Promise<ValentineSpeechResult>>();

export function mapDialogueSituationToSpeechEvent(situation: DialogueSituation): ValentineSpeechEvent {
  switch (situation) {
    case 'lowTrust':
      return 'lowTrust';
    case 'highResentment':
    case 'resentmentSpike':
      return 'resentment';
    case 'longRally':
      return 'longRally';
    case 'nearMiss':
    case 'nearMissReaction':
      return 'nearMiss';
    case 'praiseDemand':
      return 'praise';
    case 'strategyRethink':
      return 'strategy';
    default:
      return 'hoverPrompt';
  }
}

function logDev(message: string, details?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (details) {
    console.log(`[ValentineSpeech] ${message}`, details);
    return;
  }
  console.log(`[ValentineSpeech] ${message}`);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function estimateDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1800, Math.min(7000, words * 280));
}

function shouldInterrupt(next: ValentineSpeechPriority): boolean {
  if (currentPriority === null) return true;
  return PRIORITY_RANK[next] >= PRIORITY_RANK[currentPriority];
}

function stopActivePlayback(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
  currentPriority = null;
}

function base64ToBlobUrl(base64: string, mimeType: string): { url: string; blobSize: number } {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return { url: URL.createObjectURL(blob), blobSize: blob.size };
}

async function requestCharacterSpeech(text: string): Promise<{
  ok: boolean;
  text: string;
  audioUrl: string | null;
  source: 'elevenlabs' | 'cache' | 'text-only';
  message?: string;
}> {
  logDev('speech endpoint called', {
    endpoint: CHARACTER_SPEECH_URL,
    text,
    textLength: text.length,
  });

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(CHARACTER_SPEECH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: 'valentine', text }),
      signal: controller.signal,
    });

    window.clearTimeout(timeoutId);

    let data: {
      ok?: boolean;
      text?: string;
      audioBase64?: string;
      mimeType?: string;
      source?: 'elevenlabs' | 'cache';
      error?: string;
    } = {};

    try {
      data = (await response.json()) as typeof data;
    } catch {
      data = {};
    }

    logDev('speech endpoint response', {
      httpStatus: response.status,
      source: data.source,
      ok: data.ok,
      text: data.text,
      audioBase64Length: data.audioBase64?.length ?? 0,
      error: data.error,
    });

    const spokenText = normalizeText(data.text ?? text);
    if (data.ok && data.audioBase64) {
      const { url, blobSize } = base64ToBlobUrl(data.audioBase64, data.mimeType ?? 'audio/mpeg');
      logDev('audio blob ready', { blobSize });
      return {
        ok: true,
        text: spokenText,
        audioUrl: url,
        source: data.source === 'cache' ? 'cache' : 'elevenlabs',
      };
    }

    return {
      ok: false,
      text: spokenText,
      audioUrl: null,
      source: 'text-only',
      message: data.error ?? `HTTP ${response.status}`,
    };
  } catch (error) {
    window.clearTimeout(timeoutId);
    logDev('speech endpoint failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      text,
      audioUrl: null,
      source: 'text-only',
      message: 'Speech request failed',
    };
  }
}

async function playAudio(url: string, spokenText: string, priority: ValentineSpeechPriority): Promise<number> {
  const fallbackDuration = estimateDurationMs(spokenText);

  if (soundManager.isMuted()) {
    logDev('playback skipped — muted');
    return fallbackDuration;
  }

  soundManager.unlock();
  stopActivePlayback();
  currentPriority = priority;

  return new Promise<number>((resolve) => {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = soundManager.getVoiceOutputVolume();
    activeAudio = audio;
    activeObjectUrl = url;

    const finish = (durationMs: number, reason: string) => {
      logDev(reason, { durationMs });
      activeAudio = null;
      if (activeObjectUrl === url) {
        URL.revokeObjectURL(url);
        activeObjectUrl = null;
      }
      currentPriority = null;
      resolve(durationMs);
    };

    audio.addEventListener('playing', () => logDev('playback started'), { once: true });
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
        finish(fallbackDuration, 'playback failed');
      },
      { once: true }
    );

    const start = (): void => {
      void audio.play().catch((error) => {
        logDev('playback play() rejected', {
          message: error instanceof Error ? error.message : String(error),
        });
        finish(fallbackDuration, 'playback rejected');
      });
    };

    if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      start();
    } else {
      audio.addEventListener('canplaythrough', start, { once: true });
      audio.load();
    }
  });
}

async function speakValentineLineInternal(
  text: string,
  context: ValentineSpeechContext
): Promise<ValentineSpeechResult> {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { ok: false, text: '', durationMs: 0, hadAudio: false, source: 'skipped' };
  }

  const priority = context.priority ?? 'medium';
  const eventType = context.eventType ?? 'other';

  if (!shouldInterrupt(priority)) {
    logDev('speech skipped — lower priority than active line', { eventType, priority });
    return {
      ok: false,
      text: normalized,
      durationMs: estimateDurationMs(normalized),
      hadAudio: false,
      source: 'skipped',
      message: 'Interrupted by higher-priority speech',
    };
  }

  stopActivePlayback();

  logDev('speakValentineLine', { eventType, text: normalized, priority });

  const speech = await requestCharacterSpeech(normalized);
  const showBubble = context.showBubble !== false;
  const ballScreen = context.ballScreen;

  if (showBubble) {
    uiManager.showBallComment(speech.text, 120000, ballScreen);
  }

  let durationMs = estimateDurationMs(speech.text);
  let hadAudio = false;

  if (speech.audioUrl) {
    hadAudio = true;
    durationMs = await playAudio(speech.audioUrl, speech.text, priority);
  }

  const bubbleMs = Math.max(BUBBLE_MIN_MS, durationMs + BUBBLE_TAIL_MS);
  if (showBubble) {
    uiManager.showBallComment(speech.text, bubbleMs, ballScreen);
  }

  if (context.waitForPlayback !== false) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, bubbleMs));
  }

  return {
    ok: speech.ok,
    text: speech.text,
    durationMs: bubbleMs,
    hadAudio,
    source: speech.source,
    message: speech.message,
  };
}

export async function speakValentineLine(
  text: string,
  context: ValentineSpeechContext = {}
): Promise<ValentineSpeechResult> {
  const normalized = normalizeText(text);
  const dedupeKey = normalized.toLowerCase();
  const existing = inFlightByText.get(dedupeKey);
  if (existing) {
    logDev('deduplicated in-flight speech request', { text: normalized });
    return existing;
  }

  const promise = speakValentineLineInternal(normalized, context).finally(() => {
    inFlightByText.delete(dedupeKey);
  });
  inFlightByText.set(dedupeKey, promise);
  return promise;
}

export function stopValentineSpeech(): void {
  stopActivePlayback();
}
