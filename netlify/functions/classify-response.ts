import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const body = event.body ? JSON.parse(event.body) : {};
  const playerText = String(body.playerText || "");

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      source: "stub",
      received: playerText,
      tone: "uncertain",
      emotionalResult: "The ball is processing what you said with unnecessary intensity.",
      ballReaction: "I heard you. Unfortunately, I also interpreted it.",
      statChanges: {
        trust: 2,
        resentment: 1,
        ego: 0,
        chaos: 1,
        attachment: 0,
        dramaNeed: 1,
        patience: -1
      },
      behaviorModifier: "none"
    }),
  };
};
