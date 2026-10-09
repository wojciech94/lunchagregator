import { load } from 'cheerio';
import type { LunchImportPreview } from '@/lib/lunch-import/types';
import { readSourcePrice } from './source-price';

/** Deliberately bounded: semantic lunch section + explicit item rows, no AI identities. */
export function extractGenericMenu(html: string) {
  const $ = load(html);
  $('script,style,noscript,template,svg,iframe,[hidden],[aria-hidden="true"]').remove();
  $('br').replaceWith('\n');
  const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
  const pageText = clean($('body').text());
  const addresses = new Set($('address').toArray().map(el => clean($(el).text())).filter(Boolean));
  const title = clean($('title').text());
  $('nav,footer').remove();
  const heading = $('h1,h2,h3').filter((_, el) => /\b(lunch|lunche|lunchowe|lunchowy)\b/i.test(clean($(el).text())));
  const sections = heading.map((_, el) => $(el).closest('section,article,main')[0]).toArray();
  const unique = [...new Set(sections)];
  const limitations: string[] = [];
  let excerpt = clean($('body').text()).slice(0, 12000);
  const dishes: LunchImportPreview['dishes'] = [];
  if (unique.length !== 1) limitations.push('Wymagana jedna sekcja HTML z nagłówkiem lunchowym. PDF, obrazy i strony wymagające JavaScript nie są obsługiwane.');
  else {
    const section = $(unique[0]);
    excerpt = clean(section.text());
    if (excerpt.length > 12000) limitations.push('Sekcja lunchowa przekracza limit 12 000 znaków.');
    else {
      const rows = section.find('li,tr,article,[data-menu-item]').filter((_, el) => !$(el).find('li,tr,article,[data-menu-item]').length);
      rows.each((_, el) => {
        const row = $(el);
        const name = clean(row.find('[data-name],h3,h4,th,strong').first().text());
        if (!name) return;
        const text = clean(row.text());
        const prices = text.match(/\d+(?:[ .,]\d{3})*(?:,\d{2})?\s*(?:zł|PLN)(?=\s|$|[.,;])/g) ?? [];
        const qualified = /\b(od|za\s*100|kg|dopłat\w*|doplata|opakowan\w*|dostaw\w*|delivery)\b/i.test(text);
        dishes.push({ name, price: qualified ? null : readSourcePrice(prices[0] ?? '', prices.length), description: text });
      });
      if (!dishes.length || dishes.length > 50) limitations.push('Nie znaleziono 1–50 jednoznacznych pozycji HTML z nazwami.');
      if (new Set(dishes.map(d => d.name?.toLocaleLowerCase('pl'))).size !== dishes.length) limitations.push('Nazwy pozycji powtarzają się; tożsamość importu jest niejednoznaczna.');
    }
  }
  // Generic date semantics are intentionally unsupported: never roll an old weekly menu forward.
  if (/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/.test(excerpt)) {
    limitations.push('Menu zawiera daty kalendarzowe. Ten odczyt ogólny nie interpretuje okresów ważności; potrzebny osobny adapter lub ręczne dodanie ofert.');
  }
  if (addresses.size > 1 || /\b(nasze restauracje|nasze lokale|wybierz lokal|our locations)\b/i.test(pageText)) {
    limitations.push('Strona wskazuje wiele oddziałów. Nie można aktywować bez jednoznacznego źródła dla jednego lokalu.');
  }
  return { excerpt: excerpt.slice(0, 12000), dishes: dishes.slice(0, 50),
    conditions: 'Data i aktualność niepotwierdzone. Sprawdź pełne źródło, ceny, warianty i kanał sprzedaży.',
    limitations, supported: limitations.length === 0,
    identityEvidence: (title + '\n' + [...addresses].join('\n')).slice(0, 4000) };
}
