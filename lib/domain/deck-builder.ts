import { collectionRows, defaultSort, filterRows, emptyFilters, orderRows, type CollectionRow, type DeckLine, type Snapshot } from './workspace';

export const sections = [
  { id: 'legend', label: 'Legend' }, { id: 'champion', label: 'Chosen Champion' },
  { id: 'battlefields', label: 'Battlefields' }, { id: 'runes', label: 'Runes' },
  { id: 'main', label: 'Main Deck' },
] as const;
export type Category = 'all' | 'legend' | 'champion' | 'battlefields' | 'runes' | 'main';
export const categories: { id: Category; label: string }[] = [{ id: 'all', label: 'All' }, ...sections];
export function categoryOf(type: string | null): Exclude<Category, 'all'> | null {
  // These are catalog labels for routing, not official format restrictions.
  const label = type?.trim().toLowerCase();
  if (label === 'legend') return 'legend';
  if (label === 'champion' || label === 'champion unit') return 'champion';
  if (label === 'battlefield') return 'battlefields';
  if (label === 'rune') return 'runes';
  if (label === 'unit' || label === 'spell' || label === 'gear') return 'main';
  return null;
}
export function accepts(type: string | null, section: string): boolean {
  const category = categoryOf(type);
  if (section === 'sideboard' || section === 'bench') return category === 'main' || category === 'champion';
  return category === section || (section === 'main' && category === 'champion');
}
export function costOf(s: Snapshot, cardId: string): number | null {
  const value = s.cards.find(c => c.id === cardId)?.attributes?.cost;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
export type LibraryFilters = { query:string; set:string; domain:string; rarity:string; type:string; cost:string; category:Category; owned:boolean; available:boolean };
export const initialLibraryFilters: LibraryFilters = { query:'', set:'', domain:'', rarity:'', type:'', cost:'', category:'all', owned:false, available:false };
export function libraryRows(s: Snapshot, f: LibraryFilters): CollectionRow[] {
  return orderRows(filterRows(collectionRows(s), { ...emptyFilters, query:f.query, set:f.set, domain:f.domain, rarity:f.rarity, type:f.type }, s), defaultSort)
    .filter(r => (f.category === 'all' || (f.category === 'main' ? accepts(r.card_type, 'main') : categoryOf(r.card_type) === f.category)) &&
      (!f.owned || r.owned > 0) && (!f.available || r.available > 0) &&
      (!f.cost || (f.cost === 'unknown' ? costOf(s,r.card_id) === null : costOf(s,r.card_id) === Number(f.cost))));
}
export function addPayload(s: Snapshot, deckId: string, printingId: string, section: string): Record<string,unknown> {
  const printing = s.printings.find(p => p.id === printingId && p.eligible);
  if (!printing || !accepts(printing.card_type, section)) throw new Error('This card category cannot be added to that section.');
  const line = s.lines.find(l => l.deck_id === deckId && l.card_id === printing.card_id && l.section === section);
  if (line && line.preferred_printing_id !== printingId) throw new Error('This line has a different or unresolved printing. Use its printing controls before adding this edition.');
  if ((line?.quantity ?? 0) >= 2147483647) throw new Error('Quantity is at the supported maximum.');
  return { deck_id:deckId, card_id:printing.card_id, section, quantity:(line?.quantity ?? 0)+1, printing_id:printingId };
}
export function orderedLines(lines: DeckLine[], s:Snapshot, sort:string): DeckLine[] {
  return [...lines].sort((a,b) => {
    const name = (l:DeckLine) => s.cards.find(c => c.id === l.card_id)?.name ?? '';
    if (sort === 'name') return name(a).localeCompare(name(b)) || a.id.localeCompare(b.id);
    if (sort === 'cost') return (costOf(s,a.card_id) ?? Infinity)-(costOf(s,b.card_id) ?? Infinity) || name(a).localeCompare(name(b));
    return (a.display_order ?? 0)-(b.display_order ?? 0) || a.id.localeCompare(b.id);
  });
}
