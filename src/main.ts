import './style.css';
import data from './data/quote.json';
import { parseRows, floorRank, floorTag, itemTitle, kindById, type RawRow } from './lib/model';
import { QuoteEngine, isDevice, normalize, type Answer, type BarRow, type FloorGroup } from './lib/engine';
import { esc, money, moneyExact, num } from './lib/format';

let engine = new QuoteEngine(parseRows(data.rows as RawRow[]), data.source);
let pool: string[] = engine.suggestions();
const history: string[] = [];

const STARTERS = [
  'What is the total price of the project?',
  'What are the audio locations?',
  'Where are the Wi-Fi access points?',
  'Cost by floor',
  'What’s in the primary bedroom?',
  'How many lighting keypads are there?',
  'Where are the security cameras?',
  'What are the most expensive rooms?',
];

const app = document.querySelector<HTMLDivElement>('#app')!;

function shell() {
  app.innerHTML = `
  <header class="gutter border-b border-line bg-surface">
    <div class="mx-auto max-w-5xl py-5 flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <p class="eyebrow" id="source"></p>
        <h1 class="font-display text-[28px] leading-tight font-[650] tracking-tight">Residence Systems</h1>
      </div>
      <label class="chip" for="file">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 11V2m0 0L4.5 5.5M8 2l3.5 3.5M2.5 10.5v3h11v-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Load another quote
      </label>
      <input id="file" type="file" accept=".xlsx,.xls,.csv" class="sr-only" />
    </div>
    <dl id="kpis" class="mx-auto max-w-5xl grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-4 pb-5"></dl>
  </header>

  <main class="gutter">
    <div class="mx-auto max-w-5xl py-8 flex flex-col gap-8">
      <section aria-label="Ask a question" class="flex flex-col gap-3">
        <form id="ask" class="relative" autocomplete="off">
          <label for="q" class="sr-only">Ask about the project</label>
          <div class="flex items-center gap-2 rounded-2xl border border-line bg-surface pl-4 pr-2 py-2 shadow-[0_1px_2px_rgb(var(--ink)/0.04)] focus-within:border-accent">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="text-muted shrink-0"><circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.6"/><path d="m13.5 13.5 3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            <input id="q" name="q" type="text" class="min-w-0 flex-1 bg-transparent py-2 text-[16px] outline-none focus-visible:outline-none placeholder:text-muted" placeholder="Ask about rooms, devices, counts or price…" aria-autocomplete="list" aria-controls="suggest" />
            <button class="rounded-xl bg-accent px-4 py-2 text-[14px] font-semibold text-surface hover:opacity-90" type="submit">Ask</button>
          </div>
          <ul id="suggest" role="listbox" class="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg" hidden></ul>
        </form>
        <div class="flex flex-wrap items-center gap-2" id="starters"></div>
        <div class="flex flex-wrap items-center gap-2 text-[13px]" id="recent"></div>
      </section>

      <section id="answer" aria-live="polite"></section>

      <section aria-labelledby="explore-h" class="grid gap-8 md:grid-cols-[1.25fr_1fr]">
        <div class="min-w-0">
          <h2 id="explore-h" class="font-display text-[19px] font-[650] mb-1">Floors and rooms</h2>
          <p class="text-[13px] text-muted mb-4">Tap a room to see everything installed there.</p>
          <div id="floors" class="flex flex-col gap-5"></div>
        </div>
        <div class="min-w-0">
          <h2 class="font-display text-[19px] font-[650] mb-1">Investment by system</h2>
          <p class="text-[13px] text-muted mb-4">Equipment and labor, before tax.</p>
          <div id="systems"></div>
        </div>
      </section>
    </div>
  </main>
  <footer class="gutter border-t border-line">
    <p class="mx-auto max-w-5xl py-5 text-[12px] text-muted" id="foot"></p>
  </footer>`;
}

// ---------- static panels ----------

function renderKpis() {
  const items = engine.items;
  const total = items.reduce((s, i) => s + i.total, 0);
  const kpis = [
    ['Project total', money(total), 'before tax'],
    ['Equipment', money(items.reduce((s, i) => s + i.equipmentTotal, 0)), ''],
    ['Labor', money(items.reduce((s, i) => s + i.laborPrice, 0)), `${num(items.reduce((s, i) => s + i.laborHours, 0))} hours`],
    ['Devices', num(items.filter(isDevice).reduce((s, i) => s + i.units, 0)), `${new Set(items.map((i) => i.system)).size} systems`],
    ['Locations', num(new Set(items.map((i) => i.location)).size), `${new Set(items.map((i) => i.floor)).size} areas`],
  ];
  document.querySelector('#kpis')!.innerHTML = kpis
    .map(
      ([label, value, sub], i) => `
      <div class="min-w-0 ${i === 0 ? 'col-span-2 sm:col-span-1' : ''}">
        <dt class="eyebrow">${label}</dt>
        <dd class="num font-display ${i === 0 ? 'text-[30px]' : 'text-[22px]'} font-[650] leading-tight">${value}</dd>
        ${sub ? `<dd class="text-[12px] text-muted">${sub}</dd>` : ''}
      </div>`,
    )
    .join('');
  document.querySelector('#source')!.textContent = `Technology quote · ${engine.source}`;
  document.querySelector('#foot')!.textContent =
    `Answers are worked out in your browser from ${engine.items.length} line items in “${engine.source}”. Nothing is sent anywhere.`;
}

