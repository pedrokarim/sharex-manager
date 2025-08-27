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
      async authorize(credentials) {
        console.log("🔍 Début du processus d'autorisation");
        console.log("📝 Credentials reçus:", credentials);

        try {
          if (!credentials) {
            console.log("❌ Aucun identifiant fourni");
            throw new Error("Aucun identifiant fourni");
          }

          console.log("🔎 Validation du schéma des credentials");
          const parsed = userSchema.safeParse(credentials);
          if (!parsed.success) {
            console.log("❌ Échec de la validation:", parsed.error);
            return null;
          }
          console.log("✅ Validation du schéma réussie");

          console.log("📂 Lecture du fichier users.json");
          const users = JSON.parse(
            readFileSync(join(process.cwd(), "data/users.json"), "utf-8")
          ) as User[];
          console.log("📋 Nombre d'utilisateurs trouvés:", users.length);

          console.log("🔍 Recherche de l'utilisateur:", parsed.data.username);
          const user = users.find((u) => u.username === parsed.data.username);
          if (!user) {
            throw new Error("UserNotFound");
          }
          console.log("✅ Utilisateur trouvé");

          console.log("🔐 Vérification du mot de passe");
          const passwordMatch = await bcrypt.compare(
            parsed.data.password,
            user.password
          );

          if (!passwordMatch) {
            throw new Error("InvalidPassword");
          }
          console.log("✅ Mot de passe correct");

          console.log(
            "🎉 Authentification réussie, création du profil utilisateur"
          );
          return {
            id: user.id,
            name: user.username,
            username: user.username,
            email: null,
            role: user.role,
          };
        } catch (error) {
          console.log("💥 Erreur critique durant l'authentification:", error);
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
