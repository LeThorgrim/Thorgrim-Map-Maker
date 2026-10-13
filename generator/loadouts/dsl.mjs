// Small selector language for loadout rules. A selector is a predicate on a location:
//   { id, lon, lat, iso, adm, region }  (adm and region are the Natural Earth admin-1 name and region)

/** Whole present-day countries. */
export const iso = (...codes) => (l) => codes.includes(l.iso);
/** Natural Earth admin-1 units of a country, by name (all units when no name is given). */
export const adm = (code, ...names) => (l) => l.iso === code && (names.length === 0 || names.includes(l.adm));
/** Natural Earth admin-1 units of a country, by their "region" field. */
export const reg = (code, ...regions) => (l) => l.iso === code && regions.includes(l.region);
/** Locations whose centre lies within `km` of a point. */
export const near = (lon, lat, km) => (l) => {
  const r = Math.PI / 180;
  const a = Math.sin(((l.lat - lat) * r) / 2) ** 2 + Math.cos(l.lat * r) * Math.cos(lat * r) * Math.sin(((l.lon - lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a)) <= km;
};
/** Locations whose centre lies in a lon/lat box. */
export const box = (lon0, lat0, lon1, lat1) => (l) => l.lon >= lon0 && l.lon <= lon1 && l.lat >= lat0 && l.lat <= lat1;
export const north = (lat) => (l) => l.lat >= lat;
export const south = (lat) => (l) => l.lat < lat;
export const east = (lon) => (l) => l.lon >= lon;
export const west = (lon) => (l) => l.lon < lon;
export const and = (...s) => (l) => s.every((f) => f(l));
export const not = (s) => (l) => !s(l);
