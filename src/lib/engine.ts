// A small, offline question engine. It pulls rooms, floors, systems, device
// types, brands and phases out of a question, picks an intent from its wording,
// and answers from the quote data. No network or AI service is involved.

import { FLOOR_ORDER, Item, KINDS, floorRank, floorTag, itemTitle, kindById } from './model';
import { listJoin, money, num, pct, plural } from './format';
import { TAX, taxLabel, taxOf } from './tax';

export interface BarRow {
  label: string;
  value: number;
  display: string;
  sub?: string;
  ask?: string;
}
export interface Line {
  label: string;
  qty: string;
  sub?: string;
  muted?: boolean;
  amount?: number;
}
export interface RoomGroup {
  room: string;
  ask?: string;
  meta?: string;
  lines: Line[];
}
export interface FloorGroup {
  floor: string;
  tag: string;
  rooms: RoomGroup[];
}
export interface Answer {
  question: string;
  title: string;
  lead?: string;
  stats?: { label: string; value: string }[];
  bars?: { title: string; rows: BarRow[] };
  groups?: FloorGroup[];
  items?: Item[];
  notes?: { tone: 'info' | 'warn'; text: string }[];
  followups: string[];
}

type Dim = 'system' | 'floor' | 'room' | 'brand' | 'phase' | 'kind' | 'supplier' | 'category';

interface Entities {
  kinds: Set<string>;
  locations: Set<string>;
  floors: Set<string>;
  systems: Set<string>;
  brands: Set<string>;
  phases: Set<string>;
  /** Human words that matched, for headlines ("audio", "Wi-Fi"). */
  topics: string[];
}

interface LexEntry {
  re: RegExp;
  len: number;
  type: keyof Omit<Entities, 'topics'>;
  values: string[];
  topic?: string;
}

