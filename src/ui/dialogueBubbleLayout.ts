export type ScreenBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function truncateHoverText(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;

  const chunk = cleaned.slice(0, maxLength);
  const breakAt = Math.max(
    chunk.lastIndexOf('. '),
    chunk.lastIndexOf('! '),
    chunk.lastIndexOf('? ')
  );
  if (breakAt > maxLength * 0.35) {
    return chunk.slice(0, breakAt + 1).trim();
  }
  return `${chunk.slice(0, maxLength - 3).trim()}...`;
}

/** Position speech bubble near ball, clamped inside canvas screen bounds. */
export function positionDialogueBubbleNearBall(
  ballScreenX: number,
  ballScreenY: number,
  bubble: HTMLElement,
  bounds: ScreenBounds,
  padding = 12
): void {
  bubble.style.visibility = 'hidden';
  bubble.style.left = `${ballScreenX}px`;
  bubble.style.top = `${ballScreenY}px`;

  const bubbleWidth = bubble.offsetWidth || 280;
  const bubbleHeight = bubble.offsetHeight || 100;

  const placeAbove = ballScreenY - bubbleHeight - padding >= bounds.top + padding;
  let top = placeAbove ? ballScreenY - 12 : ballScreenY + 20;
  let transform = placeAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)';
  bubble.classList.toggle('bubble-below', !placeAbove);

  let left = ballScreenX;
  const halfW = bubbleWidth / 2;
  const minX = bounds.left + padding + halfW;
  const maxX = bounds.right - padding - halfW;
  left = Math.min(maxX, Math.max(minX, left));

  if (placeAbove) {
    top = Math.max(bounds.top + padding, top);
  } else {
    const maxTop = bounds.bottom - padding - bubbleHeight;
    top = Math.min(maxTop, top);
  }

  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
  bubble.style.transform = transform;
  bubble.style.visibility = 'visible';
}
