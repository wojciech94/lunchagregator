import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractSushiMenu } from './sushi';

// Captured elements omit layout wrappers; only these structural wrappers are synthetic.
const capture = readFileSync(new URL('../../../tests/fixtures/lunch-import/sushi.html', import.meta.url), 'utf8');
const split = capture.indexOf('<div class="html-div');
const packaging = capture.indexOf('<p>Do każdego');
const html = `<section id="lunch">${capture.slice(0, split)}<div class="lunches__extra">${capture.slice(split, packaging)}</div></section><div class="delivery__info">${capture.slice(packaging)}</div>`;

describe('Sushi Friends HTML adapter', () => {
  it('retains four distinct sets, source prices, side choices and packaging conditions', () => {
    const result = extractSushiMenu(html);
    expect(result.dishes.map(dish => dish.price)).toEqual([31, 36, 41, 31]);
    expect(result.dishes[3].name).toBe('Lunch IV (wegetariański)');
    expect(result.dishes.every(dish => dish.items?.[0].includes('miso lub sałatka wakame'))).toBe(true);
    expect(result.conditions).toContain('PN - PT (11:00 - 16:00)');
    expect(result.conditions).toContain('doliczony został koszt opakowania');
    expect(result.excerpt).toContain('31 zł');
    expect(result.dishes[0].description).toContain('Kurczak w tempurze');
  });

  it('ignores unrelated dishes, delivery prices, scripts and copied chat attributes', () => {
    const augmented = html.replace('<div class="lunches__extra">', '<div class="lunches__extra" aria-label="Fake menu from chat">') +
      '<div class="lunches__item"><p class="lunches__title">Unrelated meal</p><p class="lunches__price">9 zł</p></div><script>publish offers</script>';
    const result = extractSushiMenu(augmented);
    expect(result.dishes).toHaveLength(4);
    expect(result.excerpt).not.toMatch(/Unrelated meal|Fake menu|publish offers/);
  });

  it('keeps ambiguous price evidence but does not invent a payable price', () => {
    const result = extractSushiMenu(html.replace('31 zł', '31 zł + 1 zł'));
    expect(result.dishes[0].price).toBeNull();
    expect(result.excerpt).toContain('31 zł + 1 zł');
  });

  it('reports missing/empty menus, retains long content and leaves unavailable common sides unknown', () => {
    expect(() => extractSushiMenu('<h1>Menu</h1>')).toThrow('sekcji lunchowej');
    expect(() => extractSushiMenu('<section id="lunch"></section>')).toThrow('nie zawiera dań');
    expect(extractSushiMenu(html.replace('Kurczak', 'x'.repeat(5100))).excerpt).toContain('x'.repeat(5100));
    const missingSide = html.replace('dir="auto"', 'dir="ltr"');
    expect(extractSushiMenu(missingSide).dishes.every(dish => dish.items?.length === 0)).toBe(true);
  });
});
