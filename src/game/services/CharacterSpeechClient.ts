/**
 * CharacterSpeechClient — client-side ElevenLabs TTS for named characters.
 *
 * Usage:
 *   const durationMs = await speakCharacterLine('midlife-dave', text, 'opponentBark:playerMisses');
 *   const bubbleMs = Math.max(5000, durationMs + 300);
 *
 * Supported character ids are the ones the server-side character-speech flow
 * accepts (currently 'valentine' and 'midlife-dave'). Valentine's own scripted
 * lines are voiced via valentineSpeech.ts; this client is used for opponent
 * characters (Midlife Dave) that display their own labelled chat bubble.
 *
 * All speech routes through the same server endpoint used by Valentine:
 *   /.netlify/functions/character-speech
 *
 * Cache: repeated identical lines (normalised) reuse the cached data-URL within
 * the current page session — no repeated ElevenLabs calls for the same text.
 *
 * Concurrency: Only one clip on this lane may play at a time. Calling
 * speakCharacterLine while a clip is already playing interrupts it.
 *
 * Sound On/Off: respects the global mute + voice volume from SoundManager. When
 * muted, no audio plays and 0 is returned (the caller keeps showing the bubble).
 */

import { soundManager } from './SoundManager';

/** Character ids this client is allowed to request audio for. */
const SUPPORTED_CHARACTER_IDS = new Set(['valentine', 'midlife-dave']);

/** In-session cache: `${characterId}:${normalisedText}` → audio data-URL */
const speechCache = new Map<string, string>();

/** Currently playing audio element on this lane, if any. */
let currentAudio: HTMLAudioElement | null = null;

function normaliseCacheKey(characterId: string, text: string): string {
  return `${characterId}:${text.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

/**
 * Stop any currently playing character audio clip immediately.
 * Safe to call when nothing is playing.
 */
export function stopCharacterSpeech(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}

/**
 * Synthesise and play a single character voice line via the server function.
 *
 * - Interrupts any currently playing clip on this lane before starting.
 * - Returns the audio duration in ms once the audio has loaded and started.
 * - Returns 0 if the character is unsupported, text is empty, sound is muted,
 *   synthesis fails, or playback is blocked.
 *
 * Development logs written to console:
 *   [Speech] eventType, characterId, fn name, text excerpt
 *   [Speech] response status
 *   [Speech] returned audio byte length
 *   [Speech] playback started / failed
 */
export async function speakCharacterLine(
  characterId: string,
  text: string,
  eventType: string
): Promise<number> {
  console.log(
    `[Speech] eventType=${eventType} characterId=${characterId} fn=speakCharacterLine` +
    ` text="${text.slice(0, 80)}"`
  );

  if (!SUPPORTED_CHARACTER_IDS.has(characterId)) return 0;

  const trimmed = text.trim();
  if (!trimmed) return 0;

  // Respect the global Sound On/Off setting: no audio when muted.
  if (soundManager.isMuted()) {
    console.log(`[Speech] skipped — muted characterId=${characterId}`);
    return 0;
  }

  // Stop any prior clip before we start a new request
  stopCharacterSpeech();

  const cacheKey = normaliseCacheKey(characterId, trimmed);
  const requestText = trimmed.slice(0, 120);
  let dataUrl = speechCache.get(cacheKey);

  if (!dataUrl) {
    let responseStatus = 0;
    try {
      const resp = await fetch('/.netlify/functions/character-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, text: requestText }),
      });
      responseStatus = resp.status;
      console.log(`[Speech] response status=${responseStatus} characterId=${characterId}`);

      if (!resp.ok) {
        console.warn(
          `[Speech] synthesis failed status=${responseStatus} characterId=${characterId}` +
          ` text="${requestText.slice(0, 40)}"`
        );
        return 0;
      }

      const data = (await resp.json()) as { audioBase64: string; mimeType: string; text: string };
      const byteLength = Math.round(data.audioBase64.length * 0.75);
      console.log(`[Speech] returned audio byte length=${byteLength}`);

      dataUrl = `data:${data.mimeType};base64,${data.audioBase64}`;
      speechCache.set(cacheKey, dataUrl);
    } catch (err) {
      console.warn('[Speech] fetch error:', err);
      return 0;
    }
  } else {
    console.log(`[Speech] cache hit characterId=${characterId} text="${requestText.slice(0, 40)}"`);
  }

  soundManager.unlock();

  return new Promise<number>((resolve) => {
    const safeDataUrl = dataUrl!;
    const audio = new Audio(safeDataUrl);
    audio.volume = soundManager.getVoiceOutputVolume();
    currentAudio = audio;

    audio.addEventListener(
      'loadedmetadata',
      () => {
        // Check if this clip was interrupted before metadata loaded
        if (currentAudio !== audio) {
          resolve(0);
          return;
        }
        audio
          .play()
          .then(() => {
            console.log(`[Speech] playback started characterId=${characterId} text="${requestText.slice(0, 40)}"`);
            resolve(Math.round(audio.duration * 1000));
          })
          .catch((err: unknown) => {
            console.warn('[Speech] playback failed:', err);
            if (currentAudio === audio) currentAudio = null;
            resolve(0);
          });
      },
      { once: true }
    );

    audio.addEventListener(
      'error',
      () => {
        console.warn('[Speech] audio element load error');
        if (currentAudio === audio) currentAudio = null;
        resolve(0);
      },
      { once: true }
    );

    audio.addEventListener(
      'ended',
      () => {
        if (currentAudio === audio) currentAudio = null;
      },
      { once: true }
    );
  });
}
