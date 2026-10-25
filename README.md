# Thorgim Map Maker

A map editor in the spirit of Europa Universalis: pick a map, create countries and paint their
borders location by location — or start from a historical loadout (1444, 1914, today).

The interface is available in English (default) and French.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

The "Europe and the Mediterranean" map and its loadouts are already generated in
`public/maps/europe/`. To regenerate them, or to create another map:

```bash
npm run generate -- --id=europe --zones=5000 --seed=1337   # the map (~1 min, ~4 GB of RAM)
npm run loadouts -- --id=europe                            # its loadouts and thumbnail (~20 s)
npm run check-map -- --id=europe                           # checks that the hierarchy is continuous by land
```

`generate` options: `--id` (folder and identifier of the map), `--name` and `--description`
(shown on the home screen), `--zones` (target number of locations), `--seed`, `--width` (image
width, 4096 by default). Each run adds or updates the map in `public/maps/index.json`, which feeds
the home screen. The first run downloads Natural Earth boundaries (40 MB, from GitHub) and reads
the OSM coastlines (134 MB); `loadouts` downloads historical-basemaps snapshots.

## Using the editor

| Action | Input |
| --- | --- |
| Paint / erase / pick | left click or drag · tools `B` / `E` / `I` |
| Click scope | `1` location, `2` province, `3` area, `4` region |
| Scope on the fly | `Shift` + click = province, `Ctrl` + click = area, `Alt` + click = region |
| Quick pick | right click without moving |
| Pan | right or middle drag, or `Space` + drag |
| Zoom | mouse wheel · `0` to fit |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` (or `Ctrl+Shift+Z`) |
| New country | `N` |

**Countries and overlays.** *Countries* fill locations with a colour. *Overlays* carry extra
information on top (alliances, occupations, claims, religions…), drawn either as a coloured
outline along their borders or as diagonal hatching. Each style is a separate channel, so a
location can carry one outlined overlay and one hatched overlay at the same time. Selecting a
country or an overlay in the side panel decides what the tools work on:

- the brush writes the active overlay into the channel of its style (replacing the overlay of
  that style there, never the other one);
- the eraser clears only that channel, so an outline can be removed without touching the hatching;
- on a location with both, the pipette picks the overlay of the other style, so two clicks cycle
  between them;
- switching an overlay to the other style moves its locations to the other channel; where another
  overlay of that style is already present, a confirmation lists it first (undoable).

Both sections of the panel fold away.

**Names, legend and display.** Country names are written on the map, EU style: on the main
piece of each country (the one with the most locations, so France is named in France rather than
in Algeria), at its most interior point (the pole of inaccessibility, from a distance transform),
along its main axis and sized to fit. Other large pieces get their own name. Placements are
recomputed shortly after painting stops (`src/map/labels.ts`); names that grow too large when
zooming in fade out. When a full name does not fit, a shorter form is tried: initials for a name
of several words ("Holy Roman Empire" → "HRE", small words such as "of" or "de" left out), a cut
word for a single word ("Castile" → "CAST.", then "CAS."). The "A" switch next to each country
hides its name on the map (and in the export); it only applies while names are turned on in the
display menu. The legend lists the painted countries, largest first, and the overlays in
use. The eye button (top right) shows or hides country names, the legend, overlays and the
borders between locations; the PNG export follows the same settings.

Maps start blank. "Start from" replaces the current map with a loadout (undoable with `Ctrl+Z`);
the home screen also links straight to each loadout. Each map is saved automatically in the
browser. "Save" and "Open" use a `.mapmaker.json` file; "Export as PNG" renders the whole map
4096 px wide.

## How the map is built

1. **Land and sea**: OpenStreetMap coastlines (package `@geo-maps/earth-lands-10m`).
2. **Real units**: Natural Earth admin-1 boundaries (départements, provinces, counties,
   voivodeships…). Units too small for one location are merged with a neighbour of the same
   administrative region.
3. **Locations**: each unit is split into evenly sized locations. The target size follows a slowly
   varying density (small in the heart of Europe, large in the far north, the steppes and deserts).
4. **The 2× rule** (as in EU): no location may be more than twice the size of any of its land
   neighbours. The generator merges locations that are too small and cuts those that are too large.
   On the bundled map 99.4 % of neighbouring pairs follow the rule; the exceptions are mostly in
   deserts, between units of very different sizes.
5. **One piece per location**: a location never has an exclave. Apart from islands (pieces
   surrounded by sea), a detached piece joins the neighbouring location it shares most border with,
   or becomes a location of its own when it is large enough. Archipelagos listed in
   `ISLAND_PROVINCES` (`realdata.mjs`, e.g. the Balearic Islands) give each main island its own
   location and province; nearby islets join the closest island.
6. **Names**: each location takes the name of the largest real town it contains (GeoNames, package
   `all-the-cities`), with English and French exonyms and some historical names (`realdata.mjs`:
   Constantinople, Königsberg, Danzig…). Locations without a town get a landscape name
   ("Siwa Desert").
7. **Hierarchy**:
   - province = present-day administrative unit; a large unit (≥ 12 locations, e.g. Bavaria)
     becomes an area split into provinces named after their main town;
   - area = administrative region (French région, German Land, Spanish community…), or a group of
     neighbouring provinces when the country has none;
   - region = historical macro-region (Iberia, Bohemia, Muscovy, Ifriqiya…), see `historicRegion()`.
8. **Land continuity**: every province, area and region is made continuous by land
   (`makeContiguous()`). A detached piece joins the neighbouring group of the same parent and,
   preferably, the same country (East Tyrol, Vorarlberg, Kalmykia's western districts…). Islands
   stay with their group across the sea, and so do pieces that only border another country
   (Zeelandic Flanders, Ceuta). `npm run check-map` reports any remaining split.

## Loadouts

A loadout assigns every location to a country (`public/maps/<id>/loadouts/<loadout>.json`).

- **1444** starts from the historical-basemaps 1400 snapshot, then applies about 150 rules in
  `generator/loadouts/1444.mjs` (present-day units, town radii, lon/lat boxes) to draw the states
  of November 1444: Burgundy, the Italian states, the main princes of the Empire, the Russian
  principalities, the Anatolian beyliks… About 100 countries; vassals are folded into their overlord
  except where they matter. The borders are approximations at the scale of a location.
- **1914** uses the historical-basemaps 1914 snapshot, with a few fixes (Finland and the Caucasus
  in the Russian Empire, Algeria in France, Libya and the Dodecanese in Italy…).
- **Today** uses the Natural Earth country of each location, with internationally recognised
  borders.

Rules use a small selector language (`generator/loadouts/dsl.mjs`): `iso('FR')`,
`adm('FR', 'Nord')`, `reg('IT', 'Toscana')`, `near(lon, lat, km)`, `box(…)`, `north(lat)`, `and`, `not`.
Later rules override earlier ones; a `null` country leaves locations unclaimed.

## Languages

Interface texts live in `src/i18n/en.ts` (reference) and `src/i18n/fr.ts`, typed against the
English file so a missing key fails to compile. Map data carries its names in every language
(`names.en`, `names.fr` in `zones.json`; `{ en, fr }` labels in `index.json` and loadouts). To add
a language: add a messages file and list it in `src/i18n/index.ts`, then add it to `LANGS` and to
the labels in `generator/realdata.mjs` and the loadouts.

## Art direction

The interface borrows from grand strategy games: dark walnut panels framed in gold, parchment
for documents (tooltips, the scenario list on the home screen), Roman capitals for titles
(Cinzel), a calligraphic serif for place names (Alegreya) and Alegreya Sans for controls. Country
swatches are heraldic shields. The map shader paints parchment land with a paper grain (its fine
octaves fade out when zoomed out, to avoid speckle), a slate-teal sea with engraved shore lines,
sepia coasts and an inner shading along country borders. The home thumbnail is rendered from the
1444 loadout in the same colours. Design tokens are at the top of `src/index.css`.

## Architecture

```
generator/
  generate.mjs      real data → locations → 2× rule → names → hierarchy → files
  loadouts.mjs      loadouts of a generated map, home thumbnail
  check-continuity.mjs  report of provinces / areas / regions split by land
  loadouts/         rules of each loadout (1444, 1914, today) and their selector language
  realdata.mjs      historical regions, localized town and region names
  lib.mjs           projection, raster, connected components, distance transform, graph clustering
