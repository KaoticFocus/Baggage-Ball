import { GAME_LAYOUT } from '../game/layout/GameLayout';
import type { PaddleSide } from '../game/settings/PlayerSettings';
import type { ScreenBounds } from './dialogueBubbleLayout';

export const OPPONENT_THOUGHT_WIDTH_PX = 260;
export const OPPONENT_THOUGHT_MIN_HEIGHT_PX = 76;

export const OPPONENT_DIALOGUE_EDGE_PADDING = GAME_LAYOUT.OPPONENT_DIALOGUE_EDGE_PADDING;
export const OPPONENT_DIALOGUE_PLAYFIELD_CLEARANCE =
  GAME_LAYOUT.OPPONENT_DIALOGUE_PLAYFIELD_CLEARANCE;
export const OPPONENT_DIALOGUE_GUTTER_MIN_WIDTH = GAME_LAYOUT.OPPONENT_DIALOGUE_GUTTER_MIN_WIDTH;
export const OPPONENT_DIALOGUE_VERTICAL_EDGE_PADDING =
  GAME_LAYOUT.OPPONENT_DIALOGUE_VERTICAL_EDGE_PADDING;
export const OPPONENT_DIALOGUE_PADDLE_TRACK_STEP_PX =
  GAME_LAYOUT.OPPONENT_DIALOGUE_PADDLE_TRACK_STEP_PX;

export type OpponentBarkLayoutInput = {
  bubble: HTMLElement;
  opponentSide: PaddleSide;
  playerSide?: PaddleSide;
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
type GutterBounds = { left: number; right: number };

const THOUGHT_HEIGHT_FALLBACK = 110;

function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return !(
    a.right + margin < b.left ||
    a.left - margin > b.right ||
    a.bottom + margin < b.top ||
    a.top - margin > b.bottom
  );
}

function getViewportBounds(): ScreenBounds {
  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
}

