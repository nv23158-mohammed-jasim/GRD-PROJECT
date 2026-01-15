import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/HomePage";
import SelectExercisePage from "@/pages/SelectExercisePage";
import ExercisePage from "@/pages/ExercisePage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/select-exercise" component={SelectExercisePage} />
      <Route path="/exercise/:type/:difficulty/:intensity" component={ExercisePage} />
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
