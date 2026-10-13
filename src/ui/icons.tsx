const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const BrushIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 9.2 12z" />
    <path d="M9.2 12c-2 0-3.7 1.6-3.7 3.6 0 1.6-.9 2.9-2.5 3.6 1.2 1 2.8 1.6 4.5 1.6 3.1 0 5.6-2.4 5.6-5.3z" />
  </svg>
);
export const EraserIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M7 20h13" />
    <path d="M4.6 15.6 14.8 5.4a2 2 0 0 1 2.8 0l2.8 2.8a2 2 0 0 1 0 2.8L11 20H8.4l-3.8-3.6a.6.6 0 0 1 0-.8z" />
    <path d="m9.5 10.5 5.5 5.5" />
  </svg>
);
export const PipetteIcon = () => (
  <svg {...base} aria-hidden>
    <path d="m14 7 3 3" />
    <path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L18 9l-3-3z" />
    <path d="M15 6 5 16v3h3L18 9" />
  </svg>
);
export const UndoIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);
export const RedoIcon = () => (
  <svg {...base} aria-hidden>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
);
export const PlusIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const MinusIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M5 12h14" />
  </svg>
);
export const FitIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
export const CloseIcon = () => (
  <svg {...base} width={14} height={14} aria-hidden>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const BackIcon = () => (
  <svg {...base} width={15} height={15} aria-hidden>
    <path d="m15 18-6-6 6-6" />
  </svg>
);
