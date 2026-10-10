import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";

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
      <Button
        type="submit"
        variant="link"
        size="sm"
        className="min-h-[44px]"
      >
        Wyloguj się
      </Button>
    </form>
  );
}
