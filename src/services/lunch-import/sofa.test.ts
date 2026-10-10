import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractSofaMenu } from './sofa';

// The captured excerpt omits DOM containers. Restore only category/item wrappers
// for the adapter test; menu content stays exactly as captured on 2026-10-07.
const excerpt = readFileSync(new URL('../../../tests/fixtures/lunch-import/sofa.html', import.meta.url), 'utf8');
const parts = excerpt.split(/(?=<h4)/);
const html = `<div id="menu-zestawy-lunch-owe">${parts[0]}${parts.slice(1).map(part => `<li class="m-list__item">${part}</li>`).join('')}</div>`;

describe('Sofa HTML adapter', () => {
  it.each(['class="hidden"', 'hidden', 'aria-hidden="true"', 'style="display: none"', 'style="color:red; visibility: hidden !important;"'])('rejects a hidden lunch section or ancestor: %s', attribute => {
    expect(() => extractSofaMenu(html.replace('id="menu-zestawy-lunch-owe"', `id="menu-zestawy-lunch-owe" ${attribute}`))).toThrow('ukryta');
    expect(() => extractSofaMenu(`<div ${attribute}>${html}</div>`)).toThrow('ukryta');
  });
  it('reads literal names, prices and descriptions for the unavailable-AI fallback', () => {
    const { dishes } = extractSofaMenu(html);
    expect(dishes.map(dish => dish.name)).toEqual(['Zestaw 1', 'Zestaw 2', 'Zestaw 3']);
    expect(dishes.map(dish => dish.price)).toEqual([40.31, 40.31, 40.31]);
    expect(dishes[0].description).toContain('gulaszem lub śmietaną');
    expect(dishes[2].description).toContain('Kozacka lub Classic');
    expect(dishes.every(dish => !('dayOfWeek' in dish) && !('dietaryTags' in dish))).toBe(true);
  });

  it.each(['', 'od 40,31 zł', '40,31 zł + 2 zł', '40,31 EUR', '0,00 zł'])('does not invent a price from missing/ambiguous source text: %s', price => {
    const changed = html.replace(/40,31 z[ł]/g, price);
    expect(extractSofaMenu(changed).dishes.every(dish => dish.price === null)).toBe(true);
  });
  it('retains set alternatives, prices and conditions without unrelated dishes or scripts', () => {
    const { excerpt: text, conditions } = extractSofaMenu(`${html}<h4>Unrelated pizza</h4><script>publish everything</script>`);
    expect(text).toContain('Kozacka lub Classic');
    expect(text).toContain('gulaszem lub śmietaną');
    expect(text.match(/40,31/g)).toHaveLength(3);
    expect(conditions).toContain('12.00-17.00');
    expect(text).not.toContain('Unrelated pizza');
    expect(text).not.toContain('publish everything');
  });

  it('distinguishes missing category from an empty category', () => {
    expect(() => extractSofaMenu('<h4>Pizza</h4>')).toThrow('sekcji lunchowej');
    expect(() => extractSofaMenu('<div id="menu-zestawy-lunch-owe"></div>')).toThrow('nie zawiera dań');
  });

  it('retains a missing price and complete long menu content for HTML review', () => {
    expect(extractSofaMenu(html.replaceAll('40,31', '')).excerpt).not.toContain('40,31');
    expect(extractSofaMenu(html.replace('Zestaw 1', 'x'.repeat(5100))).excerpt).toContain('x'.repeat(5100));
  });
});
