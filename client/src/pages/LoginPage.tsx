import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/queryClient";

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/");
    }
  }, [isLoading, isAuthenticated, navigate]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-between px-4 py-8">
      {/* Spacer so content stays centered */}
      <div className="flex-1 flex items-center justify-center w-full">
        <div className="w-full max-w-md flex flex-col items-center gap-8">
          {/* Logo / Brand */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-900">
              <span className="text-white font-black text-3xl tracking-tight">L</span>
            </div>
            <div className="text-center">
              <h1 className="text-5xl font-black text-white tracking-tighter">LAB</h1>
              <p className="text-zinc-400 text-sm mt-1 tracking-widest uppercase">Fitness Training</p>
            </div>
          </div>

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
              <div
                key={f.label}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 flex items-center gap-2"
              >
                <span className="text-lg">{f.icon}</span>
                <span className="text-zinc-300 text-sm font-medium">{f.label}</span>
              </div>
            ))}
          </div>

          {/* Login */}
          <div className="w-full flex flex-col items-center gap-4">
            <a
              href={`${API_BASE_URL}/auth/google`}
              className="w-full"
              data-testid="button-google-login"
            >
              <Button
                className="w-full h-12 bg-white hover:bg-zinc-100 text-black font-semibold text-base rounded-xl flex items-center justify-center gap-3 transition-all"
              >
                <GoogleIcon />
                Continue with Google
              </Button>
            </a>
            <p className="text-zinc-600 text-xs text-center max-w-xs">
              Your workout history is private and linked to your Google account.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full text-center pt-6">
        <p className="text-zinc-600 text-xs">
          Support:{" "}
          <a
            href="mailto:learnandburn.lab.support@gmail.com"
            className="text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
          >
            learnandburn.lab.support@gmail.com
          </a>
        </p>
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
