import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** Styles the confirm button as a destructive action. */
  danger?: boolean;
}

interface DialogState {
  current: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
}

export const useDialog = create<DialogState>()(() => ({ current: null }));

/**
 * Asks the user to confirm an action in a modal dialog (in place of `window.confirm`).
 * Resolves to true when confirmed, false when cancelled (button, Escape or click outside).
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  useDialog.getState().current?.resolve(false);
  return new Promise((resolve) => {
    useDialog.setState({
      current: {
        ...options,
        resolve: (ok) => {
          useDialog.setState({ current: null });
          resolve(ok);
        },
      },
    });
  });
}
