// Editorial data for the real-world map: historical regions and localized names.
// Every user-facing name is a label: { en, fr }.

export const LANGS = ['en', 'fr'];

/** Historical macro-regions, keyed by a stable id. */
export const REGIONS = {
  'england-wales': { en: 'England and Wales', fr: 'Angleterre et Galles' },
  'scotland-ireland': { en: 'Scotland and Ireland', fr: 'Écosse et Irlande' },
  'northern-france': { en: 'Northern France', fr: 'France du Nord' },
  'southern-france': { en: 'Southern France', fr: 'France du Midi' },
  iberia: { en: 'Iberia', fr: 'Ibérie' },
  'northern-italy': { en: 'Northern Italy', fr: 'Italie du Nord' },
  'southern-italy': { en: 'Southern Italy', fr: 'Italie du Sud' },
  'low-countries': { en: 'Low Countries', fr: 'Pays-Bas' },
  'northern-germany': { en: 'Northern Germany', fr: 'Allemagne du Nord' },
  'southern-germany': { en: 'Southern Germany', fr: 'Allemagne du Sud' },
  alps: { en: 'Alps', fr: 'Alpes' },
  bohemia: { en: 'Bohemia', fr: 'Bohême' },
  hungary: { en: 'Hungary', fr: 'Hongrie' },
  poland: { en: 'Poland', fr: 'Pologne' },
  baltic: { en: 'Baltic', fr: 'Pays baltes' },
  denmark: { en: 'Denmark', fr: 'Danemark' },
  norway: { en: 'Norway', fr: 'Norvège' },
  sweden: { en: 'Sweden', fr: 'Suède' },
  finland: { en: 'Finland', fr: 'Finlande' },
  ruthenia: { en: 'Ruthenia', fr: 'Ruthénie' },
  'pontic-steppe': { en: 'Pontic Steppe', fr: 'Steppe pontique' },
  carpathia: { en: 'Carpathia', fr: 'Carpates' },
  balkans: { en: 'Balkans', fr: 'Balkans' },
  greece: { en: 'Greece', fr: 'Grèce' },
  thrace: { en: 'Thrace', fr: 'Thrace' },
  anatolia: { en: 'Anatolia', fr: 'Anatolie' },
  'eastern-anatolia': { en: 'Eastern Anatolia', fr: 'Anatolie orientale' },
  caucasus: { en: 'Caucasus', fr: 'Caucase' },
  novgorod: { en: 'Novgorod', fr: 'Novgorod' },
  muscovy: { en: 'Muscovy', fr: 'Moscovie' },
  volga: { en: 'Volga', fr: 'Volga' },
  urals: { en: 'Urals', fr: 'Oural' },
  levant: { en: 'Levant', fr: 'Levant' },
  mesopotamia: { en: 'Mesopotamia', fr: 'Mésopotamie' },
  arabia: { en: 'Arabia', fr: 'Arabie' },
  egypt: { en: 'Egypt', fr: 'Égypte' },
  cyrenaica: { en: 'Cyrenaica', fr: 'Cyrénaïque' },
  ifriqiya: { en: 'Ifriqiya', fr: 'Ifriqiya' },
  'central-maghreb': { en: 'Central Maghreb', fr: 'Maghreb central' },
  morocco: { en: 'Morocco', fr: 'Maroc' },
  sahara: { en: 'Sahara', fr: 'Sahara' },
};

/** Regions where a location without any town gets a desert, forest or moor name. */
export const LANDSCAPE = {
  desert: { regions: ['sahara', 'egypt', 'cyrenaica', 'arabia', 'mesopotamia', 'levant', 'central-maghreb', 'morocco', 'ifriqiya'], en: (t) => `${t} Desert`, fr: (t) => `Désert ${de(t)}` },
  forest: { regions: ['norway', 'sweden', 'finland', 'novgorod', 'urals', 'volga'], en: (t) => `${t} Forests`, fr: (t) => `Forêts ${de(t)}` },
  moor: { regions: ['denmark'], en: (t) => `${t} Moors`, fr: (t) => `Landes ${de(t)}` },
  country: { regions: [], en: (t) => `${t} Countryside`, fr: (t) => `Campagne ${de(t)}` },
};
function de(name) {
  return /^[AEIOUYÀÂÉÈÊÎÔŒaeiouy]/.test(name) ? `d'${name}` : `de ${name}`;
}

