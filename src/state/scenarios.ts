import { pick, useLang } from '../i18n';
import { loadLoadout, type LoadoutInfo, type MapData } from '../map/loadMap';
import { useStore } from './store';

/**
 * Replaces the map with a loadout, or with a blank map when `loadout` is null. Asks for
 * confirmation first when the current map has been painted. The change can be undone.
 */
export async function startFrom(
  map: MapData,
  loadout: LoadoutInfo | null,
  confirmText: (name: string) => string,
  blankName: string,
): Promise<void> {
  const { owner, countries } = useStore.getState();
  const used = countries.length > 0 || owner.some((o) => o > 0);
  const lang = useLang.getState().lang;
  if (used && !confirm(confirmText(loadout ? pick(loadout.name, lang) : blankName))) return;
  const data = loadout ? await loadLoadout(map.id, loadout.id) : null;
  useStore.getState().applyLoadout(data);
}