function getHudObstacleRects(): Rect[] {
  const rects: Rect[] = [];
  const selectors = [
    '#stats-panel',
    '.hud-top',
    '.hud-meta-bar',
    '.hud-controls',
    '#pause-banner',
    '#outburst-label',
  ];
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

function thoughtBubbleRect(left: number, top: number, height: number): Rect {
  return {
    left,
    top,
    right: left + OPPONENT_THOUGHT_WIDTH_PX,
    bottom: top + height,
  };
}

function measureBubbleHeight(bubble: HTMLElement): number {
  if (bubble.classList.contains('hidden')) {
    return THOUGHT_HEIGHT_FALLBACK;
  }
  const measured = bubble.getBoundingClientRect().height;
  return measured > 0 ? measured : THOUGHT_HEIGHT_FALLBACK;
}

export function quantizeOpponentPaddleY(y: number): number {
  const step = OPPONENT_DIALOGUE_PADDLE_TRACK_STEP_PX;
  return Math.round(y / step) * step;
}

/** Derive opponent side from where the opponent paddle actually sits on screen. */
export function resolveOpponentSideFromPaddleScreen(
  paddleScreenX: number,
  playfieldScreen: ScreenBounds
): PaddleSide {
  const courtCenterX = (playfieldScreen.left + playfieldScreen.right) / 2;
  return paddleScreenX < courtCenterX ? 'left' : 'right';
}

/**
 * Dialogue gutter outside the playfield, between the viewport edge and court boundary.
 */
export function computeOpponentDialogueGutter(
  input: OpponentBarkLayoutInput
): GutterBounds | null {
  const viewport = getViewportBounds();
  const playfield = input.playfieldScreen;

  if (input.opponentSide === 'left') {
    const left = viewport.left + OPPONENT_DIALOGUE_EDGE_PADDING;
    const right = playfield.left - OPPONENT_DIALOGUE_PLAYFIELD_CLEARANCE;
    if (right - left < OPPONENT_DIALOGUE_GUTTER_MIN_WIDTH) return null;
    return { left, right };
  }

  const left = playfield.right + OPPONENT_DIALOGUE_PLAYFIELD_CLEARANCE;
  const right = viewport.right - OPPONENT_DIALOGUE_EDGE_PADDING;
  if (right - left < OPPONENT_DIALOGUE_GUTTER_MIN_WIDTH) return null;
  return { left, right };
}

function computeGutterBubbleLeft(gutter: GutterBounds, side: PaddleSide): number {
  const width = OPPONENT_THOUGHT_WIDTH_PX;
  const span = gutter.right - gutter.left;

  if (span <= width) {
    return side === 'left' ? gutter.left : gutter.right - width;
  }

  if (side === 'left') {
    return gutter.right - width;
  }
  return gutter.left;
}

function clampBubbleTop(
  targetTop: number,
  bubbleHeight: number,
  _obstacles: Rect[]
): number {
  const viewport = getViewportBounds();
  const minTop = viewport.top + OPPONENT_DIALOGUE_VERTICAL_EDGE_PADDING;
  const maxTop = viewport.bottom - OPPONENT_DIALOGUE_VERTICAL_EDGE_PADDING - bubbleHeight;

  if (maxTop < minTop) {
    return Math.max(viewport.top, Math.min(targetTop, viewport.bottom - bubbleHeight));
  }

  return Math.max(minTop, Math.min(maxTop, targetTop));
}

function overlapsBlockedAreas(
  rect: Rect,
  input: OpponentBarkLayoutInput,
  obstacles: Rect[]
): boolean {
  const playfield = input.playfieldScreen;
  const playfieldPad = OPPONENT_DIALOGUE_PLAYFIELD_CLEARANCE;

  if (input.opponentSide === 'left') {
    if (rect.right > playfield.left - playfieldPad) return true;
  } else if (rect.left < playfield.right + playfieldPad) {
    return true;
  }

  const courtCenterX = (playfield.left + playfield.right) / 2;
  const bubbleCenterX = (rect.left + rect.right) / 2;
  if (input.opponentSide === 'left' && bubbleCenterX > courtCenterX) return true;
  if (input.opponentSide === 'right' && bubbleCenterX < courtCenterX) return true;

  const leftLane: Rect = {
    left: input.leftPaddleSafeScreen.left,
    right: input.leftPaddleSafeScreen.right,
    top: playfield.top,
    bottom: playfield.bottom,
  };
  const rightLane: Rect = {
    left: input.rightPaddleSafeScreen.left,
    right: input.rightPaddleSafeScreen.right,
    top: playfield.top,
    bottom: playfield.bottom,
  };
  if (rectsOverlap(rect, leftLane, 8) || rectsOverlap(rect, rightLane, 8)) return true;

  const viewport = getViewportBounds();
  if (
    rect.left < viewport.left + OPPONENT_DIALOGUE_EDGE_PADDING - 1 ||
    rect.right > viewport.right - OPPONENT_DIALOGUE_EDGE_PADDING + 1 ||
    rect.top < viewport.top + OPPONENT_DIALOGUE_VERTICAL_EDGE_PADDING - 1 ||
    rect.bottom > viewport.bottom - OPPONENT_DIALOGUE_VERTICAL_EDGE_PADDING + 1
  ) {
    return true;
  }

  for (const obstacle of obstacles) {
    if (rectsOverlap(rect, obstacle, 10)) return true;
  }

  return false;
}

/**
 * Place the thought bubble in the opponent-side gutter, near paddle Y with modest tracking.
 */
export function computeOpponentThoughtAnchor(
  input: OpponentBarkLayoutInput
): OpponentThoughtAnchor | null {
  if (input.ballDialogueVisible) return null;

  const gutter = computeOpponentDialogueGutter(input);
  if (!gutter) return null;

  const bubbleHeight = measureBubbleHeight(input.bubble);
  const obstacles = [...getHudObstacleRects(), ...getDialogueObstacleRects()];
  const left = computeGutterBubbleLeft(gutter, input.opponentSide);
  const paddleY = quantizeOpponentPaddleY(input.opponentPaddleScreen.y);
  const targetTop = paddleY - bubbleHeight / 2;
  const yNudges = [0, -40, 40, -80, 80, -120, 120];

  for (const yNudge of yNudges) {
    const top = clampBubbleTop(targetTop + yNudge, bubbleHeight, obstacles);
    const rect = thoughtBubbleRect(left, top, bubbleHeight);
    if (!overlapsBlockedAreas(rect, input, obstacles)) {
      return { left, top, side: input.opponentSide };
    }
  }

  return null;
}

export function getOpponentBarkLayoutKey(input: OpponentBarkLayoutInput): string {
  const b = input.canvasBounds;
  const p = input.playfieldScreen;
  const paddleY = quantizeOpponentPaddleY(input.opponentPaddleScreen.y);
  return [
    input.opponentSide,
    paddleY,
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
 * Position opponent thought bubble in the outside-court dialogue gutter.
 * Returns false when the bark should be hidden (e.g. during ball dialogue).
 */
export function positionOpponentBarkBubble(input: OpponentBarkLayoutInput): boolean {
  const { bubble } = input;
  const anchor = computeOpponentThoughtAnchor(input);

  if (!anchor) {
    return false;
  }

  if (import.meta.env.DEV) {
    const expectedOpposite =
      input.playerSide === 'left' ? 'right' : input.playerSide === 'right' ? 'left' : undefined;
    if (expectedOpposite && anchor.side !== expectedOpposite) {
      console.warn(
        `[Opponent Bark Layout] opponentSide mismatch: expected ${expectedOpposite} from playerSide=${input.playerSide}, got ${anchor.side}`
      );
    }
    console.log('[Opponent Bark Layout]', {
      playerSide: input.playerSide ?? 'unknown',
      opponentSide: anchor.side,
      bubbleLeft: Math.round(anchor.left),
      playfieldLeft: Math.round(input.playfieldScreen.left),
      playfieldRight: Math.round(input.playfieldScreen.right),
    });
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
  ballDialogueVisible: boolean,
  playerSide?: PaddleSide
): OpponentBarkLayoutInput {
  const scaleX = (canvasBounds.right - canvasBounds.left) / scale.width;
  const scaleY = (canvasBounds.bottom - canvasBounds.top) / scale.height;

  const playfieldScreen: ScreenBounds = {
    left: canvasBounds.left + playfield.left * scaleX,
    right: canvasBounds.left + playfield.right * scaleX,
    top: canvasBounds.top + playfield.top * scaleY,
    bottom: canvasBounds.top + playfield.bottom * scaleY,
  };

  const resolvedOpponentSide = resolveOpponentSideFromPaddleScreen(
    opponentPaddleScreen.x,
    playfieldScreen
  );

  if (import.meta.env.DEV && opponentSide !== resolvedOpponentSide) {
    console.warn(
      `[Opponent Bark Layout] passed opponentSide=${opponentSide} does not match paddle position; using ${resolvedOpponentSide}`
    );
  }

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
    opponentSide: resolvedOpponentSide,
    playerSide,
    opponentPaddleScreen,
    canvasBounds,
    playfieldScreen,
    leftPaddleSafeScreen,
    rightPaddleSafeScreen,
    ballDialogueVisible,
  };
}