const SOUTHERN_FRANCE = ['Nouvelle-Aquitaine', 'Occitanie', "Provence-Alpes-Côte-d'Azur", 'Auvergne-Rhône-Alpes', 'Corse', 'Aquitaine', 'Midi-Pyrénées', 'Languedoc-Roussillon', 'Limousin', 'Auvergne', 'Rhône-Alpes', 'Poitou-Charentes'];
const NORTHERN_ITALY = ["Valle d'Aosta", 'Piemonte', 'Lombardia', 'Trentino-Alto Adige', 'Veneto', 'Friuli-Venezia Giulia', 'Liguria', 'Emilia-Romagna', 'Toscana'];
const SOUTHERN_GERMANY = ['Bayern', 'Baden-Württemberg', 'Hessen', 'Rheinland-Pfalz', 'Saarland'];
const SAHARA_COUNTRIES = ['DZ', 'LY', 'EG', 'MA', 'TN', 'MR', 'EH', 'ML', 'NE', 'TD', 'SD'];

/**
 * Historical region key of an administrative unit, from its country code, the position of its
 * centre and its Natural Earth properties. Large countries are split along historical lines.
 */
export function historicRegion(iso, lon, lat, props = {}) {
  const name = props.name ?? '';
  const reg = props.region ?? '';
  if (lat < 29.5 && SAHARA_COUNTRIES.includes(iso) && !(iso === 'EG' && Math.abs(lon - 31) < 2.5)) return 'sahara';
  switch (iso) {
    case 'GB': case 'IE': case 'IM': case 'JE': case 'GG':
      return iso === 'IE' || /Scotland|Northern Ireland/.test(props.geonunit ?? '') ? 'scotland-ireland' : 'england-wales';
    case 'FR':
      return SOUTHERN_FRANCE.includes(reg) ? 'southern-france' : 'northern-france';
    case 'MC':
      return 'southern-france';
    case 'ES': case 'PT': case 'AD': case 'GI':
      return 'iberia';
    case 'IT':
      return NORTHERN_ITALY.includes(reg) ? 'northern-italy' : 'southern-italy';
    case 'SM':
      return 'northern-italy';
    case 'VA': case 'MT':
      return 'southern-italy';
    case 'NL': case 'BE': case 'LU':
      return 'low-countries';
    case 'DE':
      return SOUTHERN_GERMANY.includes(name) ? 'southern-germany' : 'northern-germany';
    case 'CH': case 'AT': case 'LI': case 'SI':
      return 'alps';
    case 'CZ':
      return 'bohemia';
    case 'HU': case 'SK':
      return 'hungary';
    case 'PL':
      return 'poland';
    case 'EE': case 'LV': case 'LT':
      return 'baltic';
    case 'DK': case 'IS': case 'FO':
      return 'denmark';
    case 'NO':
      return lon < 12.5 ? 'norway' : 'sweden';
    case 'SE':
      return 'sweden';
    case 'FI': case 'AX':
      return 'finland';
    case 'BY':
      return 'ruthenia';
    case 'UA':
      return lat >= 49.3 ? 'ruthenia' : 'pontic-steppe';
    case 'RO': case 'MD':
      return 'carpathia';
    case 'HR': case 'BA': case 'RS': case 'ME': case 'MK': case 'AL': case 'XK':
      return 'balkans';
    case 'GR': case 'CY':
      return 'greece';
    case 'BG':
      return 'thrace';
    case 'TR':
      if (lon < 29.5 && lat > 40.5) return 'thrace';
      return lon < 34.5 ? 'anatolia' : 'eastern-anatolia';
    case 'GE': case 'AM': case 'AZ':
      return 'caucasus';
    case 'RU':
      if (lat < 45.5 && lon > 37.5) return 'caucasus';
      if (lat < 50) return 'pontic-steppe';
      if (lon >= 53) return 'urals';
      if (lon >= 44) return 'volga';
      if (lat >= 57.5) return 'novgorod';
      return 'muscovy';
    case 'KZ': case 'TM': case 'UZ':
      return 'volga';
    case 'SY': case 'LB': case 'IL': case 'PS': case 'JO':
      return 'levant';
    case 'IQ': case 'KW': case 'IR':
      return 'mesopotamia';
    case 'SA':
      return 'arabia';
    case 'EG':
      return 'egypt';
    case 'LY':
      return lon >= 17 ? 'cyrenaica' : 'ifriqiya';
    case 'TN':
      return 'ifriqiya';
    case 'DZ':
      return lon >= 6 ? 'ifriqiya' : 'central-maghreb';
    case 'MA': case 'EH':
      return 'morocco';
    case 'MR':
      return 'sahara';
    default:
      return null;
  }
}

