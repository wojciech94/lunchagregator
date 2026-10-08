# Issue #94: first-party HTML source assessment

Assessment date: 2026-10-07. This is source reconnaissance for stage 0, not a claim that offers have been imported or published. Prices are observations from retrieved pages, not restaurant confirmations.

## Recommended initial sources

Use **Sofa, Browar PROST's dedicated lunch page, and Sushi Friends**. They give three different useful cases: undated changing lunch sets, an explicitly dated weekly menu with price supplements and difficult document ordering, and undated recurring named lunch sets. Kameralna is a reserve candidate because its order-menu prices describe packaging-inclusive dishes while its dine-in lunch offer is a separate image-led product.

Do not treat retrieval time, search indexing time, a copyright year, or a generic weekday schedule as the validity date of a dish. All date-less candidates require explicit operator confirmation before publication.

### 1. Sofa Lounge & Restaurant

- Menu URL: [official ordering menu](https://www.sofa.wroclaw.pl/restauracja/sofa-lounge-restaurant).
- Branch: **AL. PADEREWSKIEGO 35, 51-612 WROCŁAW**, confirmed by the [official contact page](https://www.sofa.wroclaw.pl/kontakt).
- The lunch section is text in server-returned HTML. Observed set price is **40.31 PLN** for each of three sets, including the soup of the day. Lunch service is weekdays, excluding holidays, **12:00–17:00**, subject to stock. No explicit calendar date or date range accompanies this section. [Menu](https://www.sofa.wroclaw.pl/restauracja/sofa-lounge-restaurant).
- Current examples: set 1 combines potato pancakes with goulash **or** sour cream and soup; set 2 combines fish in tomato/cream sauce, vegetables and rice with soup; set 3 combines a choice of Kozacka **or** Classic pizza with soup. Preserve alternatives rather than inventing separately priced meals. The soup is unspecified; do not borrow the standalone soup category to fill it. [Menu](https://www.sofa.wroclaw.pl/restauracja/sofa-lounge-restaurant).
- Search-result content showed different dishes from a direct open and raw fetch. Capture the live response, preserve its time, and never use a search snippet as the acceptance baseline. This source is extractable, but observation alone does not establish today's availability.

### 2. Browar PROST

- Use [the dedicated lunch page](https://www.browarprost.pl/lunch-wroclaw), not `/menu`. Branch: **Paprotna 4, 51-117 Wrocław**.
- Its HTML exposes **05–09 October 2026** dates, daily soup/main descriptions, takeaway prices **16 / 30 PLN**, juice **18 PLN**, and **1.25 PLN packaging per dish**. Monday has vegetable soup and panko chicken; Tuesday has kwaśnica and pork in batter. [Dedicated lunch page](https://www.browarprost.pl/lunch-wroclaw).
- The flattened HTML orders later days as Wednesday, Friday, Thursday, followed by disconnected dish blocks. Do not assign every subsequent block to Thursday. Two soup descriptions are truncated. Preserve source wording and flag uncertainty; do not complete names with AI. The page states **12:00–15:00** and distinguishes takeaway promotion from dine-in pricing. [Dedicated lunch page](https://www.browarprost.pl/lunch-wroclaw).
- `/menu` presents the weekly menu as an image and says dine-in soup/main cost **15 / 29 PLN**. Those prices must not replace the takeaway prices above. [General menu](https://www.browarprost.pl/menu).
- The February 2025 blog article is historical promotion, not a current menu validity date. [Historical article](https://www.browarprost.pl/post/menu-lunchowe).

### 3. Sushi Friends Bar & Resto

- URL: [official home page](https://sushifriendswroclaw.pl/). The page identifies a single branch as **Marca Polo 9e, 51-504 Wrocław**. Preserve this literal source spelling in evidence; verify the application's canonical street spelling before linking a database restaurant.
- Named recurring lunches are HTML text: chicken tempura with rice (**31 PLN**); tuna sushi set (**36 PLN**); cooked-salmon/avocado sushi set (**41 PLN**); mushroom/kanpyo set labelled vegetarian (**31 PLN**). Each includes a choice of miso soup or wakame salad with sesame sauce. [Official page](https://sushifriendswroclaw.pl/).
- Service is **Monday–Friday 11:00–16:00**; no explicit menu date exists. The delivery section says the **1 PLN packaging cost has already been added** to each dish. Do not add it twice. Delivery fees and minimum basket value are separate conditions, not meal prices. [Official page](https://sushifriendswroclaw.pl/).
- Suitable for date-less extraction and explicit source-label preservation. A weekday schedule is not proof that unchanged dishes are still available on a particular date. The website's vegetarian label may be preserved as source evidence; it is not permission to infer other diets or allergens.

## Reserve and exclusion evidence

### Kameralna: reserve, service-channel distinction required

The [official ordering menu](https://www.kameralnarest.pl/restauracja/restauracja-kameralna) identifies **Zwycięska 14cb, 53-033 Wrocław** and exposes two lunch dishes at **39 PLN** with packaging explicitly included: dumplings with onion and sour cream, and chicken schnitzel with salad/fries. These are date-less, bilingual descriptions of single dishes; duplicate language text must not produce duplicate offers. Allergen statements are explicit source labels, not grounds to infer unrelated labels.

The [separate dine-in lunch page](https://www.kameralnarest.pl/informacje/oferta-lunchowa) says weekdays **13:00–16:00**, dine-in only, and describes two-course lunches while showing its specific offer as an image. Do not join a takeaway dish's price with the dine-in set description. Its [contact page](https://www.kameralnarest.pl/kontakt) confirms the branch independently. Keep this candidate in reserve until the selected service channel is represented explicitly.

### Milli: reject as a named-dish HTML positive

The [official ordering menu](https://www.milliwroclaw.pl/restauracja/restauracja-milli-wroclaw) identifies **Birmańska 13, 52-117 Wrocław**. Its lunch section contains generic soup/main order items at **14 / 36 PLN**, not actual dish names. The weekly lunch-specific visual is an image. Hours also conflict: promotional text says weekdays 13:00–17:00, category text says Monday from 14:00, and the generic item label says Tuesday–Friday. Use it as a no-named-menu/ambiguous-schedule negative. Never select unrelated à-la-carte dishes as the lunch of the day.

Pepik was also inspected through [its official HTML page](https://pepik.pl/): a 34 PLN soup-plus-main lunch claim sits near separately priced dishes, making price scope ambiguous. It adds less acceptance coverage than the three selected sources and is not selected.

### Existing restaurant records: no suitable lunch HTML found

The parent agent reported a read-only database check containing Ida, Doctor's Bar and Pizza Si, with none of the selected source branches present. Source-to-database mapping is therefore **unresolved** for all three selected candidates; their researched addresses are not fabricated restaurant IDs. No records were created.

- [Ida's official site](https://idakuchniaiwino.pl/) identifies Łazienna 4 and directs menu access to [a PDF](https://idakuchniaiwino.pl/assets/menu/menu.pdf). It is outside the HTML-only capture scope.
- [Doctor's Bar's operator-controlled Linktree](https://linktr.ee/doctorsbarwro) identifies Świętego Mikołaja 8 and directs its menu to [a Google Drive PDF](https://drive.google.com/file/d/1I9qvYx25iUqESNO2LpN08FSPEBg9FCH3/view?pli=1). The examined primary entry point does not provide named daily lunches as HTML.
- [Pizza Si's official HTML menu](https://pizza-si.pl/pizza-si-menu/) does provide named, priced pizzas and salads, but no lunch section, validity dates or special lunch terms. Its branch address is Bogusławskiego 89–91. Do not reclassify this general menu as daily lunch offers merely to reuse an existing database record.

## Access evidence and limitations

Direct Node `fetch` calls, without credentials, cookies, browser execution, or third-party restaurant aggregators, returned HTTP 200 and HTML for the following URLs. The byte counts describe responses observed during this assessment and are not stable expected sizes.

| URL | Response content type | Observed bytes | HTML evidence |
|---|---|---:|---|
| Sofa ordering menu above | `text/html; charset=utf-8` | 343,467 | Lunch section, set descriptions and prices |
| PROST `/lunch-wroclaw` | `text/html; charset=UTF-8` | 1,106,636 | Explicit dates, prices, packaging and daily dish text |
| Sushi Friends home page | `text/html; charset=UTF-8` | 64,153 | Four named lunch sets, schedule and address |
| Kameralna ordering menu above | `text/html; charset=utf-8` | 352,791 | Lunch category and packaging-inclusive prices |
| PROST `/menu` | `text/html; charset=UTF-8` | 1,036,101 | Image-led weekly menu and generic dine-in prices |

Visible text was cross-checked using direct web opens. The ordering sites display JavaScript-required notices, but the selected menu text is present in their initial HTML; interactive ordering is unnecessary for capture. PROST's large Wix response contains scripts and layout metadata, so future size limits must account for the observed roughly 1.1 MB body while extracted menu content remains small.

No OCR, PDF parsing, AI extraction, restaurant contact, database mutation, or publication was performed for this assessment. No independently retrieved stale dated *dish menu* or real missing-price lunch positive was found. The 2025 PROST article is historical promotional evidence, not a substitute for either case. Controlled stale-date and missing-price fixtures should be labelled synthetic mutations of a captured source, with production source provenance retained separately.

## Stage-0 acceptance implications

1. Bind each source to the exact reviewed branch; do not select the closest similarly named restaurant automatically.
2. Save immutable HTML/menu-text captures with retrieval time and URL before creating expected output. Compare future live responses separately.
3. PROST provides a real explicit-date test; its later-day layout requires structural verification or manual day confirmation before expected mappings are approved.
4. Sofa and Sushi Friends must yield no invented calendar date. Operator date confirmation remains a publication gate.
5. Test alternatives, packaging-inclusive and packaging-extra prices, and the difference between menu headings, daily dishes, standalone meals and sets.
6. Stage 0 is incomplete until actual Gemini extraction is compared with reviewed fixtures and ambiguous date/price outcomes are explicitly recorded. Source discovery itself does not validate the existing extraction module.
