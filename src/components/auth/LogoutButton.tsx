import { logoutAction } from "@/actions/auth";

/**
 * Server Component that renders a logout form.
 * Uses logoutAction as a Server Action form handler.
 * The form pattern is used so the action works without JavaScript.
 */
export function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await logoutAction();
      }}
    >
      <button
        type="submit"
        className="rounded-[4px] px-3 py-2 text-sm font-medium text-[#62666d] hover:text-primary transition-colors min-h-[44px] flex items-center"
      >
        Wyloguj się
      </button>
    </form>
  );
}
