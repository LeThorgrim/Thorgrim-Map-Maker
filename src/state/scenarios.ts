import { pick, useLang } from '../i18n';
import type { Messages } from '../i18n/en';
import { loadLoadout, type LoadoutInfo, type MapData } from '../map/loadMap';
import { confirmDialog } from '../ui/confirm';
import { useStore } from './store';

/**
 * Replaces the map with a loadout, or with a blank map when `loadout` is null. Asks for
 * confirmation first when the current map is not empty. The change can be undone.
 */
export async function startFrom(map: MapData, loadout: LoadoutInfo | null, t: Messages): Promise<void> {
  const { owner, countries } = useStore.getState();
  const used = countries.length > 0 || owner.some((o) => o > 0);
  const name = loadout ? pick(loadout.name, useLang.getState().lang) : t.panel.blank;
  if (used) {
    const ok = await confirmDialog({ title: t.panel.replaceTitle, message: t.panel.confirmReplace(name), confirmLabel: t.panel.replace });
    if (!ok) return;
  }
  const data = loadout ? await loadLoadout(map.id, loadout.id) : null;
  useStore.getState().applyLoadout(data);
}
