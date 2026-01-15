import { useDeleteEntry } from "@/hooks/use-entries";
import { type EntryResponse } from "@shared/routes";
import { format } from "date-fns";
import { Trash2, TrendingUp, Flame, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface HistoryListProps {
  entries: EntryResponse[];
}

export function HistoryList({ entries }: HistoryListProps) {
  const { toast } = useToast();
  const deleteEntry = useDeleteEntry();

  // Sort by date descending
  const sortedEntries = [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleDelete = (id: number) => {
    deleteEntry.mutate(id, {
      onSuccess: () => {
        toast({
          title: "Entry Deleted",
          description: "The entry has been removed from your history.",
        });
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to delete entry.",
          variant: "destructive",
        });
      }
    });
  };

  if (sortedEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-card/50 rounded-2xl border border-white/5 border-dashed">
        <div className="p-4 bg-white/5 rounded-full mb-4">
          <TrendingUp className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-bold font-display text-white mb-2">No Entries Yet</h3>
        <p className="text-muted-foreground max-w-sm">
          Start logging your daily activity to track your progress and achieve your goals.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedEntries.map((entry) => (
        <div 
          key={entry.id}
          className="group relative flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-card hover:bg-white/5 rounded-xl border border-white/5 transition-all duration-200"
        >
          <div className="flex items-center space-x-4 mb-4 sm:mb-0">
            <div className="bg-primary/10 text-primary p-3 rounded-lg font-bold text-center min-w-[60px]">
              <div className="text-xs uppercase tracking-wider opacity-70">
                {format(new Date(entry.date), 'MMM')}
              </div>
              <div className="text-xl leading-none">
                {format(new Date(entry.date), 'dd')}
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-6 sm:gap-8">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Steps</p>
                  <p className="font-bold font-display text-lg">{entry.steps.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Flame className="w-4 h-4 text-orange-400" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Cals</p>
                  <p className="font-bold font-display text-lg">{entry.calories}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Scale className="w-4 h-4 text-blue-400" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Kg</p>
                  <p className="font-bold font-display text-lg">{entry.weight}</p>
                </div>
              </div>
            </div>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all absolute top-4 right-4 sm:static sm:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border-white/10 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Entry?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  This action cannot be undone. This will permanently delete this record from your history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-transparent border-white/10 hover:bg-white/5 text-white">Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => handleDelete(entry.id)}
                  className="bg-red-600 hover:bg-red-700 text-white border-0"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
    </div>
  );
}
