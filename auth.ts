import NextAuth from "next-auth";
import { readFileSync } from "fs";
import { join } from "path";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

interface User {
	id: string;
	username: string;
	role: string;
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
						readFileSync(join(process.cwd(), "data/users.json"), "utf-8"),
					);

					const parsed = userSchema.parse(credentials);
					const user = users.find(
						(u: User) =>
							u.username === parsed.username && u.password === parsed.password,
					);

					if (user) {
						return {
							id: user.id,
							name: user.username,
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
				session.user.role = token.role as string;
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
