/** True when keyboard input should go to a form field, not gameplay hotkeys. */
export function isTypingInFormField(): boolean {
  const el = document.activeElement;
  if (!el) return false;

  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }

  return (el as HTMLElement).isContentEditable === true;
}
