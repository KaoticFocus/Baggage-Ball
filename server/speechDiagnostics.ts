/**
 * Shared, secret-safe diagnostics for the Netlify speech functions.
 *
 * These helpers surface *why* a provider (ElevenLabs / OpenAI) failed in the
 * Netlify Function logs and in the structured HTTP response, without ever
 * exposing the API key value or the full voice ID.
 */

/**
 * Server-side voice mapping. Maps each supported character id to the *name* of
 * the environment variable that holds its ElevenLabs voice id. The voice id
 * value itself is never exposed to browser code or logs.
 */
export const VOICE_ENV_BY_CHARACTER: Record<string, string> = {
  valentine: 'ELEVENLABS_VOICE_VALENTINE',
  'midlife-dave': 'ELEVENLABS_VOICE_MIDLIFE_DAVE',
};

/** Name of the env var holding the voice id for a character (if supported). */
export function getCharacterVoiceEnvVar(characterId: string): string | undefined {
  return VOICE_ENV_BY_CHARACTER[characterId];
}

/** Resolve a character's ElevenLabs voice id value from the environment. */
export function getCharacterVoiceId(characterId: string): string | undefined {
  const envVar = VOICE_ENV_BY_CHARACTER[characterId];
  return envVar ? process.env[envVar] : undefined;
}

export type ElevenLabsEnvDiagnostics = {
  characterId?: string;
  hasApiKey: boolean;
  hasVoiceId: boolean;
  modelId: string;
};

/**
 * Safe env snapshot for ElevenLabs — booleans + non-secret model id only.
 * When a characterId is supplied, hasVoiceId reflects that character's voice
 * env var; otherwise it falls back to Valentine's for backward compatibility.
 */
export function getElevenLabsEnvDiagnostics(characterId?: string): ElevenLabsEnvDiagnostics {
  const voiceEnvVar = characterId
    ? VOICE_ENV_BY_CHARACTER[characterId]
    : 'ELEVENLABS_VOICE_VALENTINE';
  return {
    ...(characterId ? { characterId } : {}),
    hasApiKey: Boolean(process.env.ELEVENLABS_API_KEY),
    hasVoiceId: Boolean(voiceEnvVar && process.env[voiceEnvVar]),
    modelId: process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5',
  };
}

export type OpenAiEnvDiagnostics = {
  hasApiKey: boolean;
  model: string;
};

/** Safe env snapshot for OpenAI — boolean + non-secret model name only. */
export function getOpenAiEnvDiagnostics(): OpenAiEnvDiagnostics {
  return {
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  };
}

/**
 * Extract a non-secret error code from an ElevenLabs error body.
 * ElevenLabs errors are typically shaped like:
 *   { "detail": { "status": "voice_not_found", "message": "..." } }
 * or occasionally { "detail": "some message string" }.
 */
export function parseElevenLabsErrorCode(body: string): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    const detail = parsed.detail;
    if (typeof detail === 'string') return detail.slice(0, 80);
    if (detail && typeof detail === 'object') {
      const record = detail as Record<string, unknown>;
      if (typeof record.status === 'string') return record.status.slice(0, 80);
      if (typeof record.code === 'string') return record.code.slice(0, 80);
    }
  } catch {
    // Non-JSON error body — no structured code available.
  }
  return null;
}

/** Error carrying a non-secret provider status + code for structured responses. */
export class ProviderError extends Error {
  readonly providerStatus: number;
  readonly providerCode: string | null;

  constructor(providerName: string, providerStatus: number, providerCode: string | null) {
    super(`${providerName} request failed (${providerStatus})`);
    this.name = 'ProviderError';
    this.providerStatus = providerStatus;
    this.providerCode = providerCode;
  }
}

export type ProviderErrorFields = {
  providerStatus?: number;
  providerCode?: string;
};

/**
 * Pull non-secret provider status/code out of any thrown error. Handles our own
 * ProviderError as well as SDK-style errors (e.g. OpenAI) that expose numeric
 * `status` and string `code` fields.
 */
export function extractProviderErrorFields(error: unknown): ProviderErrorFields {
  const fields: ProviderErrorFields = {};
  if (error instanceof ProviderError) {
    fields.providerStatus = error.providerStatus;
    if (error.providerCode) fields.providerCode = error.providerCode;
    return fields;
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.status === 'number') fields.providerStatus = record.status;
    if (typeof record.code === 'string') fields.providerCode = record.code.slice(0, 80);
  }
  return fields;
}
