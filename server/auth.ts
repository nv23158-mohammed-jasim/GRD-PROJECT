import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { type Express, type Request } from "express";
import { pool, db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Firebase Admin (optional — only initialised if FIREBASE_SERVICE_ACCOUNT is set)
let firebaseAdmin: any = null;
async function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return null;
  try {
    const admin = await import("firebase-admin");
    if (!admin.default.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.default.initializeApp({ credential: admin.default.credential.cert(serviceAccount) });
    }
    firebaseAdmin = admin.default;
    return firebaseAdmin;
  } catch {
    return null;
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      picture?: string | null;
      authProvider?: string;
    }
  }
}

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable must be set");
}
const JWT_SECRET = process.env.SESSION_SECRET;

export function getJwtSecret() { return JWT_SECRET; }

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
  app.use(session({
    store: new PgSession({ pool, tableName: "session" }),
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      done(null, user || null);
    } catch (err) { done(err); }
  });

  // ── Google OAuth ──────────────────────────────────────────────────────────
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackURL =
      process.env.GOOGLE_CALLBACK_URL ||
      (process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}/auth/google/callback`
        : "https://grd-project-server.onrender.com/auth/google/callback");

    passport.use(new GoogleStrategy(
      { clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, callbackURL },
      async (_at, _rt, profile, done) => {
        try {
          const [existing] = await db.select().from(users).where(eq(users.id, profile.id));
          if (existing) return done(null, existing);
          const [created] = await db.insert(users).values({
            id: profile.id,
            email: profile.emails?.[0]?.value || "",
            name: profile.displayName,
            picture: profile.photos?.[0]?.value,
            authProvider: "google",
          }).returning();
          done(null, created);
        } catch (err) { done(err as Error); }
      }
    ));
  }

  // ── Email / Password (Local) ──────────────────────────────────────────────
  passport.use(new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
      if (!user || !user.passwordHash) return done(null, false, { message: "Invalid email or password" });
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return done(null, false, { message: "Invalid email or password" });
      return done(null, user);
    } catch (err) { done(err); }
  }));

  // ── Google OAuth Routes ───────────────────────────────────────────────────
  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
  app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/login` : "/login" }),
    (req, res) => {
      const user = req.user as Express.User;
      const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.redirect(`${process.env.FRONTEND_URL || "/"}?token=${token}`);
    }
  );

  // ── Firebase (Microsoft via Firebase) ────────────────────────────────────
  app.post("/auth/firebase", async (req, res) => {
    try {
      const { idToken } = req.body;
      if (!idToken) return res.status(400).json({ message: "idToken is required" });

      const admin = await getFirebaseAdmin();
      if (!admin) return res.status(503).json({ message: "Firebase is not configured on this server" });

      const decoded = await admin.auth().verifyIdToken(idToken);
      const firebaseUid = decoded.uid;
      const email = decoded.email || "";
      const name = decoded.name || decoded.email?.split("@")[0] || "User";
      const picture = decoded.picture || null;

      // Determine provider from Firebase token
      const providerData = decoded.firebase?.sign_in_provider || "firebase";
      const authProvider = providerData.includes("microsoft") ? "microsoft" : providerData;
      const userId = `fb_${firebaseUid}`;

      const [existing] = await db.select().from(users).where(eq(users.id, userId));
      if (existing) {
        const token = jwt.sign({ id: existing.id }, JWT_SECRET, { expiresIn: "30d" });
        return res.json({ token, user: { id: existing.id, email: existing.email, name: existing.name, picture: existing.picture } });
      }

      const [created] = await db.insert(users).values({ id: userId, email, name, picture, authProvider }).returning();
      const token = jwt.sign({ id: created.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token, user: { id: created.id, email: created.email, name: created.name, picture: created.picture } });
    } catch (err: any) {
      res.status(401).json({ message: "Invalid Firebase token" });
    }
  });

  // ── Email/Password Routes ─────────────────────────────────────────────────
  app.post("/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password || !name) return res.status(400).json({ message: "Email, password and name are required" });
      if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

      const normalizedEmail = email.toLowerCase().trim();
      const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail));
      if (existing) return res.status(409).json({ message: "An account with this email already exists" });

      const passwordHash = await bcrypt.hash(password, 12);
      const id = randomUUID();
      const [created] = await db.insert(users).values({ id, email: normalizedEmail, name: name.trim(), picture: null, authProvider: "email", passwordHash }).returning();
      const token = jwt.sign({ id: created.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token, user: { id: created.id, email: created.email, name: created.name, picture: created.picture } });
    } catch {
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) return res.status(500).json({ message: "Login failed" });
      if (!user) return res.status(401).json({ message: info?.message || "Invalid email or password" });
      const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token, user: { id: user.id, email: user.email, name: user.name, picture: user.picture } });
    })(req, res, next);
  });

  app.post("/auth/logout", (req, res) => { req.logout(() => res.json({ ok: true })); });

  app.get("/api/auth/me", async (req, res) => {
    const tokenUser = await getUserFromToken(req);
    if (tokenUser) return res.json(tokenUser);
    if (req.isAuthenticated() && req.user) return res.json(req.user);
    res.status(401).json({ message: "Not authenticated" });
  });
}