function renderStarters() {
  document.querySelector('#starters')!.innerHTML =
    `<span class="eyebrow mr-1">Try</span>` + STARTERS.map((q) => `<button class="chip" data-ask="${esc(q)}">${esc(q)}</button>`).join('');
}

function renderRecent() {
  const el = document.querySelector('#recent')!;
  const recent = history.slice(-6, -1).reverse();
  el.innerHTML = recent.length
    ? `<span class="eyebrow mr-1">Recent</span>` +
      recent.map((q) => `<button class="text-muted underline decoration-line underline-offset-4 hover:text-accent" data-ask="${esc(q)}">${esc(q)}</button>`).join('<span class="text-line">·</span>')
    : '';
}

function renderFloors() {
  const byFloor = new Map<string, Map<string, { devices: number; total: number }>>();
  for (const i of engine.items) {
    if (!byFloor.has(i.floor)) byFloor.set(i.floor, new Map());
    const m = byFloor.get(i.floor)!;
    const r = m.get(i.location) ?? { devices: 0, total: 0 };
    r.devices += isDevice(i) ? i.units : 0;
    r.total += i.total;
    m.set(i.location, r);
  }
  document.querySelector('#floors')!.innerHTML = [...byFloor.entries()]
    .sort((a, b) => floorRank(a[0]) - floorRank(b[0]))
    .map(([floor, rooms]) => {
      const total = [...rooms.values()].reduce((s, r) => s + r.total, 0);
      const ask = floor === 'Whole House' ? 'What is in the whole house allowance?' : `What's on the ${floor}?`;
      return `
      <div>
        <button class="flex w-full items-baseline gap-3 border-b border-line pb-2 text-left group" data-ask="${esc(floor === 'Outdoor' ? 'What’s installed outdoors?' : ask)}">
          <span class="tag">${floorTag(floor)}</span>
          <span class="font-semibold group-hover:text-accent">${esc(floor)}</span>
          <span class="ml-auto num text-[13px] text-muted">${money(total)}</span>
        </button>
        <ul class="mt-1">
          ${[...rooms.entries()]
            .sort((a, b) => engine.locations.indexOf(a[0]) - engine.locations.indexOf(b[0]))
            .map(
              ([loc, r]) => `
            <li><button class="bar-row flex w-full items-baseline gap-3 px-2 py-1.5 text-left text-[14px]" data-ask="${esc(`What's in the ${engine.roomLabel(loc)}?`)}">
              <span class="bar-label min-w-0 flex-1 truncate">${esc(engine.roomLabel(loc))}</span>
              <span class="num text-[12px] text-muted whitespace-nowrap">${r.devices ? `${r.devices} device${r.devices === 1 ? '' : 's'}` : '—'}</span>
              <span class="num w-20 text-right text-[13px]">${money(r.total)}</span>
            </button></li>`,
            )
            .join('')}
        </ul>
      </div>`;
    })
    .join('');
}

