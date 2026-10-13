// Present-day Europe, from the Natural Earth country of each location (UN-recognised borders
// where Natural Earth shows de facto ones).

import { adm } from './dsl.mjs';

export default {
  id: 'today',
  year: 2026,
  name: { en: 'Today', fr: "Aujourd'hui" },
  description: {
    en: 'Present-day countries, with internationally recognised borders.',
    fr: 'Les pays actuels, selon les frontières reconnues internationalement.',
  },
  presentDay: true,
  // well-known colours; other countries get a colour that differs from their neighbours
  colors: {
    FR: '#2453A6', GB: '#C8312B', IE: '#3F8F4D', ES: '#D9B92E', PT: '#2F7D6B', DE: '#4A4F55', IT: '#5FA05A', NL: '#E07A2E',
    BE: '#D1A54A', CH: '#C94E4E', AT: '#E8E4D8', PL: '#C9506F', CZ: '#5B8FD6', SK: '#7A9C6E', HU: '#9B4E3F', RO: '#C6A93A',
    BG: '#6E9B49', GR: '#6F9BD1', TR: '#8EB55A', RU: '#3C7A3A', UA: '#E2C34A', BY: '#B8433A', SE: '#3561A8', NO: '#C9705B',
    DK: '#B83A3A', FI: '#C5D9E8', EE: '#5BAAC9', LV: '#9C5248', LT: '#C77C3C', RS: '#9E3E52', HR: '#4C79A8', SI: '#7D8F3A',
    BA: '#D8A35A', ME: '#4C7D8C', AL: '#8A2E2E', MK: '#B5865A', EG: '#D8C27A', LY: '#5C9670', TN: '#3D8E76', DZ: '#A3854E',
    MA: '#A8473B', SY: '#7E6DA6', IQ: '#5C5248', SA: '#4C9A57', IR: '#6C5BA8', IL: '#5B8FD6', JO: '#C9946B', LB: '#B6866A',
    GE: '#C46A5C', AM: '#D07A3A', AZ: '#5FA8B5', KZ: '#8FB6C9', MD: '#B58C5E', CY: '#D7B07A', IS: '#7FA0D6', LU: '#5BAAC9',
  },
  rules: [['UA', adm('RU', 'Crimea', 'Sevastopol')]],
};
