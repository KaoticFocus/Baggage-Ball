import {
  getElevenLabsEnvDiagnostics,
  getCharacterVoiceEnvVar,
  getCharacterVoiceId,
  parseElevenLabsErrorCode,
  extractProviderErrorFields,
  ProviderError,
  VOICE_ENV_BY_CHARACTER,
} from './speechDiagnostics';

const MAX_SPEECH_TEXT = 320;
const ALLOWED_CHARACTER_IDS = new Set(Object.keys(VOICE_ENV_BY_CHARACTER));

const audioCache = new Map<string, { audioBase64: string; mimeType: 'audio/mpeg' }>();

function isDevLogEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function logDev(message: string, details?: Record<string, unknown>): void {
  if (!isDevLogEnabled()) return;
  if (details) {
    console.log(`[character-speech] ${message}`, details);
    return;
  }
  console.log(`[character-speech] ${message}`);
}

function missingEnvVars(characterId: string): string[] {
  const missing: string[] = [];
  if (!process.env.ELEVENLABS_API_KEY) missing.push('ELEVENLABS_API_KEY');
  const voiceEnvVar = getCharacterVoiceEnvVar(characterId);
  if (voiceEnvVar && !process.env[voiceEnvVar]) missing.push(voiceEnvVar);
  return missing;
}

function normalizeSpeechText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function getCacheKey(characterId: string, text: string, modelId: string, voiceId: string): string {
  return `${characterId}:${voiceId}:${modelId}:${text.toLowerCase()}`;
}

export type CharacterSpeechRequest = {
  characterId: string;
  text: string;
};

export type CharacterSpeechSuccess = {
  ok: true;
  text: string;
  audioBase64: string;
  mimeType: 'audio/mpeg';
  source: 'elevenlabs' | 'cache';
};

export type CharacterSpeechFailure = {
  ok: false;
  error: string;
  text?: string;
  providerStatus?: number;
  providerCode?: string;
};

export type CharacterSpeechResponse = CharacterSpeechSuccess | CharacterSpeechFailure;

export function parseCharacterSpeechRequest(body: unknown): CharacterSpeechRequest | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const characterId = String(raw.characterId ?? '').trim().toLowerCase();
  const text = normalizeSpeechText(String(raw.text ?? ''));
  if (!ALLOWED_CHARACTER_IDS.has(characterId)) return null;
  if (!text || text.length > MAX_SPEECH_TEXT) return null;
  return { characterId, text };
}

async function synthesizeSpeech(
  characterId: string,
  text: string,
  voiceId: string,
  modelId: string,
  apiKey: string
): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.78,
        style: 0.55,
        use_speaker_boost: true,
      },
    }),
  });

  logDev('ElevenLabs response', { statusCode: response.status });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const providerCode = parseElevenLabsErrorCode(errorBody);
    // console.error so it always reaches the Netlify Function logs (never dev-gated).
    console.error('[character-speech] ElevenLabs synthesis failed', {
      statusCode: response.status,
      body: errorBody.slice(0, 500),
      providerCode,
      ...getElevenLabsEnvDiagnostics(characterId),
    });
    throw new ProviderError('ElevenLabs', response.status, providerCode);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  logDev('ElevenLabs audio ready', { audioBytes: buffer.length });
  return buffer;
}

export async function handleCharacterSpeechRequest(
  request: CharacterSpeechRequest
): Promise<CharacterSpeechResponse> {
  logDev('function called', {
    characterId: request.characterId,
    textLength: request.text.length,
    text: request.text,
  });

  const missing = missingEnvVars(request.characterId);
  if (missing.length > 0) {
    console.error('[character-speech] missing environment variables', {
      missing,
      ...getElevenLabsEnvDiagnostics(request.characterId),
    });
    return { ok: false, error: 'Speech synthesis unavailable', text: request.text };
  }

  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const voiceId = getCharacterVoiceId(request.characterId)!;
  const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5';
  const cacheKey = getCacheKey(request.characterId, request.text, modelId, voiceId);
  const cached = audioCache.get(cacheKey);

  if (cached) {
    const audioBytes = Buffer.from(cached.audioBase64, 'base64').length;
    logDev('returning cached audio', { audioBytes });
    return {
      ok: true,
      text: request.text,
      audioBase64: cached.audioBase64,
      mimeType: 'audio/mpeg',
      source: 'cache',
    };
  }

  try {
    const audioBuffer = await synthesizeSpeech(request.characterId, request.text, voiceId, modelId, apiKey);
    const audioBase64 = audioBuffer.toString('base64');
    audioCache.set(cacheKey, { audioBase64, mimeType: 'audio/mpeg' });
    logDev('returning synthesized audio', { audioBytes: audioBuffer.length });
    return {
      ok: true,
      text: request.text,
      audioBase64,
      mimeType: 'audio/mpeg',
      source: 'elevenlabs',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Speech synthesis unavailable';
    const { providerStatus, providerCode } = extractProviderErrorFields(error);
    console.error('[character-speech] synthesis failed', {
      message,
      providerStatus,
      providerCode,
      ...getElevenLabsEnvDiagnostics(request.characterId),
    });
    return {
      ok: false,
      error: 'Speech synthesis unavailable',
      text: request.text,
      ...(providerStatus !== undefined ? { providerStatus } : {}),
      ...(providerCode !== undefined ? { providerCode } : {}),
    };
  }
}
