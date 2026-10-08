import { load } from 'cheerio';
import type { LunchImportPreview } from '@/lib/lunch-import/types';
import { readSourcePrice } from './source-price';

/** Read only the lunch category. No scripts, links or unrelated à-la-carte items. */
export function extractSofaMenu(html: string) {
  const $ = load(html);
  $('script, style, noscript').remove();
  $('br').replaceWith('\n');
  const section = $('#menu-zestawy-lunch-owe');
  if (section.length !== 1) throw new Error('Nie znaleziono sekcji lunchowej Sofa.');
  const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
  const conditions = clean(section.find('.m-list__description').text());
  const dishes: LunchImportPreview['dishes'] = [];
  const items = section.find('.m-list__item').toArray().map(item => {
    const row = $(item);
    const titles = row.find('.m-item__title');
    const prices = row.find('button.add-button');
    const priceText = clean(prices.text());
    const description = clean(row.find('.m-item__description').text());
    dishes.push({
      name: titles.length === 1 ? clean(titles.text()) || null : null,
      price: readSourcePrice(priceText, prices.length),
      description,
    });
    return [
      clean(row.find('.m-item__title').text()),
      clean(row.find('.m-item__description').text()),
      clean(row.find('button.add-button').text()),
    ].filter(Boolean).join('\n');
  });
  if (items.length === 0) throw new Error('Sekcja lunchowa Sofa nie zawiera dań.');
  const excerpt = ["Zestawy Lunch'owe", conditions, ...items].filter(Boolean).join('\n\n');
  return { excerpt, conditions, dishes };
}
