import type { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  const hasKey = Boolean(process.env.OPENAI_API_KEY);

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      openAiKeyAvailable: hasKey,
      message: hasKey
        ? "Server can access OPENAI_API_KEY safely."
        : "OPENAI_API_KEY is missing.",
    }),
  };
};
