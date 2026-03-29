import NextAuth from "next-auth";
import { readFileSync } from "fs";
import { join } from "path";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { checkRateLimit } from "@/lib/rate-limit";

interface User {
  id: string;
  username: string;
  password: string;
  role: "admin" | "user";
}

const userSchema = z.object({
  username: z.string().min(1, "Le nom d'utilisateur est requis"),
  password: z.string().min(1, "Le mot de passe est requis"),
});

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  providers: [
    Credentials({
      async authorize(credentials, req) {
        try {
          if (!credentials) {
            return null;
          }

          const parsed = userSchema.safeParse(credentials);
          if (!parsed.success) {
            return null;
          }

          // Rate limiting par username
          const { allowed } = checkRateLimit(`auth:${parsed.data.username}`);
          if (!allowed) {
            return null;
          }

          const users = JSON.parse(
            readFileSync(join(process.cwd(), "data/users.json"), "utf-8")
          ) as User[];

          const user = users.find((u) => u.username === parsed.data.username);
          if (!user) {
            // Message générique pour éviter l'énumération de comptes
            return null;
          }

          const passwordMatch = await bcrypt.compare(
            parsed.data.password,
            user.password
          );

          if (!passwordMatch) {
            return null;
          }

          return {
            id: user.id,
            name: user.username,
            username: user.username,
            email: null,
            role: user.role,
          };
        } catch (error) {
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
