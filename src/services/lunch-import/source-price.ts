/** One literal PLN price. Qualifications, multiple prices and other currencies need review. */
export function readSourcePrice(text: string, count: number): number | null {
  if (count !== 1 || !/^\d+(?: \d{3})*(?:,\d{2})?\s*(?:zł|PLN)$/.test(text)) return null;
  const amount = Number(text.replace(/(?:zł|PLN)|\s/g, '').replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}
