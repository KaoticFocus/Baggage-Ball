/** True when the event target is an editable field that should receive normal typing. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;

  const el = target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  if (!el) return false;

  if (el instanceof HTMLElement && el.isContentEditable) return true;

  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** True when keyboard input should go to a form field, not gameplay hotkeys. */
export function isTypingInFormField(): boolean {
  return isEditableTarget(document.activeElement);
}
