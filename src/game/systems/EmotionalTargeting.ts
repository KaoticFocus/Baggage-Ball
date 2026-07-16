/**
 * Explicit emotional targeting for Loadout actions.
 * Default: the active ball (relationship stats owner), not "last speaker".
 */

export type EmotionalTargetKind = 'ball' | 'opponent' | 'self';

export type EmotionalTarget = {
  characterId: string;
  kind: EmotionalTargetKind;
  /** Ball id when the target owns ball relationship stats. */
  ballId?: string;
  displayName: string;
};

/**
 * Current default: target the ball in play (emotional combat partner).
 * Future modes can expand to opponent/self/team without scattering rules in PlayScene.
 */
export function getCurrentEmotionalTarget(context: {
  ballId: string;
  ballDisplayName: string;
  opponentId: string;
  opponentDisplayName: string;
}): EmotionalTarget | null {
  if (!context.ballId) return null;
  return {
    characterId: context.ballId,
    kind: 'ball',
    ballId: context.ballId,
    displayName: context.ballDisplayName || context.ballId,
  };
}
