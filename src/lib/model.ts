// Turns raw quote rows (one object per spreadsheet row, keyed by header) into
// typed line items with a floor, a room and a plain-language device type.

export type RawRow = Record<string, unknown>;

export interface Item {
  id: number;
  name: string;
  brand: string;
  model: string;
  summary: string;
  category: string;
  qty: number;
  /** Physical units: a "[PAIR]" line with qty 2 is 4 speakers. */
  units: number;
  unitPrice: number;
  unitCost: number;
  laborHours: number;
  laborCost: number;
  laborPrice: number;
  equipmentTotal: number;
  total: number;
  location: string;
  floor: string;
  room: string;
  system: string;
  phase: string;
  supplier: string;
  kind: string;
}

export interface Kind {
  id: string;
  label: string;
  plural: string;
  /** Pre-wire end points and services are not devices. */
  group: 'device' | 'prewire' | 'service';
  match: (r: { name: string; category: string; summary: string }) => boolean;
}

const cat = (prefix: string) => (r: { category: string }) => r.category.startsWith(prefix);
const name = (re: RegExp) => (r: { name: string }) => re.test(r.name);

// Order matters: the first match wins.
export const KINDS: Kind[] = [
  { id: 'audio-prewire', label: 'Audio pre-wire', plural: 'Audio pre-wire points', group: 'prewire', match: name(/^Audio End Point/) },
  { id: 'video-prewire', label: 'Video pre-wire', plural: 'Video pre-wire points', group: 'prewire', match: name(/^Video End Point/) },
  { id: 'wifi-prewire', label: 'Wi-Fi pre-wire', plural: 'Wi-Fi pre-wire points', group: 'prewire', match: name(/^WiFi End Point/) },
  { id: 'network-prewire', label: 'Network pre-wire', plural: 'Network pre-wire points', group: 'prewire', match: name(/^Network End Point/) },
  { id: 'touchpanel-prewire', label: 'Touch panel pre-wire', plural: 'Touch panel pre-wire points', group: 'prewire', match: name(/^Touchpanel End Point/) },
  { id: 'demarc', label: 'Service entrance (DMarc)', plural: 'Service entrance points', group: 'prewire', match: name(/^DMarc/) },
  { id: 'service', label: 'Service / allowance', plural: 'Services & allowances', group: 'service', match: (r) => /Allowance|Management|Design & Documentation/.test(r.name) },
  { id: 'speaker', label: 'Speaker', plural: 'Speakers', group: 'device', match: cat('Speakers > In-') },
  { id: 'soundbar', label: 'Soundbar / all-in-one speaker', plural: 'Soundbars', group: 'device', match: cat('Speakers > Soundbars') },
  { id: 'amplifier', label: 'Amplifier', plural: 'Amplifiers', group: 'device', match: cat('Amplifiers > Multi') },
  { id: 'streamer', label: 'Audio streamer / preamp', plural: 'Audio streamers', group: 'device', match: cat('Amplifiers > Accessories') },
  { id: 'wifi-ap', label: 'Wi-Fi access point', plural: 'Wi-Fi access points', group: 'device', match: cat('Networking > Wireless Access Points') },
  { id: 'network-switch', label: 'Network switch', plural: 'Network switches', group: 'device', match: cat('Networking > Switches') },
  { id: 'router', label: 'Router / gateway', plural: 'Routers', group: 'device', match: cat('Networking > Routers') },
  { id: 'chime', label: 'Door chime', plural: 'Door chimes', group: 'device', match: name(/CHIME/) },
  { id: 'patch-panel', label: 'Patch panel', plural: 'Patch panels', group: 'device', match: cat('Equipment Racks > Panel') },
  { id: 'rack', label: 'Equipment rack', plural: 'Equipment racks', group: 'device', match: cat('Equipment Racks > Enclosure') },
  { id: 'touchscreen', label: 'Touchscreen', plural: 'Touchscreens', group: 'device', match: cat('Control Systems > Touchscreens') },
  { id: 'thermostat', label: 'Thermostat', plural: 'Thermostats', group: 'device', match: cat('Control Systems > Thermostats') },
  { id: 'processor', label: 'Control processor', plural: 'Control processors', group: 'device', match: (r) => r.category.startsWith('Control Systems > Controllers') || r.category.startsWith('Lighting > Controllers') },
  { id: 'ups', label: 'Battery backup (UPS)', plural: 'Battery backups', group: 'device', match: cat('Power Protection > Battery') },
  { id: 'power-box', label: 'Recessed power box', plural: 'Recessed power boxes', group: 'device', match: cat('Power Protection > Packages') },
  { id: 'keypad', label: 'Lighting keypad', plural: 'Lighting keypads', group: 'device', match: cat('Lighting > Keypads') },
  { id: 'lighting-module', label: 'Lighting power module', plural: 'Lighting power modules', group: 'device', match: cat('Lighting > Control Modules') },
  { id: 'lighting-panel', label: 'Lighting / shade panel', plural: 'Lighting & shade panels', group: 'device', match: (r) => r.category.startsWith('Lighting > Lighting Panels') && !/harness/i.test(r.summary) },
  { id: 'doorbell', label: 'Video doorbell / entry station', plural: 'Video doorbells & entry stations', group: 'device', match: (r) => /G6 ENTRY|G6-Pro-Entry/i.test(r.name) },
  { id: 'intercom', label: 'Intercom', plural: 'Intercoms', group: 'device', match: name(/INTERCOM/) },
  { id: 'door-hub', label: 'Door / gate controller', plural: 'Door & gate controllers', group: 'device', match: name(/UA-HUB/) },
  { id: 'lock', label: 'Electric lock strike', plural: 'Electric lock strikes', group: 'device', match: name(/Lock-Strike/) },
  { id: 'camera', label: 'Security camera', plural: 'Security cameras', group: 'device', match: cat('Surveillance > Cameras') },
  { id: 'nvr', label: 'Video recorder (NVR)', plural: 'Video recorders', group: 'device', match: cat('Surveillance > DVRs') },
  { id: 'shade', label: 'Motorized shade', plural: 'Motorized shades', group: 'device', match: (r) => r.name === 'Lutron Shades' },
  { id: 'shade-bracket', label: 'Shade bracket', plural: 'Shade brackets', group: 'device', match: (r) => /Brackets & Mounts/.test(r.category) },
  { id: 'accessory', label: 'Wiring & accessories', plural: 'Wiring & accessories', group: 'device', match: () => true },
];

