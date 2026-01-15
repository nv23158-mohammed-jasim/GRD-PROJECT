import { useEntries } from "@/hooks/use-entries";
import { StatsCard } from "@/components/StatsCard";
import { FitnessChart } from "@/components/FitnessChart";
import { EntryForm } from "@/components/EntryForm";
import { HistoryList } from "@/components/HistoryList";
import { 
  TrendingUp, 
  Flame, 
  Scale, 
  Activity,
  Calendar,
  ChevronRight
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { data: entries, isLoading, error } = useEntries();
  const [activeTab, setActiveTab] = useState("overview");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Activity className="w-10 h-10 text-primary animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-red-500">
        <p>Error loading dashboard: {error.message}</p>
      </div>
    );
  }

  const safeEntries = entries || [];

  // Calculate stats
  const totalSteps = safeEntries.reduce((acc, curr) => acc + curr.steps, 0);
  const totalCalories = safeEntries.reduce((acc, curr) => acc + curr.calories, 0);
  
  // Get latest weight (sort by date desc)
  const sortedByDate = [...safeEntries].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const currentWeight = sortedByDate.length > 0 ? sortedByDate[0].weight : 0;
  const previousWeight = sortedByDate.length > 1 ? sortedByDate[1].weight : currentWeight;
  
  // Calculate weight trend
  const weightDiff = Number(currentWeight) - Number(previousWeight);
  const weightTrend = weightDiff === 0 
    ? "Stable" 
    : `${weightDiff > 0 ? "+" : ""}${weightDiff.toFixed(1)}kg vs last entry`;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Hero Section */}
      <div className="relative bg-zinc-900 border-b border-white/5 pt-12 pb-24 overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="flex items-center space-x-2 text-primary font-bold tracking-wider uppercase text-sm mb-2">
                <Activity className="w-4 h-4" />
                <span>Fitness Tracker Pro</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-2">
                Your Progress
              </h1>
              <p className="text-muted-foreground text-lg max-w-lg">
                Track your journey, visualize your gains, and push your limits every single day.
              </p>
            </div>
            <EntryForm />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 -mt-16 relative z-20">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <StatsCard 
            title="Total Steps" 
            value={totalSteps.toLocaleString()} 
            icon={TrendingUp} 
            trend="Lifetime activity"
          />
          <StatsCard 
            title="Calories Burned" 
            value={totalCalories.toLocaleString()} 
            icon={Flame} 
            color="red"
            trend="Total energy expenditure"
          />
          <StatsCard 
            title="Current Weight" 
            value={`${currentWeight} kg`} 
            icon={Scale} 
            trend={weightTrend}
          />
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-8" onValueChange={setActiveTab}>
          <div className="flex items-center justify-between border-b border-white/5 pb-1">
            <TabsList className="bg-transparent h-auto p-0 gap-8">
              {["overview", "history"].map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className={cn(
                    "bg-transparent p-0 pb-4 rounded-none border-b-2 border-transparent text-lg text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent transition-all uppercase tracking-wide font-display font-bold",
                  )}
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
            
            <div className="hidden sm:flex text-sm text-muted-foreground items-center">
              <Calendar className="w-4 h-4 mr-2" />
              Last updated: {new Date().toLocaleDateString()}
            </div>
          </div>

          <TabsContent value="overview" className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-card rounded-2xl p-6 border border-white/5 shadow-lg">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold font-display flex items-center">
                    <TrendingUp className="w-5 h-5 text-emerald-400 mr-2" />
                    Steps History
                  </h3>
                </div>
                <FitnessChart 
                  data={safeEntries} 
                  dataKey="steps" 
                  label="Steps" 
                  color="#10b981" 
                />
              </div>

              <div className="bg-card rounded-2xl p-6 border border-white/5 shadow-lg">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold font-display flex items-center">
                    <Scale className="w-5 h-5 text-blue-400 mr-2" />
                    Weight Trends
                  </h3>
                </div>
                <FitnessChart 
                  data={safeEntries} 
                  dataKey="weight" 
                  label="Weight (kg)" 
                  color="#3b82f6" 
                />
              </div>
            </div>

            {/* Recent Activity Mini-List */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold font-display text-white">Recent Activity</h3>
                <Button 
                  variant="link" 
                  onClick={() => {
                    const trigger = document.querySelector('[data-value="history"]') as HTMLElement;
                    trigger?.click();
                  }}
                  className="text-primary hover:text-red-400 p-0"
                >
                  View All History <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
              <HistoryList entries={safeEntries.slice(0, 5)} />
            </div>
          </TabsContent>

          <TabsContent value="history" className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-card rounded-2xl p-6 border border-white/5 shadow-lg min-h-[500px]">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-bold font-display text-white">Full History</h3>
                  <p className="text-muted-foreground mt-1">Archive of all your fitness logs</p>
                </div>
              </div>
              <HistoryList entries={safeEntries} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
