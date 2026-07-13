import type { Handler } from '@netlify/functions';
import {
  handleValentineVoiceRequest,
  parseValentineVoiceRequest,
} from '../../server/valentineVoiceCore';

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

  const request = parseValentineVoiceRequest(body);
  if (!request) {
    return jsonResponse(400, { ok: false, error: 'Invalid request body' });
  }

  const result = await handleValentineVoiceRequest(request);
  return jsonResponse(result.ok ? 200 : 503, result);
};