export const kindById = new Map(KINDS.map((k) => [k.id, k]));

const str = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const round = (n: number) => Math.round(n * 100) / 100;

// Fixes mojibake such as "Horizon¬Æ" from Mac-Roman encoded exports.
const clean = (s: string) => s.replace(/¬Æ/g, '®').replace(/‚Ñ¢/g, '™').replace(/\s+/g, ' ');

export function splitLocation(location: string): { floor: string; room: string } {
  const parts = location.split('>').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { floor: 'Unassigned', room: 'Unassigned' };
  if (parts.length === 1) return { floor: parts[0], room: parts[0] === 'Whole House' ? 'Whole House' : `${parts[0]} (general)` };
  return { floor: parts[0], room: parts.slice(1).join(' › ') };
}

export function parseRows(rows: RawRow[]): Item[] {
  return rows
    .filter((r) => str(r['Name']))
    .map((r, id) => {
      const nm = clean(str(r['Name']));
      const summary = clean(str(r['Short Description']));
      const category = str(r['Category']);
      const qty = num(r['Quantity']) || 0;
      const unitPrice = num(r['Unit Price']);
      const laborPrice = num(r['Labor Price']);
      const location = str(r['Location']) || 'Unassigned';
      const kind = KINDS.find((k) => k.match({ name: nm, category, summary }))!.id;
      const equipmentTotal = round(qty * unitPrice);
      return {
        id,
        name: nm,
        brand: str(r['Brand']) || '—',
        model: str(r['Model']),
        summary,
        category: category || 'Uncategorized',
        qty,
        units: /\[PAIR\]/i.test(nm) ? qty * 2 : qty,
        unitPrice,
        unitCost: num(r['Unit Cost']),
        laborHours: num(r['Labor Hours']),
        laborCost: num(r['Labor Cost']),
        laborPrice,
        equipmentTotal,
        total: round(equipmentTotal + laborPrice),
        location,
        ...splitLocation(location),
        system: str(r['System']) || 'Other',
        phase: str(r['Phase']) || 'Unphased',
        supplier: str(r['Supplier']) || '—',
        kind,
      };
    });
}

/** Display name for an item: model for products, name for services and pre-wire. */
export function itemTitle(i: Item): string {
  const k = kindById.get(i.kind)!;
  if (k.group !== 'device') return i.name;
  if (i.kind === 'shade') return `Shade · ${i.summary}`;
  if (i.brand === '—' || !i.model) return i.name;
  const model = i.model.split(/ - | -|,| w\/| with /)[0].trim();
  return `${i.brand.replace(/ (Networks|Electronics)$/, '')} ${model.length > 40 ? `${model.slice(0, 38)}…` : model}`;
}

export const FLOOR_ORDER = ['First Floor', 'Second Floor', 'Third Floor', 'Outdoor', 'Whole House'];
export const floorRank = (f: string) => {
  const i = FLOOR_ORDER.indexOf(f);
  return i < 0 ? 99 : i;
};
/** Drawing-set style level tag. */
export const floorTag = (f: string) =>
  ({ 'First Floor': 'L1', 'Second Floor': 'L2', 'Third Floor': 'L3', Outdoor: 'EXT', 'Whole House': 'ALL' })[f] ?? '—';
