// Assembles README.md from docs/README.template.md + docs/cards/*.md.
// Pure mechanical merge, no LLM involved — run after editing any card doc.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const CATEGORY_HEADINGS = {
  energy: '🔌 Energy & power',
  climate: '🌡️ Climate & weather',
  light: '💡 Light, media & control',
  presence: '🚪 Presence & safety',
  household: '🧺 Household & planning',
  system: '🛠️ System & maintenance',
  special: '🐠 Special',
  layout: '🧱 Layout',
};
const TABLE_HEADER = '| Card | Type | What it does |';
const CATEGORY_ORDER = Object.keys(CATEGORY_HEADINGS);

function parseFrontmatter(content, file) {
  const m = content.match(/^---\n([\s\S]+?)\n---\n\n?([\s\S]*)$/);
  if (!m) throw new Error(`docs/cards/${file}: missing frontmatter`);
  const fm = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(': ');
    if (idx === -1) continue;
    fm[line.slice(0, idx)] = line.slice(idx + 2);
  }
  return { fm, body: m[2] };
}

function anchor(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s/-]/g, '').trim().replace(/\s*\/\s*/g, '--').replace(/\s+/g, '-');
}

// --- load every card doc ---
const cardFiles = readdirSync('docs/cards').filter((f) => f.endsWith('.md'));
const cards = cardFiles.map((f) => {
  const { fm, body } = parseFrontmatter(readFileSync(`docs/cards/${f}`, 'utf8'), f);
  return { ...fm, file: f, body };
});

// --- the card count is only honest if the docs and the source agree ---
// Everything downstream — the count in the README, the one in package.json,
// the category tables — is derived from the files in docs/cards. That makes
// the number reproducible, not correct: a card added to src/ with no doc
// written for it would keep the count at whatever it was and CI would pass.
// So the set of documented types is compared against the set the bundle
// actually registers, by name rather than by count, since a card added in the
// same run as one removed would otherwise cancel out.
const registeredTypes = new Set();
for (const f of readdirSync('src').filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(`src/${f}`, 'utf8');
  const at = src.indexOf('customCards.push(');
  if (at === -1) continue;
  const m = src.slice(at).match(/type:\s*["']([^"']+)["']/);
  if (m) registeredTypes.add(m[1]);
}
const documentedTypes = new Set(cards.flatMap((c) => [c.type, c.also_type].filter(Boolean)));
const undocumented = [...registeredTypes].filter((t) => !documentedTypes.has(t)).sort();
const unregistered = [...documentedTypes].filter((t) => !registeredTypes.has(t)).sort();
if (undocumented.length || unregistered.length) {
  const lines = ['docs/cards is out of step with the cards src/ registers:'];
  if (undocumented.length) {
    lines.push(`  registered but undocumented: ${undocumented.join(', ')}`);
    lines.push('    -> write docs/cards/<name>.md for it (copy an existing one for the frontmatter)');
  }
  if (unregistered.length) {
    lines.push(`  documented but not registered: ${unregistered.join(', ')}`);
    lines.push('    -> the card was renamed or removed; fix the doc\'s `type:` or delete it');
  }
  throw new Error(lines.join('\n'));
}

// --- section order: each card doc carries its own `section_order`
// (position of its `## Title` heading in the README), independent of
// src/index.ts export order — which upstream does not keep in sync with
// the README's hand-curated section order.
const orderedCards = [...cards].sort((a, b) => Number(a.section_order) - Number(b.section_order));
const cardCount = cards.length + cards.filter((c) => c.also_type).length;

// --- category tables (row order follows each card's own `table_order`) ---
const categoryTables = CATEGORY_ORDER.map((key) => ({ key, heading: CATEGORY_HEADINGS[key], entries: [] }));
const tableByKey = new Map(categoryTables.map((t) => [t.key, t]));
for (const card of cards) {
  if (!tableByKey.has(card.category)) {
    throw new Error(
      `docs/cards/${card.file}: unknown category "${card.category}" — expected one of ${CATEGORY_ORDER.join(', ')}`,
    );
  }
  tableByKey.get(card.category).entries.push({
    order: Number(card.table_order),
    row: `| [${card.display}](#${anchor(card.title)}) | \`${card.type}\` | ${card.summary} |`,
  });
  if (card.also_type) {
    tableByKey.get(card.category).entries.push({
      order: Number(card.also_table_order),
      row: `| [${card.also_display}](#${anchor(card.title)}) | \`${card.also_type}\` | ${card.also_summary} |`,
    });
  }
}
for (const table of categoryTables) {
  table.entries.sort((a, b) => a.order - b.order);
  table.rows = table.entries.map((e) => e.row);
}

const categoryTablesMd = categoryTables
  .filter((t) => t.rows.length > 0)
  .map((t) => `### ${t.heading}\n\n${TABLE_HEADER}\n| --- | --- | --- |\n${t.rows.join('\n')}`)
  .join('\n\n');

// --- card sections, in section_order, de-duplicating combined entries ---
const seenSlugs = new Set();
const sectionsMd = orderedCards
  .filter((card) => {
    if (seenSlugs.has(card.title)) return false;
    seenSlugs.add(card.title);
    return true;
  })
  .map((card) => `## ${card.title}\n\n${card.body}`)
  .join('\n')
  .trimEnd();

// --- assemble ---
// Note: replacement must be a function, not a string — a literal "$`"/"$&"/
// "$'" inside a card doc's body (e.g. a regex example ending in `$`, right
// before a closing backtick) is otherwise interpreted by String.replace as
// a special substitution pattern instead of literal text.
let readme = readFileSync('docs/README.template.md', 'utf8');
readme = readme.replace('{{CARD_COUNT}}', () => String(cardCount));
readme = readme.replace('{{CATEGORY_TABLES}}', () => categoryTablesMd);
readme = readme.replace('{{CARD_SECTIONS}}', () => sectionsMd);

writeFileSync('README.md', readme);
console.log(`README.md generated (${cardCount} cards).`);

// --- keep package.json's card count in sync ---
const pkgRaw = readFileSync('package.json', 'utf8');
const pkgPatched = pkgRaw.replace(/(\d+) cards across/, `${cardCount} cards across`);
if (pkgPatched !== pkgRaw) writeFileSync('package.json', pkgPatched);
