'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Info, LoaderCircle, X } from 'lucide-react';
import '../app/action-dialog.css';

export type ActionDialogMode = 'confirm' | 'success' | 'error' | 'info';

export type ActionDialogProps = {
  open: boolean;
  mode?: ActionDialogMode;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm?: () => void | Promise<void>;
  onClose: () => void;
  onError?: (error: unknown) => void;
};

/** A focused confirmation or result dialog. Import and render it once near the page root. */
export default function ActionDialog({
  open,
  mode = 'confirm',
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onClose,
  onError,
}: ActionDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const busy = loading || pending;
  const isConfirm = mode === 'confirm';
  const danger = isConfirm && destructive;
  const icon = danger ? <AlertTriangle size={25} strokeWidth={2.1} />
    : mode === 'success' ? <Check size={25} strokeWidth={2.4} />
    : mode === 'error' ? <X size={25} strokeWidth={2.3} />
    : <Info size={25} strokeWidth={2.1} />;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      (isConfirm ? cancelRef.current : actionRef.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, isConfirm]);

  useEffect(() => {
    if (!open) setPending(false);
  }, [open]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleConfirm() {
    if (busy || !onConfirm) return;
    try {
      const result = onConfirm();
      if (result instanceof Promise) {
        setPending(true);
        await result;
      }
    } catch (error) {
      onError?.(error);
    } finally {
      setPending(false);
    }
  }

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="action-dialog-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <div
        ref={panelRef}
        className={`action-dialog action-dialog--${danger ? 'danger' : mode}`}
        role={mode === 'error' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onKeyDown={handleKeyDown}
      >
        <span className="action-dialog__icon" aria-hidden="true">{icon}</span>
        <h2 id={titleId} className="action-dialog__title">{title}</h2>
        {description && <p id={descriptionId} className="action-dialog__description">{description}</p>}
        <div className="action-dialog__actions">
          {isConfirm && (
            <button ref={cancelRef} type="button" className="action-dialog__button action-dialog__button--cancel" disabled={busy} onClick={onClose}>
              {cancelLabel}
            </button>
          )}
          <button
            ref={actionRef}
            type="button"
            className={`action-dialog__button action-dialog__button--${danger ? 'danger' : 'primary'}`}
            disabled={busy}
            onClick={isConfirm ? handleConfirm : onClose}
          >
            {busy && <LoaderCircle size={17} className="action-dialog__spinner" aria-hidden="true" />}
            {confirmLabel ?? (isConfirm ? (danger ? 'Delete' : 'Confirm') : 'Done')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
