import { auth, isAdmin, isAllowedEmail } from "@/auth";

export interface AppUser {
  email: string;
  name: string;
  admin: boolean;
}

/** Only honoured outside production, so a stray env var cannot open up a deploy. */
function devBypassUser(): AppUser | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.DEV_AUTH_BYPASS !== "1") return null;
  return { email: "dev@localhost", name: "Local Dev", admin: true };
}

export async function currentUser(): Promise<AppUser | null> {
  const bypass = devBypassUser();
  if (bypass) return bypass;

  const session = await auth();
  const email = session?.user?.email;
  if (!isAllowedEmail(email)) return null;

  return {
    email: email as string,
    name: session?.user?.name ?? (email as string),
    admin: isAdmin(email),
  };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("You must be signed in to do this.");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireUser(): Promise<AppUser> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (!user.admin) throw new ForbiddenError("Only admins can archive records.");
  return user;
}
