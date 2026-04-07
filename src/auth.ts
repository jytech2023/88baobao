import NextAuth from "next-auth";
import Auth0 from "next-auth/providers/auth0";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/zh/sign-in" },
  providers: [
    Auth0({
      clientId: process.env.AUTH_AUTH0_ID,
      clientSecret: process.env.AUTH_AUTH0_SECRET,
      issuer: process.env.AUTH_AUTH0_ISSUER,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) {
        (session.user as { id?: string }).id = token.uid as string;
      }
      return session;
    },
  },
});