public/maps/
  index.json        available maps and their loadouts (home screen)
  europe/
    ids.png         16-bit PNG: location id of each pixel (0 = sea)
    coast.png       distance to the coast, for the sea gradient
    thumb.png       home screen thumbnail
    zones.json      hierarchy, neighbours, centres, names in every language
    loadouts/       1444.json, 1914.json, today.json
src/
  App.tsx           routing: #/ = list of maps, #/map/<id>[/<loadout>] = editor
  Home.tsx          list of maps
  Editor.tsx        editor of one map
  i18n/             messages (en, fr), current language, helpers
  map/loadMap.ts    loading and indexing of the data
  map/renderer.ts   WebGL2: the whole map is drawn by one fragment shader
  map/MapCanvas.tsx camera, mouse, store bindings
  state/store.ts    Zustand: owners, countries, tools, undo history
  state/persist.ts  local save and files
  state/scenarios.ts loading a loadout
  ui/               side panel, hover card, language switch
```

**Rendering.** React only handles the interface. The map is a single full-screen triangle: the
shader reads the location id of the pixel (`ids.png`), its country in a small `location → country`
texture, then the colour of that country in a palette texture. Painting a location changes one value
in an array of ~5,000 entries and uploads it to the GPU. Borders are computed in the shader by
comparing neighbours one screen pixel away.

**State.** `owner` is a `Uint16Array` (country of each location); `outline` and `hatch` hold the
overlay of each location in each channel. Saves from before the two channels existed (a single
`marks` array) are split by style when opened. Countries have stable ids, so
recolouring a country recolours all its lands without touching `owner`. The history stores diffs
(locations, before, after); deleting a country and loading a loadout are undoable too.

## Data and licences

- Coastlines: © OpenStreetMap contributors, ODbL. The notice must stay visible if the site is
  published (it is, at the bottom right of the map).
- Administrative boundaries: Natural Earth (public domain).
- Towns: GeoNames (CC BY 4.0), via the `all-the-cities` package.
- Historical borders (1444 base and 1914 loadouts): historical-basemaps by A. Ourednik, GPL-3.0.
  Check that licence before publishing the generated loadouts.

The Caspian Sea and lakes Ladoga and Onega are added by hand in `generate.mjs` (`LAKES`). Their
outlines matter: Ladoga must leave the Karelian Isthmus as land, or Saint Petersburg ends up cut off
from the rest of Russia.

## Next steps

- Legend movable on the mab, scaleable and customiz.
- Vector SVG export: vectorize `ids.png` in the generator (outlines merged per country).
- Share links (state compressed in the URL), then a Spring Boot API for short links.
