import type { Snapshot } from './workspace';
export type ImportedLine = { card_id:string; printing_id:string|null; section:string; quantity:number };
export function parseDeckText(text:string,s:Snapshot) {
  const errors:string[]=[]; const lines:ImportedLine[]=[];
  if(text.length>100000)return {lines,errors:['Text exceeds 100,000 characters.']};
  const seen=new Set<string>(); const cards=new Set(s.cards.map(c=>c.id));
  for(const [index,raw] of text.split(/\r?\n/).entries()) {
    if(!raw.trim()||raw.trim().startsWith('#'))continue;
    const parts=raw.split('\t'); const [amount,section,cardId,printingId]=parts;
    if(parts.length<3||parts.length>4||!/^\d+$/.test(amount)||Number(amount)<1||Number(amount)>2147483647||!section?.trim()||section.length>80||!cards.has(cardId)) {
      errors.push(`Line ${index+1}: expected quantity, section and known card UUID separated by tabs.`);continue;
    }
    if(printingId&&!s.printings.some(p=>p.id===printingId&&p.card_id===cardId&&p.eligible)) {errors.push(`Line ${index+1}: printing does not match an eligible edition of this card.`);continue;}
    const key=`${cardId}\t${section.trim()}`;
    if(seen.has(key)){errors.push(`Line ${index+1}: duplicate card/section; combine quantities first.`);continue;}
    seen.add(key);lines.push({card_id:cardId,printing_id:printingId||null,section:section.trim(),quantity:Number(amount)});
  }
  if(lines.length===0)errors.push('Add at least one valid line.');
  if(lines.length>500)errors.push('Imports support at most 500 lines.');
  return {lines,errors};
}
export function exportDeckText(s:Snapshot,deckId:string) {
  return ['# Riftbound Hub TSV v1: quantity<TAB>section<TAB>card UUID<TAB>optional printing UUID',
    ...s.lines.filter(l=>l.deck_id===deckId).map(l=>`${l.quantity}\t${l.section}\t${l.card_id}\t${l.preferred_printing_id??''}`)].join('\n');
}
