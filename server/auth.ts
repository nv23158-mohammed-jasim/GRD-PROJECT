import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { type Express } from "express";
import { pool, db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      picture?: string | null;
    }
  }
}

export function setupAuth(app: Express) {
  // Trust reverse proxy (Render, etc.) for secure cookies
  app.set("trust proxy", 1);

  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({ pool, tableName: "session" }),
      secret: process.env.SESSION_SECRET || "lab-secret-fallback",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      done(null, user || null);
    } catch (err) {
      done(err);
    }
  });

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackURL =
      process.env.GOOGLE_CALLBACK_URL ||
      (process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}/auth/google/callback`
        : "https://grd-project-server.onrender.com/auth/google/callback");

    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const [existing] = await db
              .select()
              .from(users)
              .where(eq(users.id, profile.id));

            if (existing) {
              return done(null, existing);
            }

            const [created] = await db
              .insert(users)
              .values({
                id: profile.id,
                email: profile.emails?.[0]?.value || "",
                name: profile.displayName,
                picture: profile.photos?.[0]?.value,
              })
              .returning();

            done(null, created);
          } catch (err) {
            done(err as Error);
          }
        }
      )
    );
  }

  // Auth routes
  app.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  app.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login" }),
    (_req, res) => res.redirect("/")
  );

  app.post("/auth/logout", (req, res) => {
    req.logout(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated() && req.user) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });
}