// ------------------------------------------------------------------ town names
// GeoNames names mix English and local spellings. Historical names (around 1450) come first,
// then the usual English and French exonyms.
const HISTORIC = {
  Istanbul: 'Constantinople', İzmir: ['Smyrna', 'Smyrne'], Izmir: ['Smyrna', 'Smyrne'], Edirne: ['Adrianople', 'Andrinople'],
  Trabzon: ['Trebizond', 'Trébizonde'], Kaliningrad: 'Königsberg', Gdańsk: ['Danzig', 'Dantzig'], Wrocław: 'Breslau',
  Szczecin: 'Stettin', Bratislava: ['Pressburg', 'Presbourg'], Lviv: 'Lemberg', Tbilisi: 'Tiflis',
  Thessaloníki: ['Salonica', 'Salonique'], Thessaloniki: ['Salonica', 'Salonique'], İzmit: ['Nicomedia', 'Nicomédie'],
  Izmit: ['Nicomedia', 'Nicomédie'], İznik: ['Nicaea', 'Nicée'], Bursa: ['Brusa', 'Brousse'], Antakya: ['Antioch', 'Antioche'],
  Tallinn: 'Reval', Tartu: 'Dorpat', 'Cluj-Napoca': 'Kolozsvár', Volgograd: ['Tsaritsyn', 'Tsaritsyne'],
  'Nizhniy Novgorod': ['Nizhny Novgorod', 'Nijni Novgorod'], Konya: 'Iconium', Kayseri: ['Caesarea', 'Césarée'],
  Şanlıurfa: ['Edessa', 'Édesse'], Sanliurfa: ['Edessa', 'Édesse'], İskenderun: ['Alexandretta', 'Alexandrette'],
  Iskenderun: ['Alexandretta', 'Alexandrette'], Plovdiv: 'Philippopolis', Durrës: 'Durazzo', Shkodër: 'Scutari',
  Rijeka: 'Fiume', Zadar: 'Zara', Split: 'Spalato', Dubrovnik: ['Ragusa', 'Raguse'], Kotor: 'Cattaro', Koper: 'Capodistria',
  Pula: 'Pola', Ljubljana: 'Laibach', Maribor: ['Marburg', 'Marbourg'], Oradea: 'Nagyvárad', Timişoara: 'Temesvár',
  Timișoara: 'Temesvár', Braşov: 'Brassó', Brașov: 'Brassó', Sibiu: 'Hermannstadt', Kaunas: ['Kovno', 'Kowno'],
  Klaipėda: 'Memel', Daugavpils: ['Dünaburg', 'Dunabourg'], Sevastopol: ['Chersonesus', 'Chersonèse'], Feodosiya: 'Caffa',
  Azov: 'Tana', 'Bilhorod-Dnistrovs’kyy': 'Moncastro', Benghazi: ['Berenice', 'Bérénice'], Heraklion: ['Candia', 'Candie'],
  Irákleio: ['Candia', 'Candie'], Chaniá: ['Canea', 'La Canée'], Ankara: ['Angora', 'Ancyre'], Antalya: 'Adalia',
  Sinop: 'Sinope', Alanya: 'Candelore', Budapest: 'Buda', Mosul: ['Mosul', 'Mossoul'],
};
const EXONYMS_EN = {
  Köln: 'Cologne', 'Frankfurt am Main': 'Frankfurt', Nürnberg: 'Nuremberg', Braunschweig: 'Brunswick', Hannover: 'Hanover',
  'Freiburg im Breisgau': 'Freiburg', Wien: 'Vienna', Praha: 'Prague', Warszawa: 'Warsaw', Kraków: 'Kraków',
  București: 'Bucharest', Bucureşti: 'Bucharest', Iaşi: 'Iași', Sevilla: 'Seville', 'A Coruña': 'Corunna',
  Antwerpen: 'Antwerp', Gent: 'Ghent', Brugge: 'Bruges', Leuven: 'Louvain', Mechelen: 'Mechelen', Genève: 'Geneva',
  Zürich: 'Zurich', Luzern: 'Lucerne', Padova: 'Padua', Mantova: 'Mantua', Siracusa: 'Syracuse', Torino: 'Turin',
  Napoli: 'Naples', Firenze: 'Florence', Venezia: 'Venice', Milano: 'Milan', Genova: 'Genoa', Roma: 'Rome',
  Kérkyra: 'Corfu', Ródos: 'Rhodes', Pátra: 'Patras', Patra: 'Patras', Ioánnina: 'Ioannina', Fès: 'Fez', Tétouan: 'Tetouan',
  'Velikiy Novgorod': 'Novgorod',
};
const EXONYMS_FR = {
  Munich: 'Munich', Köln: 'Cologne', 'Frankfurt am Main': 'Francfort', Aachen: 'Aix-la-Chapelle', Mainz: 'Mayence',
  Trier: 'Trèves', Koblenz: 'Coblence', Regensburg: 'Ratisbonne', Nuremberg: 'Nuremberg', Nürnberg: 'Nuremberg',
  Augsburg: 'Augsbourg', Hamburg: 'Hambourg', Bremen: 'Brême', Braunschweig: 'Brunswick', Hanover: 'Hanovre',
  Hannover: 'Hanovre', Dresden: 'Dresde', Freiburg: 'Fribourg-en-Brisgau', 'Freiburg im Breisgau': 'Fribourg-en-Brisgau',
  Konstanz: 'Constance', Vienna: 'Vienne', Wien: 'Vienne', Salzburg: 'Salzbourg', Brno: 'Brünn', Warsaw: 'Varsovie',
  Kraków: 'Cracovie', Poznań: 'Posnanie', Toruń: 'Thorn', Moscow: 'Moscou', 'Saint Petersburg': 'Saint-Pétersbourg',
  'Velikiy Novgorod': 'Novgorod', Kyiv: 'Kiev', Vilnius: 'Vilna', Bucharest: 'Bucarest', București: 'Bucarest',
  Iaşi: 'Iași', Chisinau: 'Chișinău', Athens: 'Athènes', Patra: 'Patras', Ioánnina: 'Janina', Venice: 'Venise',
  Genoa: 'Gênes', Bologna: 'Bologne', Padova: 'Padoue', Padua: 'Padoue', Mantova: 'Mantoue', Siena: 'Sienne', Pisa: 'Pise',
  Livorno: 'Livourne', Palermo: 'Palerme', Messina: 'Messine', Siracusa: 'Syracuse', Catania: 'Catane',
  'Reggio Calabria': 'Reggio de Calabre', Ferrara: 'Ferrare', Verona: 'Vérone', Bergamo: 'Bergame', Parma: 'Parme',
  Modena: 'Modène', Ravenna: 'Ravenne', Perugia: 'Pérouse', Ancona: 'Ancône', Valletta: 'La Valette', Lisbon: 'Lisbonne',
  Seville: 'Séville', Sevilla: 'Séville', Córdoba: 'Cordoue', Granada: 'Grenade', Zaragoza: 'Saragosse',
  Barcelona: 'Barcelone', Valencia: 'Valence', Toledo: 'Tolède', Salamanca: 'Salamanque', Pamplona: 'Pampelune',
  Cádiz: 'Cadix', Málaga: 'Malaga', 'A Coruña': 'La Corogne', 'Santiago de Compostela': 'Saint-Jacques-de-Compostelle',
  Tarragona: 'Tarragone', Murcia: 'Murcie', Brussels: 'Bruxelles', Antwerpen: 'Anvers', Antwerp: 'Anvers', Gent: 'Gand',
  Ghent: 'Gand', Brugge: 'Bruges', Leuven: 'Louvain', Mechelen: 'Malines', 'The Hague': 'La Haye', London: 'Londres',
  Edinburgh: 'Édimbourg', Canterbury: 'Cantorbéry', Dover: 'Douvres', Copenhagen: 'Copenhague', Gothenburg: 'Göteborg',
  Geneva: 'Genève', Zürich: 'Zurich', Basel: 'Bâle', Bern: 'Berne', Luzern: 'Lucerne', Algiers: 'Alger',
  Alexandria: 'Alexandrie', Cairo: 'Le Caire', Damascus: 'Damas', Aleppo: 'Alep', Jerusalem: 'Jérusalem',
  Beirut: 'Beyrouth', Baghdad: 'Bagdad', Fez: 'Fès', Marrakesh: 'Marrakech', Tangier: 'Tanger', Nicosia: 'Nicosie',
  Famagusta: 'Famagouste', Kérkyra: 'Corfou', Ródos: 'Rhodes', Mytilene: 'Mytilène', Rome: 'Rome', Naples: 'Naples',
};

