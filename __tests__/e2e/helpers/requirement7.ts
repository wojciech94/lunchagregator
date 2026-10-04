import type { Page } from '@playwright/test';

/**
 * Measurement helpers for Requirement 7.
 *
 * These exist because the obvious probe for 7.1 is vacuous in this app.
 * `src/app/globals.css` sets `overflow-x-hidden` on html and body, so
 * `documentElement.scrollWidth > documentElement.clientWidth` can never be
 * true -- content that overflows is clipped, not scrollable. A test written
 * against that comparison would pass on any layout, however broken, and the
 * day-selector strip is exactly such a case today.
 *
 * So overflow is measured per element instead: anything whose box extends past
 * the viewport, unless it sits inside a deliberately scrollable ancestor.
 */

export interface OverflowFinding {
  selector: string;
  right: number;
  viewportWidth: number;
  overflowPx: number;
}

export interface TapTargetFinding {
  selector: string;
  width: number;
  height: number;
  text: string;
}

export interface SpacingFinding {
  selector: string;
  nextSelector: string;
  gapPx: number;
}

export interface FontFinding {
  selector: string;
  fontSizePx: number;
  text: string;
}

const INTERACTIVE_SELECTOR =
  'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';

/** Elements with a direct text node, i.e. text that is actually rendered here. */
const TEXT_BEARING_SELECTOR = '*';

export function describeElement(el: Element): string {
  const id = el.getAttribute('id');
  if (id) return `#${id}`;

  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid="${testId}"]`;

  const tag = el.tagName.toLowerCase();
  const name = el.getAttribute('name');
  if (name) return `${tag}[name="${name}"]`;

  const type = el.getAttribute('type');
  if (type && tag === 'input') return `input[type="${type}"]`;

  const cls = el.getAttribute('class');
  if (cls) {
    // Long Tailwind strings are unreadable; the first utility is usually enough.
    const first = cls.trim().split(/\s+/).slice(0, 2).join('.');
    return `${tag}.${first}`;
  }
  return tag;
}

export function shortText(el: Element, max = 24): string {
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * True when the element sits inside an ancestor that scrolls horizontally on
 * purpose. The day-selector strip is such a region: its overflow is a design
 * choice, and the finding that matters there is that four of seven controls are
 * unreachable, not that the page scrolls.
 */
function insideIntentionalScroller(el: Element): boolean {
  let node: Element | null = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowX)) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export async function measureHorizontalOverflow(page: Page): Promise<OverflowFinding[]> {
  return page.evaluate((selector) => {
    const viewportWidth = document.documentElement.clientWidth;
    const findings: {
      selector: string;
      right: number;
      viewportWidth: number;
      overflowPx: number;
    }[] = [];

    const describe = (el: Element): string => {
      const id = el.getAttribute('id');
      if (id) return `#${id}`;
      const testId = el.getAttribute('data-testid');
      if (testId) return `[data-testid="${testId}"]`;
      const tag = el.tagName.toLowerCase();
      const cls = el.getAttribute('class');
      if (cls) return `${tag}.${cls.trim().split(/\s+/).slice(0, 2).join('.')}`;
      return tag;
    };

    const inScroller = (el: Element): boolean => {
      let node: Element | null = el.parentElement;
      while (node && node !== document.body) {
        if (/(auto|scroll)/.test(getComputedStyle(node).overflowX)) return true;
        node = node.parentElement;
      }
      return false;
    };

    for (const el of Array.from(document.querySelectorAll(selector))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (inScroller(el)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      // 1px of tolerance: subpixel rounding at fractional widths is not a
      // layout failure, and without it the test flakes on some widths.
      const overflowPx = Math.round(rect.right - viewportWidth);
      if (overflowPx > 1) {
        findings.push({
          selector: describe(el),
          right: Math.round(rect.right),
          viewportWidth,
          overflowPx,
        });
      }
    }
    return findings;
  }, 'body *');
}

/**
 * Requirement 7.3: minimum target size at 768px and below.
 *
 * 24x24 is the WCAG 2.2 level AA threshold. Links rendered inline within a
 * sentence are exempt, per SC 2.5.8 — the parent being block-level (a `<p>`)
 * does not disqualify one; what matters is that it shares a paragraph with
 * other text, which is what makes it read as part of the sentence rather than
 * as a standalone control.
 */
