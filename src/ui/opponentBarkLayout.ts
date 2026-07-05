import { GAME_LAYOUT } from '../game/layout/GameLayout';
import type { PaddleSide } from '../game/settings/PlayerSettings';
import type { ScreenBounds } from './dialogueBubbleLayout';

export type OpponentBarkLayoutInput = {
  bubble: HTMLElement;
  opponentSide: PaddleSide;
  opponentPaddleScreen: { x: number; y: number };
  canvasBounds: ScreenBounds;
  playfieldScreen: ScreenBounds;
  leftPaddleSafeScreen: { left: number; right: number };
  rightPaddleSafeScreen: { left: number; right: number };
  fallbackCenterScreen: { x: number; y: number };
  ballDialogueVisible: boolean;
  ballScreen?: { x: number; y: number };
};

type Rect = { left: number; top: number; right: number; bottom: number };

const HORIZONTAL_PAD = 52;
const PADDLE_HALF_SCREEN = 8;
const BALL_AVOID_RADIUS = 44;
const EDGE_PAD = 12;

function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return !(
    a.right + margin < b.left ||
    a.left - margin > b.right ||
    a.bottom + margin < b.top ||
    a.top - margin > b.bottom
  );
}

function bubbleRect(centerX: number, anchorY: number, width: number, height: number): Rect {
  return {
    left: centerX - width / 2,
    right: centerX + width / 2,
    top: anchorY - height,
    bottom: anchorY,
  };
}

function getHudObstacleRects(): Rect[] {
  const rects: Rect[] = [];
  const selectors = ['#stats-panel', '.hud-top', '.hud-meta-bar', '.hud-controls', '#pause-banner'];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el || el.classList.contains('hidden')) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) rects.push(r);
  }
  return rects;
}

function getDialogueObstacleRects(): Rect[] {
  const overlay = document.getElementById('dialogue-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return [];

  const rects: Rect[] = [];
  for (const sel of ['#speech-bubble', '#response-panel', '#hover-banner']) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el || el.classList.contains('hidden')) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) rects.push(r);
  }
  return rects;
}

function getBallObstacle(ballScreen?: { x: number; y: number }): Rect | null {
  if (!ballScreen) return null;
  return {
    left: ballScreen.x - BALL_AVOID_RADIUS,
    right: ballScreen.x + BALL_AVOID_RADIUS,
    top: ballScreen.y - BALL_AVOID_RADIUS,
    bottom: ballScreen.y + BALL_AVOID_RADIUS,
  };
}

function overlapsBlockedAreas(
  rect: Rect,
  input: OpponentBarkLayoutInput,
  obstacles: Rect[]
): boolean {
  const leftLane: Rect = {
    left: input.leftPaddleSafeScreen.left,
    right: input.leftPaddleSafeScreen.right,
    top: input.playfieldScreen.top,
    bottom: input.playfieldScreen.bottom,
  };
  const rightLane: Rect = {
    left: input.rightPaddleSafeScreen.left,
    right: input.rightPaddleSafeScreen.right,
    top: input.playfieldScreen.top,
    bottom: input.playfieldScreen.bottom,
  };

  if (rectsOverlap(rect, leftLane, 4) || rectsOverlap(rect, rightLane, 4)) return true;

  for (const obstacle of obstacles) {
    if (rectsOverlap(rect, obstacle, 8)) return true;
  }

  const ballObstacle = getBallObstacle(input.ballScreen);
  if (ballObstacle && rectsOverlap(rect, ballObstacle, 4)) return true;

  if (
    rect.left < input.canvasBounds.left + EDGE_PAD ||
    rect.right > input.canvasBounds.right - EDGE_PAD ||
    rect.top < input.playfieldScreen.top + EDGE_PAD ||
    rect.bottom > input.playfieldScreen.bottom - EDGE_PAD
  ) {
    return true;
  }

  return false;
}

function primaryCenterX(opponentSide: PaddleSide, paddleX: number, bubbleWidth: number): number {
  if (opponentSide === 'left') {
    const bubbleLeft = paddleX + PADDLE_HALF_SCREEN + HORIZONTAL_PAD;
    return bubbleLeft + bubbleWidth / 2;
  }
  const bubbleRight = paddleX - PADDLE_HALF_SCREEN - HORIZONTAL_PAD;
  return bubbleRight - bubbleWidth / 2;
}

function clampY(
  anchorY: number,
  bubbleHeight: number,
  playfield: ScreenBounds
): number {
  const minAnchor = playfield.top + EDGE_PAD + bubbleHeight;
  const maxAnchor = playfield.bottom - EDGE_PAD;
  return Math.min(maxAnchor, Math.max(minAnchor, anchorY));
}

