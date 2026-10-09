'use server';

import { getUser } from '@/lib/auth';
import { canModify, isAdmin } from '@/lib/ownership';
import { createClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit';
import { menuExceptionSchema, menuToday, menuDates, publishMenuSchema, type MenuException, type PublishMenu } from '@/lib/recurring-menu';
import { z } from 'zod';
import type { ActionResult } from '@/services/offers';
import { revalidatePath } from 'next/cache';

async function mutateMenu(restaurantId: string, operation: (client: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: { message: string } | null }>): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(restaurantId).success) return { success: false, error: 'Nieprawidłowa restauracja.' };
  const user = await getUser();
  if (!user) return { success: false, error: 'Zaloguj się, aby zarządzać menu.' };
  const client = await createClient();
  const { data: restaurant, error: readError } = await client.from('restaurants').select('id,user_id').eq('id', restaurantId).single();
  if (readError || !restaurant || !canModify(user, restaurant.user_id)) return { success: false, error: 'Brak uprawnień do menu tej restauracji.' };
  async function snapshot() {
    const [schedule, revisions, exceptions] = await Promise.all([
      client.from('menu_schedules').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
      client.from('menu_revisions').select('*').eq('restaurant_id', restaurantId),
      client.from('menu_exceptions').select('*').eq('restaurant_id', restaurantId),
    ]);
    return { schedule: schedule.data, revisions: revisions.data, exceptions: exceptions.data };
  }
  const before = isAdmin(user) ? await snapshot() : null;
  const { error } = await operation(client);
  if (error) { console.error('[recurring-menu] mutation failed:', error.message); return { success: false, error: 'Nie udało się zapisać menu. Dane zostały zachowane — spróbuj ponownie.' }; }
  if (isAdmin(user)) {
    const after = await snapshot();
    await recordAudit(client, user.id, { action: 'update', tableName: 'restaurants', recordId: restaurantId, before, after });
  }
  for (const path of ['/', '/my-menus', '/my-offers', `/restaurants/${restaurantId}`]) revalidatePath(path);
  return { success: true, data: null };
}

export async function publishMenuAction(input: PublishMenu): Promise<ActionResult<null>> {
  const parsed = publishMenuSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  if (parsed.data.effectiveFrom < menuToday() || parsed.data.effectiveFrom > menuDates(menuToday()).at(-1)!) return { success: false, error: 'Wybierz datę od dziś do 29 dni w przyszłość.' };
  return mutateMenu(parsed.data.restaurantId, client => client.rpc('publish_recurring_menu', {
    rid: parsed.data.restaurantId, effective: parsed.data.effectiveFrom, menu: parsed.data.content, replace_ids: parsed.data.replaceOfferIds,
  }));
}
export async function setMenuExceptionAction(restaurantId: string, input: MenuException): Promise<ActionResult<null>> {
  const parsed = menuExceptionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  if (parsed.data.date < menuToday() || parsed.data.date > menuDates(menuToday()).at(-1)!) return { success: false, error: 'Wybierz datę od dziś do 29 dni w przyszłość.' };
  return mutateMenu(restaurantId, client => client.rpc('change_recurring_menu', { rid: restaurantId, command: 'exception', payload: parsed.data }));
}
export async function setMenuActiveAction(restaurantId: string, active: boolean): Promise<ActionResult<null>> {
  if (typeof active !== 'boolean') return { success: false, error: 'Nieprawidłowy status menu.' };
  return mutateMenu(restaurantId, client => client.rpc('change_recurring_menu', { rid: restaurantId, command: active ? 'resume' : 'stop' }));
}