export async function measureTapTargets(
  page: Page,
  minimum = 24
): Promise<TapTargetFinding[]> {
  return page.evaluate(
    ({ selector, minimum }) => {
      const findings: {
        selector: string;
        width: number;
        height: number;
        text: string;
      }[] = [];

      const describe = (el: Element): string => {
        const id = el.getAttribute('id');
        if (id) return `#${id}`;
        const testId = el.getAttribute('data-testid');
        if (testId) return `[data-testid="${testId}"]`;
        const tag = el.tagName.toLowerCase();
        const cls = el.getAttribute('class');
        if (cls) return `${tag}.${cls.trim().split(/\s+/).slice(0, 2).join('.')}`;
        return tag;
      };

      for (const el of Array.from(document.querySelectorAll(selector))) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        // A disabled control cannot be tapped, so its size is not a target.
        if (el.hasAttribute('disabled')) continue;
        if (el.closest('[aria-hidden="true"]')) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        const parentText = el.parentElement
          ? Array.from(el.parentElement.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => (n.textContent ?? '').trim())
              .join('')
              .trim()
          : '';
        const inlineInSentence =
          el.tagName === 'A' &&
          ['inline', 'contents'].includes(style.display) &&
          parentText.length > 0;
        if (inlineInSentence) continue;

        if (rect.height < minimum || rect.width < minimum) {
          findings.push({
            selector: describe(el),
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
            text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24),
          });
        }
      }
      return findings;
    },
    { selector: INTERACTIVE_SELECTOR, minimum }
  );
}

/**
 * Vertical gaps between interactive elements that follow each other in the DOM.
 *
 * Only elements that overlap horizontally can touch, otherwise two buttons in
 * different columns are not adjacent targets for a thumb.
 */
export async function measureTargetSpacing(
  page: Page,
  minimum = 8
): Promise<SpacingFinding[]> {
  return page.evaluate(
    ({ selector, minimum }) => {
      const findings: { selector: string; nextSelector: string; gapPx: number }[] = [];

      const describe = (el: Element): string => {
        const id = el.getAttribute('id');
        if (id) return `#${id}`;
        const tag = el.tagName.toLowerCase();
        const cls = el.getAttribute('class');
        if (cls) return `${tag}.${cls.trim().split(/\s+/).slice(0, 2).join('.')}`;
        return tag;
      };

      const visible = Array.from(document.querySelectorAll(selector)).filter((el) => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      for (let i = 0; i < visible.length - 1; i++) {
        const a = visible[i];
        const b = visible[i + 1];
        if (!a || !b || a.contains(b) || b.contains(a)) continue;

        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();

        const overlapsHorizontally = ra.left < rb.right && rb.left < ra.right;
        if (!overlapsHorizontally) continue;

        // Order by vertical centre, then measure the real edge-to-edge distance.
        // Taking min() of both directions reports a large negative number for
        // every stacked pair, which reads as a catastrophic violation.
        const aFirst = ra.top + ra.height / 2 <= rb.top + rb.height / 2;
        const gapPx = Math.round((aFirst ? rb.top - ra.bottom : ra.top - rb.bottom) * 10) / 10;
        if (gapPx < minimum) {
          findings.push({
            selector: describe(a),
            nextSelector: describe(b),
            gapPx,
          });
        }
      }
      return findings;
    },
    { selector: INTERACTIVE_SELECTOR, minimum }
  );
}

/**
 * Rendered text below the minimum size.
 *
 * Only elements holding a direct text node count: an element with no text of
 * its own inherits a font size that affects nothing.
 *
 * Elements carrying an explicit font-size utility are exempt, by Requirement
 * 7.4: `text-sm` and `text-xs` are a design decision. What the requirement
 * does not exempt -- required-field markers, form labels, control labels -- is
 * reached by removing the utility from those, not by widening this probe.
 */
export async function measureFontSizes(
  page: Page,
  minimum = 16
): Promise<FontFinding[]> {
  return page.evaluate(
    ({ minimum }) => {
      const findings: { selector: string; fontSizePx: number; text: string }[] = [];

      const describe = (el: Element): string => {
        const id = el.getAttribute('id');
        if (id) return `#${id}`;
        const tag = el.tagName.toLowerCase();
        const cls = el.getAttribute('class');
        if (cls) return `${tag}.${cls.trim().split(/\s+/).slice(0, 2).join('.')}`;
        return tag;
      };

      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const ownText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => (n.textContent ?? '').trim())
          .join(' ')
          .trim();
        if (!ownText) continue;

        const size = parseFloat(style.fontSize);
        if (Number.isNaN(size) || size >= minimum) continue;

        const cls = el.getAttribute('class') ?? '';
        if (/[\s"']text-(xs|sm|base|lg|xl|\[)/.test(cls)) continue;

        findings.push({
          selector: describe(el),
          fontSizePx: Math.round(size * 10) / 10,
          text: ownText.replace(/\s+/g, ' ').slice(0, 24),
        });
      }
      return findings;
    },
    { minimum }
  );
}

/** Collapses findings to a stable, comparable shape for baselining. */
export function normalise<T extends { selector: string }>(findings: T[]): string[] {
  return Array.from(new Set(findings.map((f) => f.selector))).sort();
}