import { z } from 'zod';

/** Import, offer listing and PostgreSQL use the same UTC calendar boundary. */
export const importAvailableDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const today = new Date().toISOString().slice(0, 10);
  const max = new Date(`${today}T00:00:00Z`); max.setUTCDate(max.getUTCDate() + 30);
  return value >= today && date <= max;
}, 'Wybierz prawidłową datę od dziś do 30 dni w przyszłość.');
