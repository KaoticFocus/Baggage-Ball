import type { BallStats } from '../types/BallTypes';
import type { ResponseTone } from '../types/DialogueTypes';

const BALL_VERBS: Record<string, { soften: string; suspicious: string; pleased: string; angry: string; remember: string }> = {
  orb: {
    soften: 'Orb deigns to continue.',
    suspicious: 'Orb narrows its spotlight.',
    pleased: 'Orb is theatrically pleased.',
    angry: 'Orb considers leaving the stage.',
    remember: 'Orb will cite this in the memoir.',
  },
  bolt: {
    soften: 'Bolt exhales through gritted enamel.',
    suspicious: 'Bolt side-eyes you.',
    pleased: 'Bolt appreciates the lack of volume.',
    angry: 'Bolt\'s resentment hardens.',
    remember: 'Bolt will remember that at 4pm.',
  },
  valentine: {
    soften: 'Valentine softens.',
    suspicious: 'Valentine grows suspicious.',
    pleased: 'Valentine melts a little.',
    angry: 'Valentine spirals.',
    remember: 'The ball will remember that.',
  },
};

export function getEmotionalResult(
  ballId: string,
  ballName: string,
  statChanges: Partial<BallStats>,
  tone: ResponseTone
): string {
  const verbs = BALL_VERBS[ballId] ?? {
    soften: `${ballName} softens.`,
    suspicious: `${ballName} grows suspicious.`,
    pleased: `${ballName} seems pleased.`,
    angry: `${ballName} bristles.`,
    remember: 'The ball will remember that.',
  };

  const trustDelta = statChanges.trust ?? 0;
  const resentmentDelta = statChanges.resentment ?? 0;
  const attachmentDelta = statChanges.attachment ?? 0;
  const egoDelta = statChanges.ego ?? 0;
  const chaosDelta = statChanges.chaos ?? 0;

  if (tone === 'provoking' || resentmentDelta >= 15) {
    return verbs.angry;
  }
  if (trustDelta >= 12 || attachmentDelta >= 10) {
    return verbs.soften;
  }
  if (tone === 'flattering' || egoDelta >= 15) {
    return verbs.pleased;
  }
  if (trustDelta <= -10) {
    return verbs.suspicious;
  }
  if (chaosDelta >= 10 || Math.abs(trustDelta) + Math.abs(resentmentDelta) >= 20) {
    return verbs.remember;
  }
  if (tone === 'boundary') {
    return ballId === 'bolt' ? verbs.pleased : verbs.suspicious;
  }
  if (tone === 'sincere' && trustDelta > 0) {
    return verbs.soften;
  }

  return verbs.remember;
}
