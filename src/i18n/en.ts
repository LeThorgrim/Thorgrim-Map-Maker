/** English messages. Every other language must provide the same keys (see `Messages`). */
export const en = {
  appName: 'Map maker',
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
    scenarios: 'Or start from',
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
    intro: 'Pick a country, then paint its lands on the map.',
    startFrom: 'Start from',
    blank: 'Blank',
    loadingScenario: 'Loading…',
    confirmReplace: (name: string) => `Replace the current map with “${name}”? You can undo this with Ctrl+Z.`,
    tool: 'Tool',
    tools: { paint: 'Paint', erase: 'Erase', pick: 'Pick' },
    scope: 'A click paints…',
    levels: { location: 'Location', province: 'Province', area: 'Area', region: 'Region' },
    scopeHintStart: 'On the fly:',
    keys: { shift: 'Shift', ctrl: 'Ctrl', alt: 'Alt' },
    countries: 'Countries',
    noCountries: 'No countries yet. Create one, or start from a scenario above.',
    newCountry: 'New country',
    newCountryName: (n: number) => `New country ${n}`,
    changeColor: 'Change colour',
    countryName: 'Country name',
    owned: 'Locations owned',
    remove: (name: string) => `Delete ${name}`,
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    exportPng: 'Export as PNG',
    exporting: 'Exporting…',
    save: 'Save',
    open: 'Open',
    clear: 'Clear all',
    confirmClear: 'Remove every country from the map? You can undo this with Ctrl+Z.',
    close: 'Close',
    language: 'Language',
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
