import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { useDialog } from './confirm';

/** Renders the open dialog, if any. Mount once, near the root of the app. */
export function DialogHost() {
  const t = useT();
  const current = useDialog((s) => s.current);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!current) return;
    const previous = document.activeElement as HTMLElement | null;
    // the safe choice gets the focus for destructive actions
    (current.danger ? cancelRef : confirmRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        current.resolve(false);
      } else if (e.key === 'Tab') {
        // keep the focus inside the dialog (two buttons)
        e.preventDefault();
        const next = document.activeElement === confirmRef.current ? cancelRef : confirmRef;
        next.current?.focus();
      }
      e.stopPropagation(); // keeps the editor shortcuts quiet while the dialog is open
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [current]);

  if (!current) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && current.resolve(false)}>
      <div className="dialog frame" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-message">
        <h2 id="dialog-title">{current.title}</h2>
        <p id="dialog-message">{current.message}</p>
        <div className="dialog-actions">
          <button ref={cancelRef} className="btn" onClick={() => current.resolve(false)}>
            {t.dialog.cancel}
          </button>
          <button
            ref={confirmRef}
            className={current.danger ? 'btn-banner' : 'btn btn-gold'}
            onClick={() => current.resolve(true)}
          >
            {current.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
