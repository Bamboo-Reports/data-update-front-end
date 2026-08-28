import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { currentUser } from "@/lib/session";
import SignInButton from "@/components/SignInButton";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  AccessDenied: "That account cannot be used here. Sign in with your work Google account.",
  Configuration:
    "Sign-in is not set up yet. An admin needs to add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect("/");

  const { error, callbackUrl } = await searchParams;
  const domains = process.env.ALLOWED_EMAIL_DOMAINS ?? "";
  const message = error
    ? (ERROR_COPY[error] ?? "Sign-in did not complete. Try again.")
    : null;

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <div className="border-border bg-card w-full max-w-sm rounded-xl border p-6 shadow-sm sm:p-8">
        <div className="mb-8 flex items-center gap-2">
          <span aria-hidden="true" className="bg-primary block size-2 rounded-full" />
          <span className="text-ink text-sm font-semibold tracking-tight">
            Bamboo Reports Updater
          </span>
        </div>

        <h1 className="text-ink text-2xl font-semibold tracking-tight">
          Sign in to update records
        </h1>
        <p className="text-muted-foreground mt-2 text-sm text-pretty">
          Search and maintain accounts, centers and services without opening the
          master sheet.
        </p>

        {message && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <form
          className="mt-7"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl ?? "/" });
          }}
        >
          <SignInButton />
        </form>

        {domains && (
          <p className="text-faint mt-5 text-xs">
            Allowed accounts: {" "}
            {domains
              .split(",")
              .map((d) => `@${d.trim()}`)
              .join(", ")}{" "}
            accounts
          </p>
        )}
      </div>
    </main>
  );
}
