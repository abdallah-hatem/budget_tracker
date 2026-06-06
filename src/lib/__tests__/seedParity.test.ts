// src/lib/__tests__/seedParity.test.ts
import * as fs from 'fs';
import * as path from 'path';
import { CATEGORIES } from '../categories';

const seedPath = path.resolve(__dirname, '../../../supabase/seed.sql');
const sql = fs.readFileSync(seedPath, 'utf8');

// Extract rows: each line that begins with ('slug', ...
// The insert rows look like:
//   ('food', 'Food & Drink', ..., 'expense', ..., 10),
// We capture: group 1 = slug, group 2 = kind
const ROW_RE = /\(\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'(expense|income)'/g;

interface SeedRow { slug: string; kind: 'expense' | 'income' }

function parseSeedRows(): SeedRow[] {
  const rows: SeedRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = ROW_RE.exec(sql)) !== null) {
    rows.push({ slug: m[1], kind: m[2] as 'expense' | 'income' });
  }
  return rows;
}

describe('seed.sql parity with categories.ts', () => {
  const seedRows = parseSeedRows();

  it('extracts exactly 18 rows from seed.sql', () => {
    expect(seedRows).toHaveLength(18);
  });

  it('seed slugs match categorySlugs() set exactly', () => {
    const seedSlugs = new Set(seedRows.map((r) => r.slug));
    const catSlugs = new Set(CATEGORIES.map((c) => c.slug));
    expect(seedSlugs).toEqual(catSlugs);
  });

  it('each slug has the same kind in seed.sql and categories.ts', () => {
    const catBySlug = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.kind]));
    for (const row of seedRows) {
      expect(catBySlug[row.slug]).toBe(row.kind);
    }
  });
});
