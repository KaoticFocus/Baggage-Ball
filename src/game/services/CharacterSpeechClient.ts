/**
 * CharacterSpeechClient — client-side ElevenLabs TTS for named characters.
 *
 * Usage:
 *   const durationMs = await speakCharacterLine('valentine', text, 'hover:clingyInterruption');
 *   const bubbleMs = Math.max(5000, durationMs + 300);
 *
 * Only 'valentine' is supported. All others return 0 immediately.
 *
 * Cache: repeated identical lines (normalised) reuse the cached data-URL within
 * the current page session — no repeated ElevenLabs calls for the same text.
 *
 * Concurrency: Only one Valentine clip may play at a time.
 * Calling speakCharacterLine while a clip is already playing interrupts it.
 */

/** In-session cache: normalised text → audio data-URL */
const speechCache = new Map<string, string>();

/** Currently playing Valentine audio element, if any. */
let currentAudio: HTMLAudioElement | null = null;

function normaliseCacheKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Stop any currently playing Valentine audio clip immediately.
 * Safe to call when nothing is playing.
 */
export function stopValentineSpeech(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}

/**
 * Synthesise and play a single Valentine voice line via the server function.
 *
 * - Interrupts any currently playing Valentine clip before starting.
 * - Returns the audio duration in ms once the audio has loaded and started playing.
 * - Returns 0 if the character is not 'valentine', text is empty,
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
  eventType: string,
  volume = 1.0
): Promise<number> {
  console.log(
    `[Speech] eventType=${eventType} characterId=${characterId} fn=speakCharacterLine` +
    ` text="${text.slice(0, 80)}"`
  );

  if (characterId !== 'valentine') return 0;

  const trimmed = text.trim();
  if (!trimmed) return 0;

  // Stop any prior clip before we start a new request
  stopValentineSpeech();

  const cacheKey = normaliseCacheKey(trimmed);
  const requestText = trimmed.slice(0, 120);
  let dataUrl = speechCache.get(cacheKey);

  if (!dataUrl) {
    let responseStatus = 0;
    try {
      const resp = await fetch('/.netlify/functions/character-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: 'valentine', text: requestText }),
      });
      responseStatus = resp.status;
      console.log(`[Speech] response status=${responseStatus}`);

      if (!resp.ok) {
        console.warn(`[Speech] synthesis failed status=${responseStatus} text="${requestText.slice(0, 40)}"`);
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
    console.log(`[Speech] cache hit text="${requestText.slice(0, 40)}"`);
  }

  return new Promise<number>((resolve) => {
    const safeDataUrl = dataUrl!;
    const audio = new Audio(safeDataUrl);
    audio.volume = Math.max(0, Math.min(1, volume));
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
            console.log(`[Speech] playback started text="${requestText.slice(0, 40)}"`);
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