/** Localized label of a GeoNames town name. */
export function townLabel(name) {
  const clean = name.replace(/[’ʹʼ]/g, '');
  const h = HISTORIC[name];
  if (h) return Array.isArray(h) ? { en: h[0], fr: h[1] } : { en: h, fr: h };
  return { en: EXONYMS_EN[name] ?? clean, fr: EXONYMS_FR[name] ?? EXONYMS_EN[name] ?? clean };
}

/** GeoNames feature codes kept as towns (no city districts, ruins or abandoned places). */
export const TOWN_CODES = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG', 'PPLS', 'PPLF', 'PPLL', 'PPLH']);

// ------------------------------------------------------------------ administrative regions
// Natural Earth "region" values (NUTS-like regions) in English and French.
const REGION_LABELS = {
  // United Kingdom & Ireland
  'North West': ['North West England', "Nord-Ouest de l'Angleterre"], 'North East': ['North East England', "Nord-Est de l'Angleterre"],
  'Yorkshire and the Humber': ['Yorkshire', 'Yorkshire'], 'East Midlands': ['East Midlands', "Midlands de l'Est"],
  'West Midlands': ['West Midlands', "Midlands de l'Ouest"], Eastern: ['East Anglia', 'East Anglia'], 'East of England': ['East Anglia', 'East Anglia'],
  'South East': ['South East England', "Sud-Est de l'Angleterre"], 'South West': ['South West England', "Sud-Ouest de l'Angleterre"],
  'Greater London': ['London', 'Londres'], London: ['London', 'Londres'], 'West Wales and the Valleys': ['West Wales', 'Galles occidental'],
  'East Wales': ['East Wales', 'Galles oriental'], 'Northern Ireland': ['Ulster', 'Ulster'], 'Highlands and Islands': ['Highlands', 'Highlands'],
  'North Eastern': ['North East Scotland', 'Écosse du Nord-Est'], 'South Western': ['South West Scotland', 'Écosse du Sud-Ouest'],
  'Eastern Scotland': ['Eastern Scotland', 'Écosse orientale'], Border: ['Border Counties', 'Comtés frontaliers'],
  'Mid-East': ['East Leinster', 'Leinster oriental'], 'South-East': ['South Leinster', 'Leinster méridional'],
  'South-West': ['West Munster', 'Munster occidental'], 'Mid-West': ['Munster', 'Munster'], West: ['Connacht', 'Connacht'],
  Midland: ['Irish Midlands', 'Midlands irlandais'],
  // Hungary, Belgium, Portugal
  'Northern Great Plain': ['Northern Great Plain', 'Grande Plaine du Nord'], 'Great Southern Plain': ['Southern Great Plain', 'Grande Plaine du Sud'],
  'Western Transdanubia': ['Western Transdanubia', 'Transdanubie occidentale'], 'Southern Transdanubia': ['Southern Transdanubia', 'Transdanubie méridionale'],
  'Central Transdanubia': ['Central Transdanubia', 'Transdanubie centrale'], 'Northern Hungary': ['Northern Hungary', 'Hongrie du Nord'],
  'Central Hungary': ['Central Hungary', 'Hongrie centrale'], Flemish: ['Flanders', 'Flandre'], Walloon: ['Wallonia', 'Wallonie'],
  'Capital Region': ['Brabant', 'Brabant'], Lisbon: ['Lisbon', 'Lisbonne'], Norte: ['Northern Portugal', 'Nord du Portugal'],
  Centro: ['Beira', 'Beira'], 'Norte, Centro': ['Beira', 'Beira'], Alentejo: ['Alentejo', 'Alentejo'], Algarve: ['Algarve', 'Algarve'],
  // Italy
  Piemonte: ['Piedmont', 'Piémont'], Lombardia: ['Lombardy', 'Lombardie'], 'Trentino-Alto Adige': ['Trentino-South Tyrol', 'Trentin-Haut-Adige'],
  Veneto: ['Veneto', 'Vénétie'], 'Friuli-Venezia Giulia': ['Friuli', 'Frioul-Vénétie julienne'], Liguria: ['Liguria', 'Ligurie'],
  'Emilia-Romagna': ['Emilia-Romagna', 'Émilie-Romagne'], Toscana: ['Tuscany', 'Toscane'], Umbria: ['Umbria', 'Ombrie'],
  Marche: ['Marche', 'Marches'], Lazio: ['Lazio', 'Latium'], Abruzzo: ['Abruzzo', 'Abruzzes'], Molise: ['Molise', 'Molise'],
  Campania: ['Campania', 'Campanie'], Apulia: ['Apulia', 'Pouilles'], Puglia: ['Apulia', 'Pouilles'], Basilicata: ['Basilicata', 'Basilicate'],
  Calabria: ['Calabria', 'Calabre'], Sicily: ['Sicily', 'Sicile'], Sicilia: ['Sicily', 'Sicile'], Sardegna: ['Sardinia', 'Sardaigne'],
  "Valle d'Aosta": ['Aosta Valley', "Vallée d'Aoste"],
  // Spain
  Andalucía: ['Andalusia', 'Andalousie'], Aragón: ['Aragon', 'Aragon'], Asturias: ['Asturias', 'Asturies'], Cantabria: ['Cantabria', 'Cantabrie'],
  'Castilla y León': ['Castile and León', 'Castille-et-León'], 'Castilla-La Mancha': ['Castile-La Mancha', 'Castille-La Manche'],
  Cataluña: ['Catalonia', 'Catalogne'], Extremadura: ['Extremadura', 'Estrémadure'], Galicia: ['Galicia', 'Galice'],
  'Islas Baleares': ['Balearic Islands', 'Baléares'], 'La Rioja': ['La Rioja', 'La Rioja'], Madrid: ['Madrid', 'Madrid'],
  Murcia: ['Murcia', 'Murcie'], 'Foral de Navarra': ['Navarre', 'Navarre'], 'País Vasco': ['Basque Country', 'Pays basque'],
  Valenciana: ['Valencia', 'Valence'],
  // Others
  Peloponnisos: ['Peloponnese', 'Péloponnèse'], Macedonia: ['Macedonia', 'Macédoine'],
  'Federacija Bosna i Hercegovina': ['Bosnia', 'Bosnie'], 'Repuplika Srpska': ['Republika Srpska', 'Republika Srpska'],
  'Malta Majjistral': ['Malta', 'Malte'], 'Malta Xlokk': ['Malta', 'Malte'], Gozo: ['Gozo', 'Gozo'], Iraq: ['Iraq', 'Irak'],
  'MK:Southwestern': ['Southwestern Macedonia', 'Macédoine du Sud-Ouest'], 'MK:Southeastern': ['Southeastern Macedonia', 'Macédoine du Sud-Est'],
  'MK:Northeastern': ['Northeastern Macedonia', 'Macédoine du Nord-Est'], 'MK:Eastern': ['Eastern Macedonia', 'Macédoine orientale'],
  'MK:Pelagonia': ['Pelagonia', 'Pélagonie'], 'AZ:Naxçıvan Autonomous Republic': ['Nakhchivan', 'Nakhitchevan'],
  'AZ:Ganja-Gazakh Economic Region': ['Ganja-Gazakh', 'Gandja-Qazakh'], 'AZ:Kalbajar-Lachin Economic Region': ['Kalbajar-Lachin', 'Kelbajar-Latchine'],
  'AZ:Shaki-Zaqatala Economic Region': ['Shaki-Zaqatala', 'Chaki-Zaqatala'], 'AZ:Guba-Khachmaz Economic Region': ['Quba-Khachmaz', 'Quba-Khatchmaz'],
  'AZ:Absheron Economic Region': ['Absheron', 'Abcheron'], 'AZ:Lankaran Economic Region': ['Lankaran', 'Lenkoran'],
};

/** Localized label of a Natural Earth "region" value, or null when it is not usable as an area. */
export function regionLabel(iso, reg) {
  // Russian federal districts are too large for an area; the Croatian field is wrong in Natural Earth.
  if (!reg || iso === 'RU' || iso === 'HR') return null;
  const l = REGION_LABELS[`${iso}:${reg}`] ?? REGION_LABELS[reg];
  if (l) return { en: l[0], fr: l[1] };
  const n = reg.replace(/ Economic Region$| Autonomous Republic$/, '');
  return { en: n, fr: n };
}
