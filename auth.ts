import NextAuth from "next-auth";
import { readFileSync } from "fs";
import { join } from "path";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";

interface User {
  id: string;
  username: string;
  password: string;
  role: "admin" | "user";
}

const userSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  providers: [
    Credentials({
      async authorize(credentials) {
        try {
          const users = JSON.parse(
            readFileSync(join(process.cwd(), "data/users.json"), "utf-8")
          ) as User[];

          const parsed = userSchema.parse(credentials);
          const user = users.find((u) => u.username === parsed.username);

          if (!user) return null;

          // Vérification du mot de passe avec bcrypt
          const passwordMatch = await bcrypt.compare(
            parsed.password,
            user.password
          );

          if (passwordMatch) {
            return {
              id: user.id,
              name: user.username,
              username: user.username,
              email: null,
              role: user.role,
            };
          }
          return null;
        } catch {
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "user";
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  trustHost: true,
});
