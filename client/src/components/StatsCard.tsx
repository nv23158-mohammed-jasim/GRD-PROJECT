import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: "red" | "default";
}

export function StatsCard({ title, value, icon: Icon, trend, color = "default" }: StatsCardProps) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl group",
      color === "red" 
        ? "bg-gradient-to-br from-primary/20 to-background border border-primary/30 shadow-primary/10" 
        : "bg-card border border-white/5 shadow-lg shadow-black/40 hover:border-white/10"
    )}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
            {title}
          </p>
          <h3 className={cn(
            "text-3xl font-bold font-display",
            color === "red" ? "text-primary" : "text-white"
          )}>
            {value}
          </h3>
          {trend && (
            <p className="text-xs text-muted-foreground mt-2">
              {trend}
            </p>
          )}
        </div>
        <div className={cn(
          "p-3 rounded-xl transition-colors duration-300",
          color === "red" 
            ? "bg-primary/20 text-primary group-hover:bg-primary group-hover:text-white" 
            : "bg-white/5 text-white/70 group-hover:bg-white/10 group-hover:text-white"
        )}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      
      {/* Decorative texture */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
    </div>
  );
}
