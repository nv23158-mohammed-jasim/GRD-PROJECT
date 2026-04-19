import { initializeApp, getApps } from "firebase/app";
import { getAuth, OAuthProvider, signInWithPopup } from "firebase/auth";

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

export const firebaseConfigured = !!(apiKey && authDomain && projectId);

let _auth: ReturnType<typeof getAuth> | null = null;

function getFirebaseAuth() {
  if (!firebaseConfigured) return null;
  if (_auth) return _auth;
  const app = getApps().length === 0
    ? initializeApp({ apiKey, authDomain, projectId })
    : getApps()[0];
  _auth = getAuth(app);
  return _auth;
}

export async function signInWithMicrosoft(): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase is not configured");
  const provider = new OAuthProvider("microsoft.com");
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  return result.user.getIdToken();
}
