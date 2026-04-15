import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient, setAuthToken } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/HomePage";
import SelectExercisePage from "@/pages/SelectExercisePage";
import ExercisePage from "@/pages/ExercisePage";
import GamePage from "@/pages/GamePage";
import BoxingModePage from "@/pages/BoxingModePage";
import BMIPage from "@/pages/BMIPage";
import LoginPage from "@/pages/LoginPage";
import AdminPage from "@/pages/AdminPage";
import { useAuth } from "@/hooks/use-auth";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;
  return <>{children}</>;
}

function BmiRedirect() {
  const [location, navigate] = useLocation();
  useEffect(() => {
    const hasBmi = !!localStorage.getItem("fitness_bmi_profile");
    const hasSeen = !!localStorage.getItem("fitness_bmi_seen");
    if (!hasBmi && !hasSeen) navigate("/bmi");
  }, []);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        <AuthGuard>
          <BmiRedirect />
          <HomePage />
        </AuthGuard>
      </Route>
      <Route path="/bmi">
        <AuthGuard><BMIPage /></AuthGuard>
      </Route>
      <Route path="/select-exercise">
        <AuthGuard><SelectExercisePage /></AuthGuard>
      </Route>
      <Route path="/exercise/:type/:difficulty/:intensity">
        <AuthGuard><ExercisePage /></AuthGuard>
      </Route>
      <Route path="/game">
        <AuthGuard><GamePage /></AuthGuard>
      </Route>
      <Route path="/boxing">
        <AuthGuard><BoxingModePage /></AuthGuard>
      </Route>
      <Route path="/admin">
        <AuthGuard><AdminPage /></AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      setAuthToken(token);
      params.delete("token");
      const newUrl =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "");
      window.history.replaceState({}, "", newUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
