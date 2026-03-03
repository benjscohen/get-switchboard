import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [
    Google({
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
