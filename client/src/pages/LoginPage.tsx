import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE_URL } from "@/lib/queryClient";
type Mode = "choose" | "login" | "register";

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate("/");
  }, [isLoading, isAuthenticated, navigate]);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body: any = { email, password };
      if (mode === "register") body.name = name;

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Something went wrong"); return; }

      localStorage.setItem("auth_token", data.token);
      window.location.href = "/";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-between px-4 py-8">
      <div className="flex-1 flex items-center justify-center w-full">
        <div className="w-full max-w-md flex flex-col items-center gap-8">

          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-900">
              <span className="text-white font-black text-3xl tracking-tight">L</span>
            </div>
            <div className="text-center">
              <h1 className="text-5xl font-black text-white tracking-tighter">LAB</h1>
              <p className="text-zinc-400 text-sm mt-1 tracking-widest uppercase">Fitness Training</p>
            </div>
          </div>

          {mode === "choose" && (
            <>
              {/* Tagline */}
              <div className="text-center space-y-1">
                <p className="text-zinc-200 text-lg font-medium">Train smarter. Track everything.</p>
                <p className="text-zinc-500 text-sm">Push-ups, squats, Neon Run, and boxing — all in one place.</p>
              </div>

              {/* Features */}
              <div className="w-full grid grid-cols-2 gap-3">
                {[
                  { icon: "🏋️", label: "AI pose detection" },
                  { icon: "🎮", label: "Neon Run game" },
                  { icon: "🥊", label: "Boxing mode" },
                  { icon: "📊", label: "Progress charts" },
                ].map((f) => (
                  <div key={f.label} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 flex items-center gap-2">
                    <span className="text-lg">{f.icon}</span>
                    <span className="text-zinc-300 text-sm font-medium">{f.label}</span>
                  </div>
                ))}
              </div>

              {/* Login buttons */}
              <div className="w-full flex flex-col items-center gap-3">
                <a href={`${API_BASE_URL}/auth/google`} className="w-full" data-testid="button-google-login">
                  <Button className="w-full h-12 bg-white hover:bg-zinc-100 text-black font-semibold text-base rounded-xl flex items-center justify-center gap-3 transition-all">
                    <GoogleIcon />
                    Continue with Google
                  </Button>
                </a>

                <div className="w-full flex items-center gap-3">
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-zinc-600 text-xs">or</span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>

                <Button
                  onClick={() => setMode("login")}
                  className="w-full h-12 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white font-semibold text-base rounded-xl transition-all"
                  data-testid="button-email-login"
                >
                  Sign in with Email
                </Button>

                <button
                  onClick={() => setMode("register")}
                  className="text-zinc-400 text-sm hover:text-white transition-colors"
                  data-testid="button-create-account"
                >
                  Don't have an account? <span className="text-red-400 font-medium">Create one</span>
                </button>
              </div>
            </>
          )}

          {(mode === "login" || mode === "register") && (
            <form onSubmit={handleEmailSubmit} className="w-full flex flex-col gap-4">
              <h2 className="text-white text-xl font-bold text-center">
                {mode === "login" ? "Sign In" : "Create Account"}
              </h2>

              {mode === "register" && (
                <Input
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-12 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
                  data-testid="input-name"
                />
              )}

              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
                data-testid="input-email"
              />

              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-12 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
                data-testid="input-password"
              />

              {error && (
                <p className="text-red-400 text-sm text-center" data-testid="text-error">{error}</p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-semibold text-base rounded-xl transition-all"
                data-testid="button-submit"
              >
                {submitting ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
              </Button>

              <button
                type="button"
                onClick={() => { setMode("choose"); setError(""); }}
                className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors text-center"
                data-testid="button-back"
              >
                ← Back to all sign-in options
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full text-center pt-6">
        <p className="text-zinc-400 text-sm font-medium">Need help?</p>
        <a
          href="mailto:learnandburn.lab.support@gmail.com"
          className="inline-flex items-center gap-1.5 mt-1 text-sm text-red-400 hover:text-red-300 transition-colors font-medium"
        >
          learnandburn.lab.support@gmail.com
        </a>
      </footer>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

