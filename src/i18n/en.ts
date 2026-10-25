/** English messages. Every other language must provide the same keys (see `Messages`). */
export const en = {
  appName: 'Thorgim Map Maker',
  languageName: 'English',

  home: {
    tagline: 'Pick a map, create your countries and paint their borders, location by location.',
    available: 'Available maps',
    loading: 'Loading maps…',
    loadError: (reason: string) => `The list of maps could not be loaded (${reason}).`,
    generateHint: 'Run npm run generate to create a map, then reload the page.',
    locations: 'Locations',
    provinces: 'Provinces',
    areas: 'Areas',
    regions: 'Regions',
    open: 'Open map',
    resume: 'Resume my map',
    progress: (painted: string, countries: number) => `${painted} locations painted, ${countries} ${countries === 1 ? 'country' : 'countries'}`,
    scenarios: 'Start from a date',
    blankHint: 'No countries: paint your own.',
  },

  editor: {
    loading: 'Loading map…',
    loadError: (reason: string) => `This map could not be loaded: ${reason}.`,
    backToList: 'All maps',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Fit to screen (0)',
  },

  panel: {
    startFrom: 'Start from',
    blank: 'Blank',
    loadingScenario: 'Loading…',
    replaceTitle: 'Replace the map?',
    confirmReplace: (name: string) => `The current map will be replaced by “${name}”. You can undo this with Ctrl+Z.`,
    replace: 'Replace',
    tool: 'Tool',
    tools: { paint: 'Paint', erase: 'Erase', pick: 'Pick' },
    scope: 'A click paints…',
    levels: { location: 'Location', province: 'Province', area: 'Area', region: 'Region' },
    scopeHintStart: 'Hold a key while clicking to change the scope on the fly',
    keys: { shift: 'Shift', ctrl: 'Ctrl', alt: 'Alt' },
    countries: 'Countries',
    noCountries: 'No countries yet. Create one, or start from a scenario above.',
    newCountry: 'New country',
    overlays: 'Overlays',
    noOverlays: 'Outline or hatch alliances, occupations, claims…',
    newOverlay: 'New overlay',
    newOverlayName: (n: number) => `Overlay ${n}`,
    overlayName: 'Overlay name',
    style: 'Style',
    styles: { outline: 'Outline', hatch: 'Hatching' },
    marked: 'Locations marked',
    restyleTitle: 'Change the style?',
    restyleConflict: (name: string, style: string, count: number, others: string[]) =>
      `${count} ${count === 1 ? 'location already carries' : 'locations already carry'} the ${style} of ${others.map((o) => `“${o}”`).join(', ')}. “${name}” will replace it there. You can undo this with Ctrl+Z.`,
    restyle: 'Change style',
    newCountryName: (n: number) => `New country ${n}`,
    changeColor: 'Change colour',
    countryName: 'Country name',
    owned: 'Locations owned',
    showName: 'Write the name on the map',
    namesOff: 'names are turned off in the display menu',
    remove: (name: string) => `Delete ${name}`,
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    exportPng: 'Export as PNG',
    exporting: 'Exporting…',
    save: 'Save',
    open: 'Open',
    clear: 'Clear all',
    clearTitle: 'Clear the map?',
    confirmClear: 'Every country and every painted location will be removed. You can undo this with Ctrl+Z.',
    close: 'Close',
    language: 'Language',
  },

  dialog: {
    cancel: 'Cancel',
  },

  legend: {
    title: 'Legend',
    more: (n: number) => `and ${n} more ${n === 1 ? 'country' : 'countries'}`,
  },

  display: {
    title: 'Display',
    names: 'Country names',
    legend: 'Legend',
    overlays: 'Overlays',
    locationBorders: 'Location borders',
    exportNote: 'The PNG export shows the map as displayed here.',
  },

  errors: {
    otherMap: 'This file was made for another map (different number of locations).',
    invalidFile: 'This file is not a valid map save.',
    exportFailed: 'The export failed.',
    scenarioFailed: (reason: string) => `The scenario could not be loaded (${reason}).`,
  },

  hover: {
    province: 'Province',
    area: 'Area',
    region: 'Region',
    today: 'Today',
    unclaimed: 'Unclaimed land',
  },
};

type Widen<T> = T extends (...args: infer A) => infer R ? (...args: A) => R : T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof en>;