function barsHtml(rows: BarRow[]) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<ul class="flex flex-col gap-1">${rows
    .map(
      (r) => `
    <li class="bar-row px-2 py-1.5" ${r.ask ? `data-ask="${esc(r.ask)}" role="button" tabindex="0"` : ''} title="${esc(`${r.label}: ${r.display}${r.sub ? ` (${r.sub})` : ''}`)}">
      <div class="flex items-baseline gap-3 text-[14px]">
        <span class="bar-label min-w-0 flex-1 truncate">${esc(r.label)}</span>
        ${r.sub ? `<span class="num hidden sm:inline text-[12px] text-muted whitespace-nowrap">${esc(r.sub)}</span>` : ''}
        <span class="num font-semibold whitespace-nowrap">${esc(r.display)}</span>
      </div>
      <div class="bar-track mt-1.5"><div class="bar-fill" style="width:${Math.max(0, (r.value / max) * 100).toFixed(1)}%"></div></div>
    </li>`,
    )
    .join('')}</ul>`;
}

function renderSystems() {
  document.querySelector('#systems')!.innerHTML = barsHtml(engine.overview('').bars!.rows);
}

// ---------- answers ----------

function groupsHtml(groups: FloorGroup[]) {
  return groups
    .map(
      (g) => `
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-2"><span class="tag">${g.tag}</span><span class="eyebrow">${esc(g.floor)}</span></div>
      <div class="grid gap-2 sm:grid-cols-2">
        ${g.rooms
          .map(
            (r) => `
          <div class="min-w-0 rounded-xl border border-line px-3 py-2.5">
            <button class="flex w-full items-baseline gap-2 text-left hover:text-accent" data-ask="${esc(r.ask ?? '')}">
              <span class="min-w-0 flex-1 font-semibold">${esc(r.room)}</span>
              ${r.meta ? `<span class="num text-[12px] text-muted whitespace-nowrap">${esc(r.meta)}</span>` : ''}
            </button>
            ${
              r.lines.length
                ? `<ul class="mt-1.5 flex flex-col gap-1">${r.lines
                    .map(
                      (l) => `
              <li class="flex items-baseline gap-2 text-[13px] ${l.muted ? 'text-muted' : ''}">
                <span class="min-w-0 flex-1">${esc(l.label)}${l.sub && !l.muted ? `<span class="block text-[11px] text-muted">${esc(l.sub)}</span>` : ''}</span>
                <span class="num font-mono text-[12px] whitespace-nowrap">${esc(l.qty)}</span>
              </li>`,
                    )
                    .join('')}</ul>`
                : ''
            }
          </div>`,
          )
          .join('')}
      </div>
    </div>`,
    )
    .join('');
}

function itemsHtml(a: Answer) {
  return `
  <div class="overflow-x-auto -mx-1">
    <table class="w-full min-w-[560px] text-[13px]">
      <thead><tr class="text-left eyebrow">
        <th class="px-1 py-2 font-semibold">Item</th><th class="px-1 py-2 font-semibold">Location</th>
        <th class="px-1 py-2 text-right font-semibold">Qty</th><th class="px-1 py-2 text-right font-semibold">Unit</th>
        <th class="px-1 py-2 text-right font-semibold">Labor</th><th class="px-1 py-2 text-right font-semibold">Total</th>
      </tr></thead>
      <tbody>${a
        .items!.map(
          (i) => `
        <tr class="border-t border-line align-top">
          <td class="px-1 py-2"><span class="font-semibold">${esc(itemTitle(i))}</span><span class="block text-muted">${esc(i.summary || kindById.get(i.kind)!.label)}</span></td>
          <td class="px-1 py-2 text-muted">${esc(engine.roomLabel(i.location))}</td>
          <td class="px-1 py-2 text-right num">${num(i.qty)}</td>
          <td class="px-1 py-2 text-right num">${moneyExact(i.unitPrice)}</td>
          <td class="px-1 py-2 text-right num">${money(i.laborPrice)}</td>
          <td class="px-1 py-2 text-right num font-semibold">${money(i.total)}</td>
        </tr>`,
        )
        .join('')}</tbody>
    </table>
  </div>`;
}

function renderAnswer(a: Answer) {
  const el = document.querySelector('#answer')!;
  const showBars = a.bars && a.bars.rows.length > 1;
  el.innerHTML = `
  <article class="answer-enter rounded-2xl border border-line bg-surface p-5 sm:p-7 flex flex-col gap-6">
    <header class="flex flex-col gap-1.5">
      ${a.question ? `<p class="text-[13px] text-muted">“${esc(a.question)}”</p>` : '<p class="eyebrow">Project at a glance</p>'}
      <h2 class="font-display text-[24px] sm:text-[28px] leading-tight font-[650] tracking-tight">${esc(a.title)}</h2>
      ${a.lead ? `<p class="text-muted max-w-[65ch]">${esc(a.lead)}</p>` : ''}
    </header>
    ${
      a.stats?.length
        ? `<dl class="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 border-y border-line py-4">${a.stats
            .map((s) => `<div class="min-w-0"><dt class="eyebrow">${esc(s.label)}</dt><dd class="num text-[18px] font-semibold">${esc(s.value)}</dd></div>`)
            .join('')}</dl>`
        : ''
    }
    ${showBars ? `<div><p class="eyebrow mb-2">${esc(a.bars!.title)}</p>${barsHtml(a.bars!.rows)}</div>` : ''}
    ${a.groups?.length ? `<div class="flex flex-col gap-5">${groupsHtml(a.groups)}</div>` : ''}
    ${a.items?.length ? itemsHtml(a) : ''}
    ${
      a.notes?.length
        ? `<ul class="flex flex-col gap-2">${a.notes
            .map(
              (n) => `
          <li class="flex gap-2.5 text-[13px] ${n.tone === 'warn' ? 'text-warn' : 'text-muted'}">
            <span class="mt-[3px] shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider rounded border px-1 ${n.tone === 'warn' ? 'border-warn' : 'border-line'}">${n.tone === 'warn' ? 'Check' : 'Note'}</span>
            <span class="max-w-[75ch]">${esc(n.text)}</span>
          </li>`,
            )
            .join('')}</ul>`
        : ''
    }
    ${
      a.followups.length
        ? `<div class="flex flex-wrap items-center gap-2 border-t border-line pt-4"><span class="eyebrow mr-1">Ask next</span>${a.followups
            .map((q) => `<button class="chip" data-ask="${esc(q)}">${esc(q)}</button>`)
            .join('')}</div>`
        : ''
    }
  </article>`;
}

function ask(q: string, scroll = true) {
  const question = q.trim();
  if (!question) return;
  const input = document.querySelector<HTMLInputElement>('#q')!;
  input.value = question;
  hideSuggest();
  if (history[history.length - 1] !== question) history.push(question);
  renderAnswer(engine.ask(question));
  renderRecent();
  if (scroll) document.querySelector('#answer')!.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

// ---------- autocomplete ----------

let active = -1;
let shown: string[] = [];

function hideSuggest() {
  const ul = document.querySelector<HTMLUListElement>('#suggest')!;
  ul.hidden = true;
  active = -1;
  shown = [];
}

function updateSuggest(text: string) {
  const ul = document.querySelector<HTMLUListElement>('#suggest')!;
  const words = normalize(text).split(' ').filter(Boolean);
  if (!words.length) return hideSuggest();
  shown = pool.filter((p) => {
    const n = normalize(p);
    return words.every((w) => n.includes(w));
  }).slice(0, 6);
  if (!shown.length) return hideSuggest();
  active = -1;
  ul.innerHTML = shown
    .map((s, i) => `<li role="option" id="opt-${i}" data-ask="${esc(s)}" class="cursor-pointer px-4 py-2.5 text-[14px] hover:bg-accent-soft">${esc(s)}</li>`)
    .join('');
  ul.hidden = false;
}

function moveActive(delta: number) {
  if (!shown.length) return;
  active = (active + delta + shown.length) % shown.length;
  document.querySelectorAll('#suggest li').forEach((li, i) => li.classList.toggle('bg-accent-soft', i === active));
}

// ---------- loading another workbook ----------

async function loadFile(file: File) {
  const answer = document.querySelector('#answer')!;
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<RawRow>(wb.Sheets[sheet], { defval: null });
    const need = ['Name', 'Quantity', 'Unit Price', 'Location'];
    const missing = need.filter((h) => !(rows[0] && h in rows[0]));
    if (!rows.length || missing.length) throw new Error(`The first sheet needs these columns: ${missing.join(', ') || need.join(', ')}.`);
    engine = new QuoteEngine(parseRows(rows), `${file.name.replace(/\.[^.]+$/, '')} · ${sheet}`);
    pool = engine.suggestions();
    history.length = 0;
    renderAll();
  } catch (err) {
    answer.innerHTML = `<div class="rounded-2xl border border-warn p-5 text-warn">Couldn't read “${esc(file.name)}”. ${esc(err instanceof Error ? err.message : String(err))}</div>`;
  }
}

