import { load } from 'cheerio';
import type { LunchImportPreview } from '@/lib/lunch-import/types';
import { readSourcePrice } from './source-price';

export function extractSushiMenu(html: string) {
  const $ = load(html);
  $('script, style, noscript').remove();
  $('br').replaceWith('\n');
  const section = $('#lunch');
  if (section.length !== 1) throw new Error('Nie znaleziono sekcji lunchowej Sushi Friends.');
  const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
  const schedule = clean(section.find('.lunches__dates').text());
  // Read only visible sentence text, never copied chat attributes or other menus.
  const side = section.find('.lunches__extra [dir="auto"]').toArray()
    .map(element => clean($(element).text())).find(text => /^Do wszystkich lunchów\b/i.test(text)) ?? '';
  const packaging = $('.delivery__info p').toArray().map(element => clean($(element).text()))
    .find(text => /opakowania/i.test(text)) ?? '';
  const conditions = [schedule, side, packaging ? `Informacja z sekcji dostawy: ${packaging}` : 'Brak informacji o opakowaniu w sekcji dostawy.'].filter(Boolean).join('\n');
  const itemText: string[] = [];
  const dishes: LunchImportPreview['dishes'] = section.find('.lunches__item').toArray().map(item => {
    const row = $(item);
    const titles = row.find('.lunches__title');
    const prices = row.find('.lunches__price');
    itemText.push([clean(titles.text()), clean(row.find('.lunches__desc').text()),
      clean(prices.text()) || 'Cena niewskazana w źródle'].filter(Boolean).join('\n'));
    return {
      name: titles.length === 1 ? clean(titles.text()) || null : null,
      price: readSourcePrice(clean(prices.text()), prices.length),
      description: clean(row.find('.lunches__desc').text()),
      items: side ? [side] : [],
    };
  });
  if (!dishes.length) throw new Error('Sekcja lunchowa Sushi Friends nie zawiera dań.');
  const excerpt = ['Lunch', conditions, ...itemText].join('\n\n');
  if (excerpt.length > 5000) throw new Error('Menu jest zbyt długie do analizy.');
  return { excerpt, conditions, dishes };
}