function scorePosition(
  centerX: number,
  anchorY: number,
  width: number,
  height: number,
  input: OpponentBarkLayoutInput,
  obstacles: Rect[]
): number {
  const rect = bubbleRect(centerX, anchorY, width, height);
  if (overlapsBlockedAreas(rect, input, obstacles)) return Number.POSITIVE_INFINITY;

  let score = Math.abs(centerX - input.opponentPaddleScreen.x);
  score += Math.abs(anchorY - input.opponentPaddleScreen.y) * 0.35;
  return score;
}

/**
 * Position opponent bark away from paddle lanes and HUD.
 * Returns false when the bark should be hidden (e.g. during ball dialogue).
 */
export function positionOpponentBarkBubble(input: OpponentBarkLayoutInput): boolean {
  const { bubble, ballDialogueVisible } = input;

  if (ballDialogueVisible) {
    return false;
  }

  const wasHidden = bubble.classList.contains('hidden');
  bubble.classList.remove('hidden');
  bubble.classList.remove('opponent-bark-subtle');
  bubble.style.visibility = 'hidden';
  bubble.style.transform = 'translate(-50%, -100%)';

  const measured = bubble.getBoundingClientRect();
  const bubbleWidth = measured.width || 200;
  const bubbleHeight = measured.height || 56;

  const obstacles = [...getHudObstacleRects(), ...getDialogueObstacleRects()];

  const yCandidates = [
    input.opponentPaddleScreen.y - 18,
    input.opponentPaddleScreen.y + 28,
    input.fallbackCenterScreen.y,
    input.playfieldScreen.top + 96,
    input.playfieldScreen.bottom - 48,
  ].map((y) => clampY(y, bubbleHeight, input.playfieldScreen));

  const xCandidates = [
    primaryCenterX(input.opponentSide, input.opponentPaddleScreen.x, bubbleWidth),
    input.fallbackCenterScreen.x,
    input.opponentSide === 'left'
      ? input.leftPaddleSafeScreen.right + HORIZONTAL_PAD + bubbleWidth / 2
      : input.rightPaddleSafeScreen.left - HORIZONTAL_PAD - bubbleWidth / 2,
    (input.playfieldScreen.left + input.playfieldScreen.right) / 2,
  ];

  let bestX = xCandidates[0];
  let bestY = yCandidates[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const centerX of xCandidates) {
    for (const anchorY of yCandidates) {
      const score = scorePosition(centerX, anchorY, bubbleWidth, bubbleHeight, input, obstacles);
      if (score < bestScore) {
        bestScore = score;
        bestX = centerX;
        bestY = anchorY;
      }
    }
  }

  if (!Number.isFinite(bestScore)) {
    if (wasHidden) bubble.classList.add('hidden');
    return false;
  }

  bubble.style.left = `${bestX}px`;
  bubble.style.top = `${bestY}px`;
  bubble.style.visibility = 'visible';
  return true;
}

export function buildOpponentBarkLayoutInput(
  bubble: HTMLElement,
  opponentSide: PaddleSide,
  opponentPaddleScreen: { x: number; y: number },
  canvasBounds: ScreenBounds,
  playfield: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  },
  scale: { width: number; height: number },
  ballDialogueVisible: boolean,
  ballScreen?: { x: number; y: number }
): OpponentBarkLayoutInput {
  const scaleX = (canvasBounds.right - canvasBounds.left) / scale.width;
  const scaleY = (canvasBounds.bottom - canvasBounds.top) / scale.height;

  const playfieldScreen: ScreenBounds = {
    left: canvasBounds.left + playfield.left * scaleX,
    right: canvasBounds.left + playfield.right * scaleX,
    top: canvasBounds.top + playfield.top * scaleY,
    bottom: canvasBounds.top + playfield.bottom * scaleY,
  };

  const paddleSafeGame = GAME_LAYOUT.PADDLE_SAFE_ZONE_WIDTH;
  const leftPaddleSafeScreen = {
    left: playfieldScreen.left,
    right: playfieldScreen.left + paddleSafeGame * scaleX,
  };
  const rightPaddleSafeScreen = {
    left: playfieldScreen.right - paddleSafeGame * scaleX,
    right: playfieldScreen.right,
  };

  const fallbackCenterScreen = {
    x:
      opponentSide === 'left'
        ? playfieldScreen.left + 160 * scaleX
        : playfieldScreen.right - 360 * scaleX,
    y: Math.min(
      playfieldScreen.bottom - 120 * scaleY,
      Math.max(playfieldScreen.top + 80 * scaleY, opponentPaddleScreen.y)
    ),
  };

  return {
    bubble,
    opponentSide,
    opponentPaddleScreen,
    canvasBounds,
    playfieldScreen,
    leftPaddleSafeScreen,
    rightPaddleSafeScreen,
    fallbackCenterScreen,
    ballDialogueVisible,
    ballScreen,
  };
}
