/**
 * Shared, secret-safe diagnostics for the Netlify speech functions.
 *
 * These helpers surface *why* a provider (ElevenLabs / OpenAI) failed in the
 * Netlify Function logs and in the structured HTTP response, without ever
 * exposing the API key value or the full voice ID.
 */

export type ElevenLabsEnvDiagnostics = {
  hasApiKey: boolean;
  hasVoiceId: boolean;
  modelId: string;
};

/** Safe env snapshot for ElevenLabs — booleans + non-secret model id only. */
export function getElevenLabsEnvDiagnostics(): ElevenLabsEnvDiagnostics {
  return {
    hasApiKey: Boolean(process.env.ELEVENLABS_API_KEY),
    hasVoiceId: Boolean(process.env.ELEVENLABS_VOICE_VALENTINE),
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
