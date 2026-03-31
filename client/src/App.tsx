import { Switch, Route, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { queryClient } from "./lib/queryClient";
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

function Router() {
  const [, navigate] = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const hasBmi = !!localStorage.getItem("fitness_bmi_profile");
    const hasSeen = !!localStorage.getItem("fitness_bmi_seen");
    if (!hasBmi && !hasSeen && window.location.pathname === "/") {
      navigate("/bmi");
    }
    setChecked(true);
  }, []);

  if (!checked) return null;

  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/bmi" component={BMIPage} />
      <Route path="/select-exercise" component={SelectExercisePage} />
      <Route path="/exercise/:type/:difficulty/:intensity" component={ExercisePage} />
      <Route path="/game" component={GamePage} />
      <Route path="/boxing" component={BoxingModePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
