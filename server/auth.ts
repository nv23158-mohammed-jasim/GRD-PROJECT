import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import jwt from "jsonwebtoken";
import { type Express, type Request, type Response, type NextFunction } from "express";
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

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable must be set");
}
const JWT_SECRET = process.env.SESSION_SECRET;

export function getJwtSecret() {
  return JWT_SECRET;
}

// Extract user from JWT Authorization header
export async function getUserFromToken(req: Request): Promise<Express.User | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    const [user] = await db.select().from(users).where(eq(users.id, decoded.id));
    return user || null;
  } catch {
    return null;
  }
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({ pool, tableName: "session" }),
      secret: JWT_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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

  app.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  app.get(
    "/auth/google/callback",
    passport.authenticate("google", {
      failureRedirect: process.env.FRONTEND_URL
        ? `${process.env.FRONTEND_URL}/login`
        : "/login",
    }),
    (req, res) => {
      const user = req.user as Express.User;
      const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "30d" });
      const frontendUrl = process.env.FRONTEND_URL || "/";
      res.redirect(`${frontendUrl}?token=${token}`);
    }
  );

  app.post("/auth/logout", (req, res) => {
    req.logout(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", async (req, res) => {
    // Check JWT token first (for cross-origin / iOS Safari)
    const tokenUser = await getUserFromToken(req);
    if (tokenUser) return res.json(tokenUser);

    // Fall back to session
    if (req.isAuthenticated() && req.user) {
      return res.json(req.user);
    }
    res.status(401).json({ message: "Not authenticated" });
  });
}
