import { GAME_LAYOUT } from '../game/layout/GameLayout';
import type { PaddleSide } from '../game/settings/PlayerSettings';
import type { ScreenBounds } from './dialogueBubbleLayout';

export const OPPONENT_THOUGHT_WIDTH_PX = 260;
export const OPPONENT_THOUGHT_MIN_HEIGHT_PX = 76;

export type OpponentBarkLayoutInput = {
  bubble: HTMLElement;
  opponentSide: PaddleSide;
  opponentPaddleScreen: { x: number; y: number };
  canvasBounds: ScreenBounds;
  playfieldScreen: ScreenBounds;
  leftPaddleSafeScreen: { left: number; right: number };
  rightPaddleSafeScreen: { left: number; right: number };
  ballDialogueVisible: boolean;
};

export type OpponentThoughtAnchor = {
  left: number;
  top: number;
  side: PaddleSide;
};

type Rect = { left: number; top: number; right: number; bottom: number };

const EDGE_PAD = 12;
const LANE_GAP = 16;
const THOUGHT_HEIGHT_ESTIMATE = 110;

function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return !(
    a.right + margin < b.left ||
    a.left - margin > b.right ||
    a.bottom + margin < b.top ||
    a.top - margin > b.bottom
  );
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
  for (const sel of ['#dialogue-cluster', '#hover-banner']) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el || el.classList.contains('hidden')) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) rects.push(r);
  }
  return rects;
}

function thoughtBubbleRect(left: number, top: number): Rect {
  return {
    left,
    top,
    right: left + OPPONENT_THOUGHT_WIDTH_PX,
    bottom: top + THOUGHT_HEIGHT_ESTIMATE,
  };
}

function overlapsBlockedAreas(rect: Rect, input: OpponentBarkLayoutInput, obstacles: Rect[]): boolean {
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

  if (rectsOverlap(rect, leftLane, 6) || rectsOverlap(rect, rightLane, 6)) return true;

  for (const obstacle of obstacles) {
    if (rectsOverlap(rect, obstacle, 10)) return true;
  }

  if (
    rect.left < input.playfieldScreen.left + EDGE_PAD ||
    rect.right > input.playfieldScreen.right - EDGE_PAD ||
    rect.top < input.playfieldScreen.top + EDGE_PAD ||
    rect.bottom > input.playfieldScreen.bottom - EDGE_PAD
  ) {
    return true;
  }

  return false;
}

function baseAnchorTop(input: OpponentBarkLayoutInput): number {
  const playfieldHeight = input.playfieldScreen.bottom - input.playfieldScreen.top;
  return input.playfieldScreen.top + playfieldHeight * 0.36;
}

function baseAnchorLeft(input: OpponentBarkLayoutInput): number {
  if (input.opponentSide === 'left') {
    return input.leftPaddleSafeScreen.right + LANE_GAP;
  }
  return input.rightPaddleSafeScreen.left - OPPONENT_THOUGHT_WIDTH_PX - LANE_GAP;
}

/**
 * Fixed thought-bubble anchor on the opponent side of the court.
 * Does not follow paddle Y — stable while a bark is visible.
 */
export function computeOpponentThoughtAnchor(
  input: OpponentBarkLayoutInput
): OpponentThoughtAnchor | null {
  if (input.ballDialogueVisible) return null;

  const obstacles = [...getHudObstacleRects(), ...getDialogueObstacleRects()];
  const left = baseAnchorLeft(input);
  const yOffsets = [0, -48, 48, -96, 96];

  for (const yOffset of yOffsets) {
    const top = baseAnchorTop(input) + yOffset;
    const rect = thoughtBubbleRect(left, top);
    if (!overlapsBlockedAreas(rect, input, obstacles)) {
      return { left, top, side: input.opponentSide };
    }
  }

  return null;
}

export function getOpponentBarkLayoutKey(input: OpponentBarkLayoutInput): string {
  const b = input.canvasBounds;
  const p = input.playfieldScreen;
  return [
    input.opponentSide,
    Math.round(b.left),
    Math.round(b.top),
    Math.round(b.right),
    Math.round(b.bottom),
    Math.round(p.left),
    Math.round(p.right),
    Math.round(p.top),
    Math.round(p.bottom),
    input.ballDialogueVisible ? 'dialogue' : 'play',
  ].join('|');
}

function applyThoughtSideClass(bubble: HTMLElement, side: PaddleSide): void {
  bubble.classList.toggle('opponent-thought-left', side === 'left');
  bubble.classList.toggle('opponent-thought-right', side === 'right');
}

/**
 * Position opponent thought bubble at a fixed court-side anchor.
 * Returns false when the bark should be hidden (e.g. during ball dialogue).
 */
export function positionOpponentBarkBubble(input: OpponentBarkLayoutInput): boolean {
  const { bubble } = input;
  const anchor = computeOpponentThoughtAnchor(input);

  if (!anchor) {
    return false;
  }

  applyThoughtSideClass(bubble, anchor.side);
  bubble.style.transform = 'none';
  bubble.style.left = `${anchor.left}px`;
  bubble.style.top = `${anchor.top}px`;
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
  ballDialogueVisible: boolean
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

  return {
    bubble,
    opponentSide,
    opponentPaddleScreen,
    canvasBounds,
    playfieldScreen,
    leftPaddleSafeScreen,
    rightPaddleSafeScreen,
    ballDialogueVisible,
  };
}
