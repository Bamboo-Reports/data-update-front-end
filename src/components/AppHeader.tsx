import Link from "next/link";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AppUser } from "@/lib/session";
import RegisterSwitcher from "./RegisterSwitcher";
import ThemeSwitcher from "./ThemeSwitcher";

export default function AppHeader({
  user,
  sheets,
  active,
}: {
  user: AppUser;
  sheets: Array<{ id: string; label: string }>;
  active: string;
}) {
  const isDev = user.email === "dev@localhost";

  return (
    <header className="border-border/80 bg-background/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto grid min-h-14 max-w-5xl grid-cols-[1fr_auto] items-center gap-x-3 px-4 py-2 sm:flex sm:gap-5 sm:px-6">
        <Link
          href="/"
          className="focus-visible:ring-ring flex min-h-10 min-w-0 items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <span
            aria-hidden="true"
            className="bg-primary block size-2 rounded-full"
          />
          <span className="text-foreground truncate text-sm font-semibold tracking-tight">
            Bamboo Reports Updater
          </span>
        </Link>

        <RegisterSwitcher sheets={sheets} active={active} />

        <div className="col-start-2 row-start-1 flex items-center gap-1 sm:ml-auto sm:gap-2">
          {isDev && (
            <Badge
              variant="outline"
              className="border-warn/50 text-warn bg-transparent text-[0.7rem] font-normal"
            >
              Auth bypassed
            </Badge>
          )}
          <span className="text-muted-foreground hidden max-w-48 truncate text-xs md:inline">
            {user.email}
          </span>
          <ThemeSwitcher />
          {!isDev && (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-muted-foreground min-h-10 px-2 text-xs"
              >
                Sign out
              </Button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
