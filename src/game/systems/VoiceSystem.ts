/**
 * Legacy stubs — do not use for character speech.
 * All character voice goes through VoiceDirector (see src/game/audio/VoiceDirector.ts).
 * Ball-speed helpers remain for BehaviorModifierSystem.
 */

/** @deprecated Use VoiceDirector.speak */
export function speakBallLine(_text: string): void {
  // No-op — character speech is VoiceDirector-only.
}

/** @deprecated Use VoiceDirector.speak */
export function speakResponseOption(_text: string): void {
  // No-op — character speech is VoiceDirector-only.
}

/** @deprecated Use VoiceDirector.speak / speakCharacterLine */
export function speakOpponentBark(_text: string): void {
  // No-op — opponent barks speak via PlayScene → speakCharacterLine → VoiceDirector.
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
