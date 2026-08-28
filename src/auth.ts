import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

function allowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const domains = allowedDomains();
  // An empty allow-list means "no one", not "everyone". Failing closed here is
  // the difference between a locked door and an open one.
  if (!domains.length) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && domains.includes(domain);
}

export function isAdmin(email: string | null | undefined): boolean {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  // No admin list configured means every signed-in user may archive.
  if (!admins.length) return true;
  return !!email && admins.includes(email.toLowerCase());
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
          hd: allowedDomains()[0],
        },
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    signIn({ profile }) {
      // The `hd` parameter above is only a UI hint; Google does not enforce it.
      // This check is the one that actually keeps other domains out.
      return isAllowedEmail(profile?.email);
    },
    jwt({ token, profile }) {
      if (profile?.email) token.email = profile.email;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.email) session.user.email = token.email;
      return session;
    },
  },
});
