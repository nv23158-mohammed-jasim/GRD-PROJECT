import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertEntrySchema } from "@shared/schema";
import { useCreateEntry } from "@/hooks/use-entries";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

// Extend schema for form validation with coercions
const formSchema = insertEntrySchema.extend({
  steps: z.coerce.number().min(1, "Steps must be at least 1"),
  calories: z.coerce.number().min(1, "Calories must be at least 1"),
  weight: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
    message: "Weight must be a valid number",
  }),
});

type FormValues = z.infer<typeof formSchema>;

export function EntryForm() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createEntry = useCreateEntry();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      steps: 0,
      calories: 0,
      weight: "",
    },
  });

  const onSubmit = (data: FormValues) => {
    createEntry.mutate(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        toast({
          title: "Entry Created",
          description: "Your fitness log has been updated successfully.",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="lg" 
          className="bg-primary hover:bg-red-600 text-white font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-300"
        >
          <Plus className="w-5 h-5 mr-2" />
          Log New Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display font-bold text-center uppercase tracking-wide">
            Log Daily Activity
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
            <FormField
              control={form.control}
              name="steps"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="uppercase text-xs font-bold text-muted-foreground tracking-wider">Steps Count</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="e.g. 10000" 
                      {...field} 
                      className="bg-background border-white/10 focus:border-primary/50 text-lg h-12"
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="calories"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase text-xs font-bold text-muted-foreground tracking-wider">Calories</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="e.g. 2400" 
                        {...field} 
                        className="bg-background border-white/10 focus:border-primary/50 text-lg h-12"
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="weight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase text-xs font-bold text-muted-foreground tracking-wider">Weight (kg)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.1" 
                        placeholder="e.g. 75.5" 
                        {...field} 
                        className="bg-background border-white/10 focus:border-primary/50 text-lg h-12"
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-lg font-bold bg-primary hover:bg-red-600 shadow-lg shadow-primary/20"
              disabled={createEntry.isPending}
            >
              {createEntry.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Entry"
              )}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
