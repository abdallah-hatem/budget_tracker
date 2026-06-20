// Helpers for number TextInputs that show thousand separators WHILE typing.
// The component keeps the RAW value in state (digits + optional '.', no grouping)
// and only formats for display — so parseFloat(raw) still works on save.

/** Keep digits and (optionally) a single leading decimal point; drop the rest. */
export function sanitizeNumericInput(text: string, decimal = true): string {
  let s = text.replace(decimal ? /[^\d.]/g : /[^\d]/g, '');
  if (!decimal) return s;
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    // collapse any extra dots after the first
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }
  return s;
}

/** Group the integer part with commas, preserving any decimal part the user typed. */
export function formatNumericInput(raw: string): string {
  if (raw === '') return '';
  const [intPart, ...rest] = raw.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // rest.length>0 means a '.' was typed (keep it even with no decimals yet, so the
  // user can keep typing "1,234." → "1,234.5").
  return rest.length > 0 ? `${grouped}.${rest.join('')}` : grouped;
}