/** Devices people mean when they say "devices": excludes wiring, brackets, pre-wire and services. */
const NOT_DEVICES = new Set(['accessory', 'shade-bracket']);
export const isDevice = (i: Item) => kindById.get(i.kind)!.group === 'device' && !NOT_DEVICES.has(i.kind);

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/wi[\s-]?fi/g, 'wifi')
    .replace(/&/g, ' and ')
    .replace(/[’']s\b/g, '')
    .replace(/#/g, ' ')
    .replace(/\brough[\s-]?in\b/g, 'roughin')
    .replace(/\bpre[\s-]?wire/g, 'prewire')
    .replace(/[^a-z0-9$ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const K = (aliases: string[], kinds: string[], topic?: string) => ({ aliases, kinds, topic });

// Plain-language words for device types and topics.
const KIND_ALIASES = [
  K(['audio', 'music', 'sound', 'audio system', 'whole house audio', 'distributed audio'], ['speaker', 'soundbar', 'amplifier', 'streamer', 'audio-prewire'], 'audio'),
  K(['speaker', 'speakers', 'loudspeaker'], ['speaker', 'soundbar'], 'speakers'),
  K(['in ceiling speaker', 'ceiling speaker'], ['speaker'], 'in-ceiling speakers'),
  K(['soundbar', 'sound bar', 'all in one speaker'], ['soundbar'], 'soundbars'),
  K(['amp', 'amplifier', 'amplification'], ['amplifier', 'streamer'], 'amplifiers'),
  K(['streamer', 'preamp', 'preamplifier'], ['streamer'], 'audio streamers'),
  K(['wifi', 'wireless', 'wifi network', 'wifi coverage'], ['wifi-ap', 'wifi-prewire'], 'Wi-Fi'),
  K(['access point', 'ap', 'wap', 'wifi access point', 'wireless access point', 'wifi point', 'wifi ap', 'wifi router'], ['wifi-ap'], 'Wi-Fi access points'),
  K(['network switch', 'switch', 'poe switch', 'ethernet switch'], ['network-switch'], 'network switches'),
  K(['router', 'gateway', 'firewall', 'dream machine'], ['router'], 'routers'),
  K(['patch panel'], ['patch-panel'], 'patch panels'),
  K(['rack', 'equipment rack', 'enclosure'], ['rack'], 'equipment racks'),
  K(['chime', 'door chime'], ['chime'], 'door chimes'),
  K(['touchscreen', 'touch screen', 'touch panel', 'touchpanel', 'control panel', 'wall panel', 'screen'], ['touchscreen', 'touchpanel-prewire'], 'touchscreens'),
  K(['thermostat', 'temperature control', 'temperature'], ['thermostat'], 'thermostats'),
  K(['processor', 'controller', 'control processor', 'brain', 'brains'], ['processor'], 'control processors'),
  K(['ups', 'battery backup', 'battery', 'power backup', 'surge'], ['ups'], 'battery backups'),
  K(['power box', 'versabox', 'recessed box', 'tv box'], ['power-box'], 'recessed power boxes'),
  K(['keypad', 'light switch', 'lighting keypad', 'button', 'wall switch', 'dimmer switch'], ['keypad'], 'lighting keypads'),
  K(['dimmer', 'power module', 'lighting module', 'dimming module'], ['lighting-module'], 'lighting power modules'),
  K(['lighting panel', 'shade panel', 'panel', 'electrical panel'], ['lighting-panel'], 'lighting & shade panels'),
  K(['doorbell', 'door bell', 'video doorbell', 'entry station', 'door station'], ['doorbell'], 'video doorbells'),
  K(['intercom'], ['intercom'], 'intercoms'),
  K(['door hub', 'gate hub', 'door controller', 'gate controller'], ['door-hub'], 'door & gate controllers'),
  K(['lock', 'door lock', 'strike', 'lock strike'], ['lock'], 'electric locks'),
  K(['access control', 'entry system', 'door access'], ['doorbell', 'intercom', 'door-hub', 'lock'], 'access control'),
  K(['camera', 'cctv camera', 'security camera', 'ptz', 'dome camera'], ['camera'], 'security cameras'),
  K(['cameras and recorder', 'surveillance', 'cctv'], ['camera', 'nvr'], 'surveillance'),
  K(['nvr', 'recorder', 'video recorder', 'dvr'], ['nvr'], 'video recorders'),
  K(['shade', 'shades', 'blind', 'motorized shade', 'roller shade', 'curtain', 'drape', 'blackout', 'sheer'], ['shade'], 'motorized shades'),
  K(['shade bracket', 'bracket'], ['shade-bracket'], 'shade brackets'),
  K(['tv', 'television', 'display', 'video', 'video point'], ['video-prewire'], 'TV / video points'),
  K(['prewire', 'end point', 'endpoint', 'wiring point', 'cable drop', 'drop'], ['audio-prewire', 'video-prewire', 'wifi-prewire', 'network-prewire', 'touchpanel-prewire', 'demarc'], 'pre-wire points'),
  K(['network point', 'network drop', 'data point', 'ethernet'], ['network-prewire'], 'network pre-wire points'),
  K(['allowance', 'allowances', 'project management', 'design fee', 'documentation', 'service'], ['service'], 'services & allowances'),
  K(['wire', 'cable', 'cabling', 'harness', 'accessories'], ['accessory'], 'wiring & accessories'),
];

const SYSTEM_ALIASES: Record<string, string[]> = {
  'AV System': ['av', 'a v', 'audio video', 'audio visual', 'audiovisual', 'av system', 'entertainment'],
  Network: ['network', 'networking', 'internet', 'data network'],
  Security: ['security', 'security system', 'alarm'],
  'Lighting & Shades Control': ['lighting', 'lights', 'light', 'lighting control', 'lighting system'],
  'Window Treatments': ['window treatment', 'window treatments', 'window covering', 'window coverings'],
  'Climate Control': ['climate', 'hvac', 'heating', 'cooling', 'climate control', 'air conditioning'],
  'Automation Control': ['automation', 'control system', 'smart home', 'home automation', 'crestron home', 'automation control'],
  Infrastructure: ['infrastructure', 'structured wiring', 'low voltage'],
};

const FLOOR_ALIASES: Record<string, string[]> = {
  'First Floor': ['first floor', '1st floor', 'ground floor', 'level 1', 'l1', 'downstairs', 'main floor', 'first level', 'ground level', 'floor 1'],
  'Second Floor': ['second floor', '2nd floor', 'upstairs', 'level 2', 'l2', 'second level', 'upper floor', 'floor 2'],
  'Third Floor': ['third floor', '3rd floor', 'level 3', 'l3', 'roof', 'roof deck', 'floor 3'],
  Outdoor: ['outdoor', 'outdoors', 'outside', 'exterior', 'ext', 'yard', 'garden', 'landscape', 'grounds'],
  'Whole House': ['whole house', 'whole home', 'house wide', 'project wide'],
};

const PHASE_ALIASES: Record<string, string[]> = {
  'Rough-In': ['roughin', 'rough'],
  Trim: ['trim', 'trim out', 'trimout'],
  Finish: ['finish', 'finishing', 'commissioning'],
  'Design & Documentation': ['design phase', 'design and documentation'],
  'Overall Project': ['overall project'],
};

const ROOM_SYNONYMS: [RegExp, string][] = [
  [/\bprimary\b/g, 'master'],
  [/\bmaster\b/g, 'primary'],
  [/\bwic\b/g, 'walk in closet'],
  [/\bmaids\b/g, 'maid'],
  [/\bpowder room\b/g, 'powder'],
  [/\bhallway\b/g, 'hall'],
];

// Everyday names for rooms, matched against the location path.
const EXTRA_ROOM_ALIASES: [string[], RegExp][] = [
  [['master', 'primary', 'master suite', 'primary suite', 'owners suite'], /Master Suite/],
  [['front door', 'front entrance', 'main entrance'], /^Outdoor > Entrance$/],
  [['patio', 'terrace'], /Covered Terrace/],
  [['server room', 'tech room', 'mechanical room', 'head end', 'av closet', 'network closet'], /Equipment Room/],
  [['staff quarters', 'maid room', 'staff room'], /Maids/],
  [['kitchen'], /Kitchen & Breakfast/],
  [['outdoor general', 'outdoor (general)'], /^Outdoor$/],
];

// Words too generic to identify a room on their own.
const WEAK_ROOM_WORDS = new Set(['room', 'area', 'floor', 'house', 'and', 'the', 'stairs', 'side', 'covered', 'service', 'suite', '1', '2', '3']);

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const aliasRe = (a: string) => new RegExp(`(?:^| )${a.split(' ').map(escRe).join(' ')}(?:s|es)?(?= |$)`);

export class QuoteEngine {
  readonly items: Item[];
  readonly source: string;
  private lex: LexEntry[] = [];
  readonly locations: string[];

  constructor(items: Item[], source: string) {
    this.items = items;
    this.source = source;
    this.locations = [...new Set(items.map((i) => i.location))].sort(
      (a, b) => floorRank(this.byLoc(a).floor) - floorRank(this.byLoc(b).floor) || a.localeCompare(b),
    );
    this.buildLexicon();
  }

  private byLoc(loc: string) {
    return this.items.find((i) => i.location === loc)!;
  }

  // ---------- lexicon ----------

  private add(aliases: string[], type: LexEntry['type'], values: string[], topic?: string) {
    for (const raw of aliases) {
      const a = normalize(raw);
      if (!a) continue;
      this.lex.push({ re: aliasRe(a), len: a.length, type, values, topic });
    }
  }

  private buildLexicon() {
    for (const k of KIND_ALIASES) this.add(k.aliases, 'kinds', k.kinds, k.topic);
    for (const [sys, al] of Object.entries(SYSTEM_ALIASES)) this.add([...al, sys], 'systems', [sys], sys);
    for (const [fl, al] of Object.entries(FLOOR_ALIASES)) this.add([...al, fl], 'floors', [fl], fl);
    for (const [ph, al] of Object.entries(PHASE_ALIASES)) this.add([...al, ph], 'phases', [ph], ph);

    const brands = [...new Set(this.items.map((i) => i.brand).filter((b) => b !== '—'))];
    const byFirst = new Map<string, string[]>();
    for (const b of brands) {
      const first = normalize(b).split(' ')[0];
      byFirst.set(first, [...(byFirst.get(first) ?? []), b]);
      this.add([b], 'brands', [b], b);
    }
    for (const [first, bs] of byFirst) this.add([first], 'brands', bs, bs[0]);
    this.add(['unifi'], 'brands', brands.filter((b) => /ubiquiti/i.test(b)), 'Ubiquiti');

    // Room aliases: full path, last segment, its "&"/","/"and" parts, and its last word.
    const aliasMap = new Map<string, Set<string>>();
    const put = (alias: string, loc: string) => {
      const a = normalize(alias);
      if (!a || WEAK_ROOM_WORDS.has(a) || a.length < 3) return;
      if (!aliasMap.has(a)) aliasMap.set(a, new Set());
      aliasMap.get(a)!.add(loc);
    };
    for (const loc of this.locations) {
      const segs = loc.split('>').map((s) => s.trim());
      if (segs.length < 2) continue;
      const rest = segs.slice(1);
      const last = rest[rest.length - 1];
      const variants = (s: string) => {
        const out = [s];
        for (const [re, rep] of ROOM_SYNONYMS) {
          const n = normalize(s);
          if (re.test(n)) out.push(n.replace(re, rep));
          re.lastIndex = 0;
        }
        return out;
      };
      for (const v of variants(rest.join(' '))) put(v, loc);
      for (const v of variants(last)) put(v, loc);
      if (rest.length > 1) for (const v of variants(`${rest[rest.length - 2]} ${last}`)) put(v, loc);
      for (const part of last.split(/,|&|\band\b/)) for (const v of variants(part.trim())) put(v, loc);
      put(normalize(last).replace(/ \d+$/, ''), loc);
      const words = normalize(last).split(' ');
      put(words[words.length - 1], loc);
      // Parent groupings such as "Master Suite", "Suite 1", "Service Area", "Maids".
      for (const seg of rest.slice(0, -1)) for (const v of variants(seg)) put(v, loc);
    }
    for (const [aliases, re] of EXTRA_ROOM_ALIASES) {
      const locs = this.locations.filter((l) => re.test(l));
      if (locs.length) for (const a of aliases) aliasMap.set(normalize(a), new Set(locs));
    }
    for (const [a, locs] of aliasMap) this.lex.push({ re: aliasRe(a), len: a.length + 0.5, type: 'locations', values: [...locs], topic: a });

    // Longest alias first, so "primary bedroom" beats "bedroom" and "wifi access point" beats "wifi".
    this.lex.sort((a, b) => b.len - a.len);
  }

  extract(q: string): Entities {
    let text = ` ${normalize(q)} `.replace(/^ | $/g, '');
    const e: Entities = { kinds: new Set(), locations: new Set(), floors: new Set(), systems: new Set(), brands: new Set(), phases: new Set(), topics: [] };
    for (const entry of this.lex) {
      const m = entry.re.exec(text);
      if (!m) continue;
      entry.values.forEach((v) => e[entry.type].add(v));
      if (entry.topic && entry.type !== 'locations') e.topics.push(entry.topic);
      text = text.slice(0, m.index) + ' '.repeat(m[0].length) + text.slice(m.index + m[0].length);
    }
    // "upstairs hallway" means the hallway on that floor, not the whole floor.
    if (e.floors.size && e.locations.size) {
      const both = [...e.locations].filter((l) => e.floors.has(this.byLoc(l).floor));
      if (both.length) {
        e.locations = new Set(both);
        e.floors.clear();
      }
    }
    return e;
  }

  // ---------- filtering & grouping ----------

  private filter(e: Entities): Item[] {
    return this.items.filter((i) => {
      if (e.locations.size || e.floors.size) {
        const inLoc = e.locations.has(i.location);
        const inFloor = e.floors.has(i.floor);
        if (!inLoc && !inFloor) return false;
      }
      if (e.kinds.size || e.systems.size) {
        if (!e.kinds.has(i.kind) && !e.systems.has(i.system)) return false;
      }
      if (e.brands.size && !e.brands.has(i.brand)) return false;
      if (e.phases.size && !e.phases.has(i.phase)) return false;
      return true;
    });
  }

  private keyOf(i: Item, d: Dim): string {
    switch (d) {
      case 'system': return i.system;
      case 'floor': return i.floor;
      case 'room': return i.location;
      case 'brand': return i.brand === '—' ? 'Labor, pre-wire & allowances' : i.brand.replace(/ Networks$/, '');
      case 'phase': return i.phase;
      case 'kind': return kindById.get(i.kind)!.plural;
      case 'supplier': return i.supplier;
      case 'category': return i.category;
    }
  }

  private group(items: Item[], d: Dim, val: (i: Item) => number = (i) => i.total) {
    const m = new Map<string, { value: number; items: Item[] }>();
    for (const i of items) {
      const k = this.keyOf(i, d);
      const g = m.get(k) ?? { value: 0, items: [] };
      g.value += val(i);
      g.items.push(i);
      m.set(k, g);
    }
    return [...m.entries()].map(([key, g]) => ({ key, ...g }));
  }

  roomLabel(loc: string) {
    const segs = loc.split('>').map((s) => s.trim());
    if (segs.length === 1) return segs[0] === 'Whole House' ? 'Whole house' : `${segs[0]} (general)`;
    return segs.slice(1).join(' · ');
  }

  private scopeLabel(e: Entities): string {
    const parts: string[] = [];
    if (e.locations.size) {
      const locs = [...e.locations];
      parts.push(locs.length <= 2 ? listJoin(locs.map((l) => this.roomLabel(l))) : `${locs.length} rooms`);
    }
    if (e.floors.size) parts.push(listJoin([...e.floors].map((f) => (FLOOR_ORDER.indexOf(f) < 3 ? `the ${f}` : f.toLowerCase()))));
    return parts.length ? parts.join(' / ') : '';
  }

  /** Bar rows for a grouped breakdown, largest first; floors keep drawing order. */
  private bars(items: Item[], d: Dim, val: (i: Item) => number = (i) => i.total, fmt = money): BarRow[] {
    const total = items.reduce((s, i) => s + val(i), 0) || 1;
    const rows = this.group(items, d, val);
    if (d === 'floor') rows.sort((a, b) => floorRank(a.key) - floorRank(b.key));
    else if (d === 'phase') rows.sort((a, b) => phaseRank(a.key) - phaseRank(b.key));
    else rows.sort((a, b) => b.value - a.value);
    return rows.map((r) => ({
      label: d === 'room' ? this.roomLabel(r.key) : r.key,
      value: r.value,
      display: fmt(r.value),
      sub: d === 'room' ? `${this.byLoc(r.key).floor} · ${pct(r.value / total)}` : pct(r.value / total),
      ask: askFor(d, r.key, this),
    }));
  }

  private floorGroups(items: Item[], line: (items: Item[]) => Line[], meta?: (items: Item[]) => string): FloorGroup[] {
    const byFloor = new Map<string, Map<string, Item[]>>();
    for (const i of items) {
      if (!byFloor.has(i.floor)) byFloor.set(i.floor, new Map());
      const rooms = byFloor.get(i.floor)!;
      rooms.set(i.location, [...(rooms.get(i.location) ?? []), i]);
    }
    return [...byFloor.entries()]
      .sort((a, b) => floorRank(a[0]) - floorRank(b[0]))
      .map(([floor, rooms]) => ({
        floor,
        tag: floorTag(floor),
        rooms: [...rooms.entries()]
          .sort((a, b) => this.locations.indexOf(a[0]) - this.locations.indexOf(b[0]))
          .map(([loc, its]) => ({ room: this.roomLabel(loc), ask: `What's in the ${this.roomLabel(loc)}?`, meta: meta?.(its), lines: line(its) })),
      }));
  }

  /** One line per product, quantities merged. */
  private lines(items: Item[]): Line[] {
    const m = new Map<string, Line & { n: number; isPre: boolean }>();
    for (const i of items) {
      const k = kindById.get(i.kind)!;
      const key = `${i.kind}|${itemTitle(i)}`;
      const cur = m.get(key);
      if (cur) {
        cur.n += i.units;
        cur.amount = (cur.amount ?? 0) + i.total;
      } else {
        m.set(key, { label: itemTitle(i), sub: k.label, qty: '', n: i.units, muted: k.group !== 'device', isPre: k.group === 'prewire', amount: i.total });
      }
    }
    return [...m.values()]
      .sort((a, b) => Number(a.muted) - Number(b.muted) || (b.amount ?? 0) - (a.amount ?? 0))
      .map(({ n, isPre, ...l }) => ({ ...l, qty: isPre ? `${num(n)} pt` : `× ${num(n)}` }));
  }

  // ---------- answers ----------

  ask(question: string): Answer {
    const q = normalize(question);
    const e = this.extract(question);
    // "shades in suite 2" names two rooms; keep only the ones that have matches.
    if (e.locations.size > 1) {
      const hit = new Set(this.filter(e).map((i) => i.location));
      const narrowed = [...e.locations].filter((l) => hit.has(l));
      if (narrowed.length) e.locations = new Set(narrowed);
    }
    const has = (re: RegExp) => re.test(q);
    const hasEntity = e.kinds.size + e.systems.size + e.locations.size + e.floors.size + e.brands.size + e.phases.size > 0;
    const dim = dimFrom(q);
    const dimAny = dim ?? dimWord(q);

    if (!q) return this.overview(question);
    if (has(/\b(margin|profit|markup|mark up|gross)\b/)) return this.margin(question, e);
    if (has(/\b(labor|labour|man hours|install time|installation time|hours|technician)\b/)) return this.labor(question, e, dim);
    if (has(/\b(how many|number of|count|quantity|qty|total number)\b/) && !has(/\bhow much\b/)) return this.count(question, e, q);
    if (has(/\b(most expensive|priciest|biggest|largest|top|costliest|highest)\b/)) return this.top(question, e, has(/\broom|space|area/));
    if (has(/\b(price|prices|cost|costs|total|how much|budget|spend|spent|investment|value|tax|taxes|after tax|grand total|\$|dollar|money|quote|breakdown|break down|split|allocation|expensive|cheapest|cheap)\b/) || (dim && !has(/\bhow many\b/)))
      return this.price(question, e, dimAny);
    if (!hasEntity && has(/\b(brand|brands|manufacturer|manufacturers|make|makes)\b/)) return this.price(question, e, 'brand');
    if (!hasEntity && has(/\b(supplier|suppliers|vendor|vendors|distributor)\b/)) return this.price(question, e, 'supplier');
    if (!hasEntity && has(/\b(phase|phases|schedule|stage|stages|timeline)\b/)) return this.price(question, e, 'phase');
    if (has(/\b(where|location|locations|which rooms?|what rooms?|placed|located|coverage)\b/) && (e.kinds.size || e.systems.size || e.brands.size))
      return this.where(question, e);
    if (e.locations.size || e.floors.size) return this.contents(question, e);
    if (e.kinds.size || e.systems.size || e.brands.size) return this.where(question, e);
    if (e.phases.size) return this.contents(question, e);
    if (has(/\b(floor|floors|level|levels|rooms|spaces|room list|layout)\b/)) return this.floors(question);
    if (has(/\b(summary|overview|project|scope|everything|tell me about|executive)\b/)) return this.overview(question);
    return this.search(question, q);
  }

  overview(question: string): Answer {
    const items = this.items;
    const total = sum(items, (i) => i.total);
    const devices = items.filter(isDevice);
    const rooms = new Set(items.map((i) => i.location));
    return {
      question,
      title: `${money(total + sum(items, taxOf))} project across ${rooms.size} locations, with tax`,
      lead: `${plural(sum(devices, (i) => i.units), 'device')} over ${this.systemCount()} systems.`,
      stats: this.moneyStats(items),
      bars: { title: 'Investment by floor, before tax', rows: this.bars(items, 'floor') },
      notes: this.priceNotes(items),
      followups: ['Cost by room', 'What are the audio locations?', 'Where are the Wi-Fi access points?', 'What are the most expensive items?'],
    };
  }

  private systemCount() {
    return new Set(this.items.map((i) => i.system)).size;
  }

  price(question: string, e: Entities, dim: Dim | null): Answer {
    const items = this.filter(e);
    if (!items.length) return this.empty(question, e);
    const scoped = items.length !== this.items.length;
    const total = sum(items, (i) => i.total);
    const scope = describe(e, this);
    let d: Dim = dim ?? defaultDim(e);
    if (new Set(items.map((i) => this.keyOf(i, d))).size < 2) d = defaultDim(e);
    const dimName: Record<Dim, string> = { system: 'system', floor: 'floor', room: 'room', brand: 'brand', phase: 'phase', kind: 'device type', supplier: 'supplier', category: 'category' };
    const followups = scoped
      ? [
          `How many labor hours for ${scope}?`,
          e.kinds.size || e.systems.size ? `Where is ${topicName(e)} installed?` : `What's in ${scope}?`,
          'What is the total price of the project?',
        ]
      : ['Cost by floor', 'Cost by phase', 'Which brands are used?', 'What are the most expensive rooms?'];
    const rows = this.bars(items, d);
    const withTax = total + sum(items, taxOf);
    let title = scoped ? `${money(withTax)} for ${scope} with tax` : `The project totals ${money(withTax)} with tax`;
    if (!scoped && (d === 'brand' || d === 'supplier')) {
      const named = rows.filter((r) => !r.label.startsWith('Labor'));
      title = `${plural(named.length, d)} supply this project. ${named[0].label} leads at ${named[0].sub}`;
    }
    return {
      question,
      title,
      lead: scoped
        ? `${money(total)} before tax, ${pct(total / sum(this.items, (i) => i.total))} of the project.`
        : `${money(total)} in equipment and labor plus ${money(withTax - total)} sales tax at ${taxLabel()}.`,
      stats: this.moneyStats(items),
      bars: { title: `By ${dimName[d]}, before tax`, rows },
      notes: this.priceNotes(items),
      followups: followups.filter((f) => normalize(f) !== normalize(question)),
    };
  }

  /** Before-tax split, tax and the after-tax total. */
  private moneyStats(items: Item[]) {
    const pre = sum(items, (i) => i.total);
    const tax = sum(items, taxOf);
    return [
      { label: 'Equipment', value: money(sum(items, (i) => i.equipmentTotal)) },
      { label: 'Labor', value: money(sum(items, (i) => i.laborPrice)) },
      { label: 'Subtotal', value: money(pre) },
      { label: `Sales tax ${taxLabel()}`, value: money(tax) },
      { label: 'Total with tax', value: money(pre + tax) },
    ];
  }

  private priceNotes(items: Item[]): Answer['notes'] {
    const notes: NonNullable<Answer['notes']> = [];
    const untaxed = items.filter((i) => !i.taxable && i.total !== 0);
    const tax = sum(items, taxOf);
    if (tax) {
      const alt = sum(items, (i) => taxOf(i, !TAX.includeLabor));
      notes.push({
        tone: 'info',
        text: TAX.includeLabor
          ? `Sales tax is ${taxLabel()} on equipment and labor. If labor isn't taxable, tax would be ${money(alt)} and the total ${money(sum(items, (i) => i.total) + alt)}.`
          : `Sales tax is ${taxLabel()} on equipment only. Taxing labor too would make it ${money(alt)}.`,
      });
    }
    if (untaxed.length) notes.push({ tone: 'info', text: `${plural(untaxed.length, 'line')} marked non-taxable carry no tax.` });
    for (const i of items) {
      if (i.unitPrice > 0 && i.laborPrice > 0 && Math.abs(i.unitPrice * i.qty - i.laborPrice) < 0.01 && kindById.get(i.kind)!.group === 'service')
        notes.push({ tone: 'warn', text: `"${i.name}" has ${money(i.laborPrice)} as both a product price and a labor price, so it adds ${money(i.total)}. Check it isn't counted twice.` });
      if (i.total < 0) notes.push({ tone: 'info', text: `Includes a ${money(-i.total)} credit for "${i.name}".` });
    }
    return notes;
  }

  labor(question: string, e: Entities, dim: Dim | null): Answer {
    const items = this.filter(e);
    if (!items.length) return this.empty(question, e);
    const hours = sum(items, (i) => i.laborHours);
    const scope = describe(e, this);
    const d: Dim = dim ?? (e.phases.size ? 'system' : 'phase');
    const allowance = items.filter((i) => i.kind === 'service' && i.laborPrice > 0 && !i.laborHours);
    return {
      question,
      title: `${num(hours)} labor hours${scope ? ` for ${scope}` : ''}`,
      lead: `Billed at ${money(sum(items, (i) => i.laborPrice))}.`,
      stats: [
        { label: 'Labor price', value: money(sum(items, (i) => i.laborPrice)) },
        { label: 'Hours', value: num(hours) },
        { label: 'Tech days (8 h)', value: num(hours / 8) },
      ],
      bars: { title: `Hours by ${d}`, rows: this.bars(items.filter((i) => i.laborHours), d, (i) => i.laborHours, (v) => `${num(v)} h`) },
      notes: allowance.length ? [{ tone: 'info', text: `Hours exclude ${listJoin(allowance.map((a) => `"${a.name}" (${money(a.laborPrice)})`))}, which is priced without hours.` }] : [],
      followups: ['Labor by system', 'Labor by floor', 'What gets installed during rough-in?'],
    };
  }

  margin(question: string, e: Entities): Answer {
    const items = this.filter(e);
    if (!items.length) return this.empty(question, e);
    const price = sum(items, (i) => i.equipmentTotal);
    const cost = sum(items, (i) => i.unitCost * i.qty);
    const lp = sum(items, (i) => i.laborPrice);
    const lc = sum(items, (i) => i.laborCost);
    const gp = price - cost + (lp - lc);
    const rev = price + lp;
    return {
      question,
      title: `Gross margin of ${money(gp)} (${pct(gp / (rev || 1))})`,
      lead: describe(e, this) ? `For ${describe(e, this)}.` : 'Price minus cost for equipment and labor, from the quote’s cost columns.',
      stats: [
        { label: 'Equipment margin', value: `${money(price - cost)} · ${pct((price - cost) / (price || 1))}` },
        { label: 'Labor margin', value: `${money(lp - lc)} · ${pct((lp - lc) / (lp || 1))}` },
        { label: 'Total cost', value: money(cost + lc) },
      ],
      bars: {
        title: 'Gross margin by system',
        rows: this.bars(items, 'system', (i) => i.equipmentTotal - i.unitCost * i.qty + i.laborPrice - i.laborCost),
      },
      notes: [{ tone: 'info', text: 'Lines without a unit cost (allowances, pre-wire points) count as 100% margin.' }],
      followups: ['What is the total price of the project?', 'Cost by brand'],
    };
  }

  top(question: string, e: Entities, rooms: boolean): Answer {
    const items = this.filter(e);
    if (!items.length) return this.empty(question, e);
    if (rooms) {
      return {
        question,
        title: 'Rooms ranked by investment',
        lead: `Equipment and labor per location, before ${taxLabel()} sales tax.`,
        bars: { title: 'By room', rows: this.bars(items, 'room').slice(0, 12) },
        followups: ['What’s in the equipment room?', 'Cost by floor'],
      };
    }
    const lines = items.filter((i) => i.kind !== 'service').sort((a, b) => b.total - a.total).slice(0, 10);
    return {
      question,
      title: `Top ${lines.length} line items${describe(e, this) ? ` for ${describe(e, this)}` : ''}`,
      lead: 'Ranked by extended price (quantity × unit price + labor). Allowances are left out.',
      items: lines,
      followups: ['What are the most expensive rooms?', 'Cost by device type'],
    };
  }

  count(question: string, e: Entities, q: string): Answer {
    const scopeOnly = !e.kinds.size && !e.systems.size && !e.brands.size;
    if (scopeOnly && /\bfloors?|levels?\b/.test(q) && !e.floors.size && !e.locations.size) return this.floors(question);
    if (scopeOnly && /\brooms?|spaces?|locations?\b/.test(q)) {
      const items = this.filter(e);
      const locs = new Set(items.map((i) => i.location));
      return {
        ...this.floors(question, items),
        title: `${plural(locs.size, 'location')}${e.floors.size ? ` on ${this.scopeLabel(e)}` : ''}`,
      };
    }
    const items = this.filter(e);
    if (!items.length) return this.empty(question, e);
    const scope = this.scopeLabel(e);
    const wantsKinds = e.kinds.size || e.systems.size;
    const devices = items.filter((i) => (e.kinds.size ? e.kinds.has(i.kind) && kindById.get(i.kind)!.group !== 'prewire' : isDevice(i)));
    const counted = devices.length ? devices : items;
    const n = sum(counted, (i) => i.units);
    const what = e.kinds.size ? topicName(e) : wantsKinds ? `${topicName(e)} devices` : 'devices';
    const pairs = counted.filter((i) => i.units !== i.qty);
    const notes: NonNullable<Answer['notes']> = [];
    if (pairs.length) notes.push({ tone: 'info', text: `Counts individual speakers. ${listJoin([...new Set(pairs.map((p) => p.model))])} is sold in pairs.` });
    if (!e.kinds.size) notes.push({ tone: 'info', text: 'Devices exclude pre-wire points, wire, harnesses and brackets.' });
    const byRoom = new Set(counted.map((i) => i.location)).size;
    return {
      question,
      title: `${num(n)} ${what}${scope ? ` ${e.locations.size ? 'in' : 'on'} ${e.locations.size ? `the ${scope}` : scope}` : ''}`,
      lead: byRoom > 1 ? `Across ${plural(byRoom, 'location')}.` : undefined,
      bars: {
        title: e.kinds.size === 1 || (e.kinds.size && !e.locations.size) ? 'By room' : 'By device type',
        rows:
          e.kinds.size && !e.locations.size
            ? this.bars(counted, 'room', (i) => i.units, (v) => num(v))
            : this.bars(counted, 'kind', (i) => i.units, (v) => num(v)),
      },
      notes,
      followups: wantsKinds ? [`Where are the ${what}?`, `What do the ${what} cost?`] : [`What's in ${scope || 'the equipment room'}?`, 'How many speakers are there?'],
    };
  }

  where(question: string, e: Entities): Answer {
    const items = this.filter(e);
    if (!items.length) return this.empty(question, e);
    const topic = topicName(e);
    const devices = items.filter((i) => kindById.get(i.kind)!.group === 'device');
    const main = devices.length ? devices : items;
    const locs = new Set(main.map((i) => i.location));
    const floors = new Set(main.map((i) => i.floor));
    const n = sum(main, (i) => i.units);
    const notes = this.coverage(items);
    const one = e.kinds.size && main.every((i) => i.kind === main[0].kind) ? kindById.get(main[0].kind)! : null;
    const title = one
      ? `${num(n)} ${lower(n === 1 ? one.label : one.plural)} in ${plural(locs.size, 'location')}`
      : `${capital(topic)} is in ${plural(locs.size, 'location')} across ${plural(floors.size, 'level')}`;
    return {
      question,
      title,
      lead: `${money(sum(items, (i) => i.total))} including labor. Tap a room to see everything in it.`,
      groups: this.floorGroups(items, (its) => this.lines(its)),
      notes,
      followups: [
        `How much does ${topic} cost?`,
        one ? `How many ${lower(one.plural)} are there?` : 'How many speakers are there?',
        'What are the audio locations?',
        'Where are the security cameras?',
      ]
        .filter((f) => normalize(f) !== normalize(question))
        .slice(0, 3),
    };
  }

  /** Flags rooms where pre-wire and devices don't line up. */
  private coverage(items: Item[]): Answer['notes'] {
    const pairs: [string[], string, string, string][] = [
      [['speaker', 'soundbar'], 'audio-prewire', 'speakers', 'audio pre-wire'],
      [['wifi-ap'], 'wifi-prewire', 'Wi-Fi access points', 'Wi-Fi pre-wire'],
      [['touchscreen'], 'touchpanel-prewire', 'touchscreens', 'touch panel pre-wire'],
    ];
    const notes: NonNullable<Answer['notes']> = [];
    const all = this.items;
    for (const [dev, pre, devName, preName] of pairs) {
      if (!items.some((i) => dev.includes(i.kind) || i.kind === pre)) continue;
      const devRooms = new Set(all.filter((i) => dev.includes(i.kind)).map((i) => i.location));
      const preRooms = new Set(all.filter((i) => i.kind === pre).map((i) => i.location));
      const noPre = [...devRooms].filter((r) => !preRooms.has(r)).map((r) => this.roomLabel(r));
      const noDev = [...preRooms].filter((r) => !devRooms.has(r)).map((r) => this.roomLabel(r));
      if (noPre.length) notes.push({ tone: 'warn', text: `${capital(devName)} without ${preName}: ${listJoin(noPre)}.` });
      if (noDev.length) notes.push({ tone: 'warn', text: `${capital(preName)} without ${devName}: ${listJoin(noDev)}.` });
      if (!noPre.length && !noDev.length) notes.push({ tone: 'info', text: `Every room with ${devName} also has ${preName}.` });
    }
    if (items.some((i) => i.kind === 'video-prewire'))
      notes.push({ tone: 'info', text: 'The quote pre-wires TV locations but includes no TVs or displays.' });
    return notes;
  }

  contents(question: string, e: Entities): Answer {
    const items = this.filter(e);
    if (!items.length) return this.empty(question, e);
    const scope = this.scopeLabel(e) || listJoin([...e.phases]);
    const devices = items.filter(isDevice);
    const locs = new Set(items.map((i) => i.location));
    const stats = [
      { label: 'Devices', value: num(sum(devices, (i) => i.units)) },
      { label: 'With tax', value: money(sum(items, (i) => i.total + taxOf(i))) },
      { label: 'Labor hours', value: num(sum(items, (i) => i.laborHours)) },
    ];
    if (locs.size > 1) stats.push({ label: 'Locations', value: num(locs.size) });
    const systems = [...new Set(items.map((i) => i.system))];
    return {
      question,
      title: capital(`${scope.replace(/^the /, '')}${e.phases.size && !e.locations.size && !e.floors.size ? ' phase' : ''}`),
      lead: `${plural(items.length, 'line item')} covering ${listJoin(systems)}.`,
      stats,
      groups: this.floorGroups(items, (its) => this.lines(its), (its) => money(sum(its, (i) => i.total))),
      notes: this.coverage(items)?.filter((n) => n.tone === 'warn' && [...locs].some((l) => n.text.includes(this.roomLabel(l)))),
      followups:
        locs.size === 1
          ? [`How much is the ${scope}?`, 'What’s in the equipment room?', 'Cost by room']
          : [`Cost by room on ${scope}`, `How many devices in ${scope}?`],
    };
  }

  floors(question: string, items: Item[] = this.items): Answer {
    const order = [...new Set(items.map((i) => i.floor))].sort((a, b) => floorRank(a) - floorRank(b));
    return {
      question,
      title: `${plural(order.filter((f) => FLOOR_ORDER.indexOf(f) < 3).length, 'floor')} plus outdoor areas`,
      lead: items === this.items ? `${plural(new Set(items.map((i) => i.location)).size, 'location')} in the quote. Tap a room to see what's in it.` : "Tap a room to see what's in it.",
      groups: this.floorGroups(
        items,
        () => [],
        (its) => `${plural(sum(its.filter(isDevice), (i) => i.units), 'device')} · ${money(sum(its, (i) => i.total))}`,
      ),
      followups: ['Cost by floor', 'How many devices are on the second floor?', 'What’s installed outdoors?'],
    };
  }

  search(question: string, q: string): Answer {
    const words = q.split(' ').filter((w) => w.length > 2 && !STOP.has(w));
    const hits = words.length
      ? this.items.filter((i) => {
          const hay = normalize(`${i.name} ${i.model} ${i.summary} ${i.category} ${i.brand}`);
          return words.every((w) => hay.includes(w));
        })
      : [];
    if (hits.length) {
      return {
        question,
        title: `${plural(hits.length, 'line item')} mention “${words.join(' ')}”`,
        lead: `${money(sum(hits, (i) => i.total))} including labor.`,
        items: hits,
        followups: ['What is the total price of the project?', 'What are the audio locations?'],
      };
    }
    return {
      question,
      title: "I couldn't match that to the quote",
      lead: 'Try naming a room, a floor, a system or a device type, or pick one of these.',
      followups: ['What is the total price of the project?', 'Where are the Wi-Fi access points?', 'What’s in the primary bedroom?', 'How many lighting keypads are there?'],
    };
  }

  private empty(question: string, e: Entities): Answer {
    return {
      question,
      title: `Nothing in the quote matches ${describe(e, this) || 'that'}`,
      lead: 'The combination of room, floor and device type you asked about has no line items.',
      followups: ['What floors and rooms are there?', 'What is the total price of the project?'],
    };
  }

  /** Example questions built from this quote's own rooms and devices. */
  suggestions(): string[] {
    const kinds = new Set(this.items.map((i) => i.kind));
    const out = [
      'What is the total price of the project?',
      'Break down the price by system',
      'What are the audio locations?',
      'Where are the Wi-Fi access points?',
      'Cost by floor',
      'How many devices are on the second floor?',
      'What’s in the primary bedroom?',
      'Where are the security cameras?',
      'How many lighting keypads are there?',
      'Which rooms have motorized shades?',
      'How many labor hours are in the project?',
      'What are the most expensive items?',
      'What are the most expensive rooms?',
      'What’s installed outdoors?',
      'Which brands are used?',
      'What’s in the equipment room?',
      'What gets installed during rough-in?',
      'What is the gross margin?',
      'What floors and rooms are there?',
      'How much is the lighting system?',
      'Cost by phase',
      'Where are the touchscreens?',
      'Where are the thermostats?',
      'Where are the TV locations?',
    ];
    for (const k of KINDS) if (kinds.has(k.id) && k.group === 'device' && k.id !== 'accessory') out.push(`Where are the ${lower(k.plural)}?`, `How many ${lower(k.plural)} are there?`);
    for (const l of this.locations) out.push(`What's in the ${this.roomLabel(l)}?`);
    for (const s of new Set(this.items.map((i) => i.system))) out.push(`How much is ${s}?`);
    return [...new Set(out)];
  }
}

// ---------- helpers ----------

const STOP = new Set(['what', 'where', 'which', 'the', 'are', 'is', 'there', 'how', 'many', 'much', 'show', 'me', 'list', 'all', 'and', 'for', 'with', 'does', 'do', 'have', 'has', 'in', 'of', 'any', 'can', 'you', 'tell', 'about', 'give', 'our', 'this', 'that', 'project']);

const PHASES = ['Design & Documentation', 'Rough-In', 'Trim', 'Finish', 'Overall Project'];
const phaseRank = (p: string) => (PHASES.indexOf(p) + 1 || 99);

const sum = (xs: Item[], f: (i: Item) => number) => Math.round(xs.reduce((s, i) => s + f(i), 0) * 100) / 100;
/** Lower-cases a label but keeps acronyms and brand casing. */
const lower = (s: string) =>
  s.toLowerCase().replace(/wi-fi/g, 'Wi-Fi').replace(/\((ups|nvr|dmarc)\)/g, (m) => m.toUpperCase().replace('DMARC', 'DMarc')).replace(/\btv\b/g, 'TV');
const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function dimFrom(q: string): Dim | null {
  const m = q.match(/\b(?:by|per|each|every|across|between)\s+(system|floor|level|room|location|space|area|brand|manufacturer|make|phase|stage|device|device type|type|category|supplier|vendor)s?\b/);
  return m ? dimMap[m[1]] ?? null : null;
}

/** A dimension named loosely ("price per floors", "floor costs"), used only once price intent is clear. */
function dimWord(q: string): Dim | null {
  const w = q.match(/\b(system|floor|room|brand|phase|supplier|vendor|category)s?\b/)?.[1];
  return w ? dimMap[w] ?? null : null;
}

const dimMap: Record<string, Dim> = {
  system: 'system', floor: 'floor', level: 'floor', room: 'room', location: 'room', space: 'room', area: 'room',
  brand: 'brand', manufacturer: 'brand', make: 'brand', phase: 'phase', stage: 'phase',
  device: 'kind', 'device type': 'kind', type: 'kind', category: 'category', supplier: 'supplier', vendor: 'supplier',
};

function defaultDim(e: Entities): Dim {
  if (e.locations.size === 1) return 'kind';
  if (e.locations.size || e.floors.size) return 'room';
  if (e.kinds.size) return 'room';
  if (e.systems.size) return 'kind';
  return 'system';
}

function topicName(e: Entities): string {
  const t = e.topics.filter((x) => !FLOOR_ORDER.includes(x) && !PHASES.includes(x));
  return t.length ? listJoin([...new Set(t)]) : 'equipment';
}

function describe(e: Entities, eng: QuoteEngine): string {
  const what = e.kinds.size || e.systems.size || e.brands.size ? topicName(e) : '';
  const where = [...[...e.locations].map((l) => eng.roomLabel(l)), ...e.floors];
  const phase = e.phases.size ? `${listJoin([...e.phases])} phase` : '';
  const whereTxt = where.length > 3 ? `${where.length} locations` : listJoin(where);
  return [what, whereTxt && (what ? `in ${whereTxt}` : whereTxt), phase && (what || whereTxt ? `during ${phase}` : phase)].filter(Boolean).join(' ');
}

function askFor(d: Dim, key: string, eng: QuoteEngine): string | undefined {
  switch (d) {
    case 'room': return `What's in the ${eng.roomLabel(key)}?`;
    case 'floor': return key === 'Whole House' ? 'How much is the whole house?' : `What's on the ${key}?`;
    case 'system': return `Where is ${key}?`;
    case 'phase': return `What gets installed during ${key}?`;
    case 'brand': return key.startsWith('Labor') ? undefined : `Where is ${key} used?`;
    default: return undefined;
  }
}
