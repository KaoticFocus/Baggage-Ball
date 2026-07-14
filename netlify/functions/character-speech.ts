import type { Handler } from '@netlify/functions';
import {
  handleCharacterSpeechRequest,
  parseCharacterSpeechRequest,
} from '../../server/characterSpeechCore';

function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  const contentType = event.headers['content-type'] ?? event.headers['Content-Type'] ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse(415, { ok: false, error: 'Content-Type must be application/json' });
  }

  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : null;
  } catch {
    return jsonResponse(400, { ok: false, error: 'Invalid JSON body' });
  }

  const request = parseCharacterSpeechRequest(body);
  if (!request) {
    return jsonResponse(400, { ok: false, error: 'Invalid request body' });
  }

  const result = await handleCharacterSpeechRequest(request);
  return jsonResponse(result.ok ? 200 : 503, result);
import type { Handler } from "@netlify/functions";

/**
 * character-speech — server-side ElevenLabs TTS for named characters.
 *
 * Accepts: POST { characterId: "valentine", text: string }
 * Returns: { audioBase64, mimeType, text }
 *
 * Rules:
 * - Valentine only for this MVP.
 * - Text is clamped to 120 characters server-side.
 * - Voice ID comes exclusively from env (never accepted from the client).
 * - Never calls OpenAI.
 */

const MAX_TEXT_LEN = 120;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // Parse body safely
  let body: Record<string, unknown> = {};
  try {
    body = event.body ? (JSON.parse(event.body) as Record<string, unknown>) : {};
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const characterId = typeof body.characterId === "string" ? body.characterId : "";
  const rawText = typeof body.text === "string" ? body.text : "";

  // Only Valentine is supported
  if (characterId !== "valentine") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "characterId must be 'valentine'" }),
    };
  }

  const text = rawText.trim().slice(0, MAX_TEXT_LEN);
  if (!text) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "text is required and must be non-empty" }),
    };
  }

  // Environment variables — all sourced server-side, never from client
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_VALENTINE;
  const modelId = process.env.ELEVENLABS_MODEL_ID;

  if (!apiKey) {
    console.error("[character-speech] Missing ELEVENLABS_API_KEY");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server misconfigured: missing ELEVENLABS_API_KEY" }),
    };
  }
  if (!voiceId) {
    console.error("[character-speech] Missing ELEVENLABS_VOICE_VALENTINE");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server misconfigured: missing ELEVENLABS_VOICE_VALENTINE" }),
    };
  }
  if (!modelId) {
    console.error("[character-speech] Missing ELEVENLABS_MODEL_ID");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server misconfigured: missing ELEVENLABS_MODEL_ID" }),
    };
  }

  console.log(`[character-speech] request characterId=valentine text="${text.slice(0, 60)}"`);

  let apiResp: Response;
  try {
    apiResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );
  } catch (err) {
    console.error("[character-speech] ElevenLabs network error:", err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "ElevenLabs unreachable" }),
    };
  }

  if (!apiResp.ok) {
    const errText = await apiResp.text().catch(() => "");
    console.error(
      `[character-speech] ElevenLabs error status=${apiResp.status} body=${errText.slice(0, 200)}`
    );
    return {
      statusCode: 502,
      body: JSON.stringify({ error: `ElevenLabs error ${apiResp.status}` }),
    };
  }

  const buffer = await apiResp.arrayBuffer();
  const audioBase64 = Buffer.from(buffer).toString("base64");
  const mimeType = apiResp.headers.get("Content-Type") ?? "audio/mpeg";

  console.log(
    `[character-speech] ok characterId=valentine bytes=${buffer.byteLength} text="${text.slice(0, 60)}"`
  );

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioBase64, mimeType, text }),
  };
<<<<<<< HEAD
>>>>>>> d46247a8400d3d79486a991de4467a53ff902f03
=======
>>>>>>> d46247a8400d3d79486a991de4467a53ff902f03
};
