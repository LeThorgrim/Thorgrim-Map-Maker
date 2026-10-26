import { useStore, type SavedState } from './store';

const keyFor = (mapId: string) => `mapmaker:v2:${mapId}`;

/** Restores the last version of the map, then saves it after every change. */
export function startAutosave(mapId: string) {
  try {
    const raw = localStorage.getItem(keyFor(mapId));
    if (raw) useStore.getState().restore(JSON.parse(raw));
  } catch {
    /* storage unavailable or unreadable save: start from a blank map */
  }
  let timer = 0;
  const save = () => {
    try {
      localStorage.setItem(keyFor(mapId), JSON.stringify(useStore.getState().serialize()));
    } catch {
      /* quota exceeded or private browsing: the local save is a convenience, not a guarantee */
    }
  };
  const unsub = useStore.subscribe((s, prev) => {
    if (
      s.revision === prev.revision &&
      s.countries === prev.countries &&
      s.activeId === prev.activeId &&
      s.overlays === prev.overlays &&
      s.activeOverlayId === prev.activeOverlayId &&
      s.legend === prev.legend &&
      s.legendTitle === prev.legendTitle &&
      s.legendShowTitle === prev.legendShowTitle
    )
      return;
    clearTimeout(timer);
    timer = window.setTimeout(save, 400);
  });
  return () => {
    unsub();
    if (timer) {
      clearTimeout(timer);
      save(); // keep the very last change when leaving the map
    }
  };
}

/** Summary of the local save of a map, for the home screen. */
export function savedSummary(mapId: string): { painted: number; countries: number } | null {
  try {
    const raw = localStorage.getItem(keyFor(mapId));
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedState;
    let painted = 0;
    for (let i = 0; i + 1 < s.owner.length; i += 2) if (s.owner[i]) painted += s.owner[i + 1];
    return { painted, countries: s.countries.length };
  } catch {
    return null;
  }
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveToFile() {
  const { map, serialize } = useStore.getState();
  download(new Blob([JSON.stringify(serialize())], { type: 'application/json' }), `${map?.id ?? 'map'}.mapmaker.json`);
}

/** Loads a save file. Returns an error code, or null on success. */
export async function openFile(file: File): Promise<'otherMap' | 'invalidFile' | null> {
  try {
    const saved = JSON.parse(await file.text()) as SavedState;
    return useStore.getState().restore(saved) ? null : 'otherMap';
  } catch {
    return 'invalidFile';
  }
}