// ---------- wiring ----------

function renderAll() {
  renderKpis();
  renderStarters();
  renderRecent();
  renderFloors();
  renderSystems();
  const first = engine.overview('');
  renderAnswer(first);
}

shell();
renderAll();

document.addEventListener('click', (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-ask]');
  if (t?.dataset.ask) ask(t.dataset.ask);
  else if (!(ev.target as HTMLElement).closest('#ask')) hideSuggest();
});
document.addEventListener('keydown', (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>('[role="button"][data-ask]');
  if (t && (ev.key === 'Enter' || ev.key === ' ')) {
    ev.preventDefault();
    ask(t.dataset.ask!);
  }
});

const input = document.querySelector<HTMLInputElement>('#q')!;
input.addEventListener('input', () => updateSuggest(input.value));
input.addEventListener('keydown', (ev) => {
  if (ev.key === 'ArrowDown') { ev.preventDefault(); moveActive(1); }
  else if (ev.key === 'ArrowUp') { ev.preventDefault(); moveActive(-1); }
  else if (ev.key === 'Escape') hideSuggest();
});
document.querySelector('#ask')!.addEventListener('submit', (ev) => {
  ev.preventDefault();
  ask(active >= 0 ? shown[active] : input.value);
});
document.querySelector<HTMLInputElement>('#file')!.addEventListener('change', (ev) => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (f) loadFile(f);
});
