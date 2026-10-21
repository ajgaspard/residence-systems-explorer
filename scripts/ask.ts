// Ask the engine from the terminal: npx tsx scripts/ask.ts "where are the wifi access points?"
import data from '../src/data/quote.json' with { type: 'json' };
import { parseRows } from '../src/lib/model';
import { QuoteEngine } from '../src/lib/engine';

const engine = new QuoteEngine(parseRows(data.rows), data.source);
const qs = process.argv.slice(2);
for (const q of qs.length ? qs : engine.suggestions().slice(0, 24)) {
  const a = engine.ask(q);
  console.log(`\n? ${q}\n= ${a.title}${a.lead ? ` — ${a.lead}` : ''}`);
  a.stats?.forEach((s) => console.log(`  [${s.label}: ${s.value}]`));
  a.bars?.rows.slice(0, 6).forEach((r) => console.log(`  ${a.bars!.title} | ${r.label}: ${r.display} (${r.sub ?? ''})`));
  a.groups?.forEach((g) => g.rooms.forEach((r) => console.log(`  ${g.tag} ${r.room}${r.meta ? ` (${r.meta})` : ''}: ${r.lines.map((l) => `${l.label} ${l.qty}`).join('; ')}`)));
  a.items?.slice(0, 5).forEach((i) => console.log(`  item ${i.name} ${i.total}`));
  a.notes?.forEach((n) => console.log(`  ${n.tone}: ${n.text}`));
}
