// Converts a quote workbook (.xlsx) into src/data/quote.json.
// Usage: npm run import -- path/to/quote.xlsx
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import XLSX from 'xlsx';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run import -- path/to/quote.xlsx');
  process.exit(1);
}

const wb = XLSX.read(readFileSync(resolve(file)), { type: 'buffer' });
const sheetName = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
const out = { source: sheetName, importedAt: new Date().toISOString(), rows };
writeFileSync(resolve('src/data/quote.json'), JSON.stringify(out, null, 1));
console.log(`Imported ${rows.length} rows from "${sheetName}"`);
