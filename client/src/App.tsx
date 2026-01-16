import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/HomePage";
import SelectExercisePage from "@/pages/SelectExercisePage";
import ExercisePage from "@/pages/ExercisePage";
import GamePage from "@/pages/GamePage";
import SpecialModePage from "@/pages/SpecialModePage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/select-exercise" component={SelectExercisePage} />
      <Route path="/exercise/:type/:difficulty/:intensity" component={ExercisePage} />
      <Route path="/game" component={GamePage} />
      <Route path="/special" component={SpecialModePage} />
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
