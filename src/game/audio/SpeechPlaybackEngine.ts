/**
 * Shared ElevenLabs playback engine used only by VoiceDirector.
 *
 * One AudioContext + one HTMLAudioElement + one AnalyserNode.
 * Fetches /.netlify/functions/character-speech (JSON + audioBase64).
 * Never exposes API keys or voice IDs.
 */

import { soundManager } from '../services/SoundManager';
import { resolveSpeechCharacterId } from '../data/characterVoices';

const CHARACTER_SPEECH_URL = '/.netlify/functions/character-speech';
const REQUEST_TIMEOUT_MS = 8000;

export type SpeechPlaybackResult = {
  ok: boolean;
  durationMs: number;
  text: string;
  source: 'elevenlabs' | 'cache' | 'text-only' | 'muted' | 'skipped' | 'aborted';
  message?: string;
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function estimateDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1800, Math.min(7000, words * 280));
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export class SpeechPlaybackEngine {
  private audioContext: AudioContext | null = null;
  private readonly audioElement = new Audio();
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private activeObjectUrl: string | null = null;
  private graphReady = false;
  private playGeneration = 0;

  constructor() {
    this.audioElement.preload = 'auto';
    this.audioElement.crossOrigin = 'anonymous';
  }

  async resume(): Promise<void> {
    soundManager.unlock();
    const ctx = this.ensureGraph();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  async play(options: {
    characterId: string;
    text: string;
    signal?: AbortSignal;
  }): Promise<SpeechPlaybackResult> {
    const text = normalizeText(options.text);
    if (!text) {
      return { ok: false, durationMs: 0, text: '', source: 'skipped', message: 'Empty text' };
    }

    if (options.signal?.aborted) {
      return { ok: false, durationMs: 0, text, source: 'aborted', message: 'Aborted' };
    }

    await this.resume();

    if (soundManager.isMuted()) {
      return {
        ok: true,
        durationMs: estimateDurationMs(text),
        text,
        source: 'muted',
      };
    }

    const speechCharacterId = resolveSpeechCharacterId(options.characterId);
    const synthesized = await this.fetchSpeechAudio(speechCharacterId, text, options.signal);
    if (synthesized.source === 'aborted') {
      return { ok: false, durationMs: 0, text, source: 'aborted', message: 'Aborted' };
    }
    if (!synthesized.ok || !synthesized.blob) {
      return {
        ok: false,
        durationMs: estimateDurationMs(text),
        text: synthesized.text,
        source: 'text-only',
        message: synthesized.message,
      };
    }

    if (options.signal?.aborted) {
      return { ok: false, durationMs: 0, text, source: 'aborted', message: 'Aborted' };
    }

    this.releaseObjectUrl();
    this.activeObjectUrl = URL.createObjectURL(synthesized.blob);
    const generation = ++this.playGeneration;

    this.audioElement.pause();
    this.audioElement.src = this.activeObjectUrl;
    this.audioElement.volume = soundManager.getVoiceOutputVolume();

    const durationMs = await new Promise<number>((resolve, reject) => {
      const cleanup = (): void => {
        this.audioElement.onended = null;
        this.audioElement.onerror = null;
        options.signal?.removeEventListener('abort', onAbort);
      };

      const onAbort = (): void => {
        cleanup();
        this.audioElement.pause();
        reject(new DOMException('Aborted', 'AbortError'));
      };

      if (options.signal) {
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      this.audioElement.onended = () => {
        cleanup();
        const measured =
          Number.isFinite(this.audioElement.duration) && this.audioElement.duration > 0
            ? Math.round(this.audioElement.duration * 1000)
            : estimateDurationMs(text);
        resolve(measured);
      };
      this.audioElement.onerror = () => {
        cleanup();
        reject(new Error('Audio playback failed.'));
      };

      void this.audioElement.play().catch((error) => {
        cleanup();
        reject(error);
      });
    }).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return -1;
      }
      if (import.meta.env.DEV) {
        console.warn('[SpeechPlayback] play failed', error);
      }
      return 0;
    });

    if (generation === this.playGeneration) {
      this.releaseObjectUrl();
    }

    if (durationMs < 0) {
      return { ok: false, durationMs: 0, text, source: 'aborted', message: 'Aborted' };
    }

    return {
      ok: durationMs > 0,
      durationMs: durationMs > 0 ? durationMs : estimateDurationMs(text),
      text: synthesized.text,
      source: synthesized.source,
      message: durationMs > 0 ? undefined : 'Playback failed',
    };
  }

  stop(): void {
    this.playGeneration += 1;
    this.audioElement.pause();
    this.audioElement.removeAttribute('src');
    this.audioElement.load();
    this.releaseObjectUrl();
  }

  getWaveformSamples(sampleCount: number): number[] {
    const analyser = this.analyser;
    if (!analyser || sampleCount <= 0) {
      return Array.from({ length: Math.max(0, sampleCount) }, () => 0);
    }

    const raw = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(raw);

    const samples: number[] = [];
    const step = raw.length / sampleCount;
    for (let index = 0; index < sampleCount; index += 1) {
      const rawIndex = Math.floor(index * step);
      samples.push((raw[rawIndex]! - 128) / 128);
    }
    return samples;
  }

  private ensureGraph(): AudioContext {
    if (this.graphReady && this.audioContext) {
      return this.audioContext;
    }

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      throw new Error('Web Audio API unavailable');
    }

    this.audioContext = new Ctor();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.65;

    this.source = this.audioContext.createMediaElementSource(this.audioElement);
    this.source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
    this.graphReady = true;
    return this.audioContext;
  }

  private async fetchSpeechAudio(
    characterId: string,
    text: string,
    signal?: AbortSignal
  ): Promise<{
    ok: boolean;
    text: string;
    blob: Blob | null;
    source: 'elevenlabs' | 'cache' | 'text-only' | 'aborted';
    message?: string;
  }> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const onOuterAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onOuterAbort, { once: true });

    try {
      const response = await fetch(CHARACTER_SPEECH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, text }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onOuterAbort);

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

      const spokenText = normalizeText(data.text ?? text);
      if (data.ok && data.audioBase64) {
        return {
          ok: true,
          text: spokenText,
          blob: base64ToBlob(data.audioBase64, data.mimeType ?? 'audio/mpeg'),
          source: data.source === 'cache' ? 'cache' : 'elevenlabs',
        };
      }

      return {
        ok: false,
        text: spokenText,
        blob: null,
        source: 'text-only',
        message: data.error ?? `HTTP ${response.status}`,
      };
    } catch (error) {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onOuterAbort);
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, text, blob: null, source: 'aborted', message: 'Aborted' };
      }
      return {
        ok: false,
        text,
        blob: null,
        source: 'text-only',
        message: error instanceof Error ? error.message : 'Speech request failed',
      };
    }
  }

  private releaseObjectUrl(): void {
    if (this.activeObjectUrl) {
      URL.revokeObjectURL(this.activeObjectUrl);
      this.activeObjectUrl = null;
    }
  }
}

export const speechPlaybackEngine = new SpeechPlaybackEngine();
