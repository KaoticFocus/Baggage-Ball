/**
 * Future voice/TTS hooks for Baggage Ball.
 * Not active in the vertical slice — stubs only.
 *
 * Design intent:
 * - Ball dialogue lines are primary speech (speakBallLine).
 * - Response options may be spoken on hover/focus (speakResponseOption).
 * - Opponent barks are optional, lower-priority speech (speakOpponentBark).
 */

/** TODO: Wire to browser TTS or cloud voice when voice mode ships. */
export function speakBallLine(_text: string): void {
  // Intentionally empty — DialogueSystem uses VoiceAdapter stub when mode is voice.
}

/** TODO: Speak a response option when the player hovers or focuses it. */
export function speakResponseOption(_text: string): void {
  // Intentionally empty.
}

/** TODO: Optional lower-priority TTS for opponent bark bubbles. */
export function speakOpponentBark(_text: string): void {
  // Intentionally empty.
}

export function getBallSpeed(body: { velocity: { x: number; y: number } }): number {
  return Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
}

export function logBallSpeed(
  body: { velocity: { x: number; y: number } },
  label: string
): number {
  const speed = Math.round(getBallSpeed(body));
  console.log(`[Ball Speed] ${label}=${speed}`);
  return speed;
}
