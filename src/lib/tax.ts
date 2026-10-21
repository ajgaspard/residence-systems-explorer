import type { Item } from './model';

// Sales tax applied to every line marked Taxable = "Yes" in the quote.
// Set includeLabor to false where installation labor isn't taxed.
export const TAX = { rate: 0.07, includeLabor: true };

export const taxBase = (i: Item, includeLabor = TAX.includeLabor) =>
  i.taxable ? i.equipmentTotal + (includeLabor ? i.laborPrice : 0) : 0;

export const taxOf = (i: Item, includeLabor = TAX.includeLabor) =>
  Math.round(taxBase(i, includeLabor) * TAX.rate * 100) / 100;

export const taxLabel = () => `${+(TAX.rate * 100).toFixed(3)}%`;
