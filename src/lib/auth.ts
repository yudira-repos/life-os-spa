import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { db } from "@/lib/db";

// JWT sessions on purpose — no NextAuth Account/Session/VerificationToken
// tables. We only need "who is this Google user," which the User row
// already captures. One less thing to run migrations for.
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== "google" || !user.email) {
        return false;
      }
      const googleId = account.providerAccountId;

      await db.user.upsert({
        where: { googleId },
        update: {
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        },
        create: {
          googleId,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        },
      });

      return true;
    },
    async jwt({ token, account }) {
      // On initial sign-in, account.providerAccountId is the Google ID —
      // look up our internal User row once and cache its id on the token.
      if (account?.provider === "google") {
        const dbUser = await db.user.findUnique({
          where: { googleId: account.providerAccountId },
        });
        if (dbUser) {
          token.userId = dbUser.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
  },
};
