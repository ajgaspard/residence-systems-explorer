# Residence Systems Explorer

An interactive dashboard for a home technology quote. Ask plain-English questions about floors, rooms, devices, counts and price, and get answers worked out from the quote spreadsheet.

Built with TypeScript, Vite and Tailwind CSS. Everything runs in the browser. Nothing is sent to a server or an AI service.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # static site in dist/
npm run build:single   # one self-contained HTML file in dist-single/
```

## Update the data

```bash
npm run import -- path/to/quote.xlsx   # rewrites src/data/quote.json
```

You can also click **Load another quote** in the app to open a different `.xlsx` without rebuilding. The first sheet needs these columns: `Name`, `Quantity`, `Unit Price` and `Location`. `Location` uses the `Floor > Room` form, for example `Second Floor > Master Suite > Primary Bedroom`. `Labor Price`, `Labor Hours`, `Unit Cost`, `System`, `Phase`, `Brand` and `Category` are used when they're present.

## Example questions

- What is the total price of the project? / Break down the price by system / Cost by floor
- What are the audio locations? / Where are the Wi-Fi access points?
- What's in the primary bedroom? / What's installed outdoors?
- How many devices are on the second floor? / How many lighting keypads are there?
- How many labor hours are in the project? / What is the gross margin?
- What gets installed during rough-in? / Which brands are used?

Try questions from the terminal:

```bash
npx tsx scripts/ask.ts "where are the cameras?" "cost of shades in suite 2"
```

## How answers are worked out

| File | Role |
|---|---|
| `src/lib/model.ts` | Parses rows and assigns each line a floor, a room and a device type (speaker, Wi-Fi access point, keypad and so on). |
| `src/lib/engine.ts` | Finds rooms, floors, systems, device types, brands and phases in a question, picks the intent (price, count, where, what's in, labor, margin, top items) and builds the answer. |
| `src/main.ts` | The interface: ask bar with autocomplete, suggested questions, answer card, floor and room explorer. |

To teach it a new word, add an alias in `KIND_ALIASES`, `SYSTEM_ALIASES`, `FLOOR_ALIASES` or `EXTRA_ROOM_ALIASES` in `engine.ts`.

### Pricing rules

- Line total = quantity × unit price + labor price.
- Sales tax is 7%, applied to equipment and labor on every line marked `Taxable = Yes`. Change the rate, or stop taxing labor, in `src/lib/tax.ts`. Breakdowns by room, floor and system are shown before tax.
- Speaker lines marked `[PAIR]` count as two speakers per unit.
- "Devices" means installed equipment. Pre-wire end points, wire, harnesses, brackets and allowances are left out.
