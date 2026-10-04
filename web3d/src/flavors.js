// The made-up Fizzbok range shown in the live demo on websites.html.
// One list drives the can labels, the 3D lights, the shop panel and the page colors.
export const BRAND = 'FIZZBOK';

export const FLAVORS = [
  {
    id: 'peach',
    name: 'Rooibos Peach',
    notes: ['Rooibos', 'Ripe peach', 'Lightly sparkling'],
    // label art
    top: '#ff9466',
    bottom: '#ff4f6d',
    ink: '#fff7f0',
    fruit: '#ffc38a',
    leaf: '#3fa36b',
    // scene + page
    glow: '#ff7a59',
    rim: '#ffb08a',
    tint: '#ffe6da',
    tintDeep: '#ffd0bd',
  },
  {
    id: 'lime',
    name: 'Ginger Lime',
    notes: ['Fresh ginger', 'Lime zest', 'Extra fizzy'],
    top: '#7fe08a',
    bottom: '#119c7d',
    ink: '#f4fff6',
    fruit: '#d9f77a',
    leaf: '#0d6b52',
    glow: '#3fd18a',
    rim: '#b6f5a6',
    tint: '#e2f9e6',
    tintDeep: '#c4f0cd',
  },
  {
    id: 'berry',
    name: 'Berry Baobab',
    notes: ['Mixed berries', 'Baobab', 'Lightly sparkling'],
    top: '#c46cf2',
    bottom: '#5a35d6',
    ink: '#fbf5ff',
    fruit: '#ff6fae',
    leaf: '#2f9e6c',
    glow: '#a45cff',
    rim: '#e3b8ff',
    tint: '#efe4ff',
    tintDeep: '#ddcbff',
  },
];

// Demo prices in Rand, per pack size.
export const PACKS = { 1: 24, 6: 129, 12: 239 };
