import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, ArrowRight, RefreshCw } from "lucide-react";

type ActivityLevel = "sedentary" | "light" | "moderate" | "very_active";
type Gender = "male" | "female";

export interface BMIProfile {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  bmi: number;
  category: string;
  suggestedDifficulty: "beginner" | "medium" | "pro";
}

export function getBMICategory(bmi: number, gender: Gender = "male"): string {
  // WHO standard BMI categories are the same for both genders
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25)   return "Normal";
  if (bmi < 30)   return "Overweight";
  return "Obese";
}

function getBMICategoryColor(bmi: number): string {
  if (bmi < 18.5) return "text-blue-400";
  if (bmi < 25)   return "text-green-400";
  if (bmi < 30)   return "text-yellow-400";
  return "text-red-400";
}

function getBMIBarColor(bmi: number): string {
  if (bmi < 18.5) return "bg-blue-400";
  if (bmi < 25)   return "bg-green-400";
  if (bmi < 30)   return "bg-yellow-400";
  return "bg-red-400";
}

function getBMIBarPercent(bmi: number): number {
  if (bmi < 18.5) return Math.max(2, ((bmi - 14) / (18.5 - 14)) * 25);
  if (bmi < 25)   return 25 + ((bmi - 18.5) / (25 - 18.5)) * 25;
  if (bmi < 30)   return 50 + ((bmi - 25) / (30 - 25)) * 25;
  return Math.min(96, 75 + ((bmi - 30) / (40 - 30)) * 25);
}

export function getSuggestedDifficulty(
  bmi: number,
  activityLevel: ActivityLevel,
  gender: Gender = "male"
): "beginner" | "medium" | "pro" {
  // Women generally have higher body fat % at the same BMI, so we apply a slight offset
  const adjustedBmi = gender === "female" ? bmi - 1.5 : bmi;

  if (adjustedBmi >= 30) return "beginner";
  if (adjustedBmi >= 25) return activityLevel === "very_active" ? "medium" : "beginner";
  if (adjustedBmi < 18.5) return "beginner";
  if (activityLevel === "sedentary" || activityLevel === "light") return "beginner";
  if (activityLevel === "moderate") return "medium";
  return "pro";
}

function getDifficultyReason(bmi: number, activityLevel: ActivityLevel, gender: Gender): string {
  const adjustedBmi = gender === "female" ? bmi - 1.5 : bmi;
  if (adjustedBmi >= 30) return "Starting with beginner ensures a safe, progressive build-up for your joints and cardiovascular system.";
  if (adjustedBmi >= 25 && activityLevel !== "very_active") return "A beginner program helps you build a solid base while managing intensity.";
  if (adjustedBmi >= 25) return "Your activity level is good — medium difficulty will keep you challenged safely.";
  if (adjustedBmi < 18.5) return "Focus on form and consistency first with beginner difficulty.";
  if (activityLevel === "sedentary") return "Starting at beginner is the best way to build sustainable habits.";
  if (activityLevel === "light") return "Beginner difficulty will quickly help you feel the progress.";
  if (activityLevel === "moderate") return "Your active lifestyle is ready for a medium challenge!";
  return "Your fitness level is great — pro difficulty will push you to new limits!";
}

const difficultyStyles: Record<string, string> = {
  beginner: "text-green-400 border-green-400/40 bg-green-400/10",
  medium:   "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  pro:      "text-red-400 border-red-400/40 bg-red-400/10",
};

const activityOptions: { value: ActivityLevel; label: string; desc: string }[] = [
  { value: "sedentary",   label: "Sedentary",         desc: "Little or no exercise" },
  { value: "light",       label: "Lightly Active",    desc: "1–3 days/week" },
  { value: "moderate",    label: "Moderately Active", desc: "3–5 days/week" },
  { value: "very_active", label: "Very Active",       desc: "6–7 days/week" },
];

export default function BMIPage() {
  const [, setLocation] = useLocation();
  const [gender, setGender] = useState<Gender>("male");
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderate");
  const [profile, setProfile] = useState<BMIProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("fitness_bmi_profile");
    if (saved) {
      try {
        const p: BMIProfile = JSON.parse(saved);
        setProfile(p);
        setGender(p.gender || "male");
        setAge(String(p.age));
        setHeightCm(String(p.heightCm));
        setWeightKg(String(p.weightKg));
        setActivityLevel(p.activityLevel);
      } catch { /* ignore */ }
    }
  }, []);

  const canCalculate = age && heightCm && weightKg &&
    parseFloat(heightCm) > 0 && parseFloat(weightKg) > 0 && parseInt(age) > 0;

  const handleCalculate = () => {
    if (!canCalculate) return;
    const bmiVal = parseFloat(weightKg) / Math.pow(parseFloat(heightCm) / 100, 2);
    const difficulty = getSuggestedDifficulty(bmiVal, activityLevel, gender);
    const newProfile: BMIProfile = {
      gender,
      age: parseInt(age),
      heightCm: parseFloat(heightCm),
      weightKg: parseFloat(weightKg),
      activityLevel,
      bmi: Math.round(bmiVal * 10) / 10,
      category: getBMICategory(bmiVal, gender),
      suggestedDifficulty: difficulty,
    };
    setProfile(newProfile);
    setIsEditing(false);
    localStorage.setItem("fitness_bmi_profile", JSON.stringify(newProfile));
  };

  const handleContinue = () => {
    localStorage.setItem("fitness_bmi_seen", "1");
    setLocation("/");
  };

  const handleSkip = () => {
    localStorage.setItem("fitness_bmi_seen", "1");
    setLocation("/");
  };

  const showForm = !profile || isEditing;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Activity className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Fitness Profile</h1>
          <p className="text-muted-foreground text-sm">
            We'll calculate your BMI and suggest the perfect difficulty level for you.
          </p>
        </div>

        {showForm ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Your Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Gender selector */}
              <div>
                <Label className="text-sm mb-2 block">Gender</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                      gender === "male"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 text-muted-foreground"
                    }`}
                    onClick={() => setGender("male")}
                    data-testid="button-gender-male"
                  >
                    <span className="text-2xl">♂</span>
                    Male
                  </button>
                  <button
                    className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                      gender === "female"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 text-muted-foreground"
                    }`}
                    onClick={() => setGender("female")}
                    data-testid="button-gender-female"
                  >
                    <span className="text-2xl">♀</span>
                    Female
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm mb-1 block">Age</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 25"
                    value={age}
                    onChange={e => setAge(e.target.value)}
                    min="10" max="100"
                    data-testid="input-age"
                  />
                </div>
                <div>
                  <Label className="text-sm mb-1 block">Height (cm)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 175"
                    value={heightCm}
                    onChange={e => setHeightCm(e.target.value)}
                    min="100" max="250"
                    data-testid="input-height"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm mb-1 block">Weight (kg)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 70"
                  value={weightKg}
                  onChange={e => setWeightKg(e.target.value)}
                  min="30" max="300"
                  data-testid="input-weight"
                />
              </div>

              <div>
                <Label className="text-sm mb-2 block">Activity Level</Label>
                <div className="grid grid-cols-2 gap-2">
                  {activityOptions.map(opt => (
                    <button
                      key={opt.value}
                      className={`text-left p-3 rounded-lg border text-sm transition-all ${
                        activityLevel === opt.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => setActivityLevel(opt.value)}
                      data-testid={`button-activity-${opt.value}`}
                    >
                      <p className="font-medium">{opt.label}</p>
                      <p className="text-muted-foreground text-xs">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleCalculate}
                disabled={!canCalculate}
                data-testid="button-calculate-bmi"
              >
                Calculate My BMI
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6 border-primary/20">
            <CardContent className="p-6">
              {/* Gender badge */}
              <div className="flex justify-center mb-4">
                <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-sm font-semibold capitalize">
                  {profile.gender === "male" ? "♂ Male" : "♀ Female"}
                </span>
              </div>

              <div className="text-center mb-5">
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Your BMI</p>
                <p className={`text-7xl font-bold ${getBMICategoryColor(profile.bmi)}`}>
                  {profile.bmi}
                </p>
                <span className={`text-lg font-semibold ${getBMICategoryColor(profile.bmi)}`}>
                  {profile.category}
                </span>
              </div>

              {/* BMI Scale */}
              <div className="mb-5">
                <div className="relative h-3 rounded-full overflow-hidden flex mb-1">
                  <div className="flex-1 bg-blue-400/50" />
                  <div className="flex-1 bg-green-400/50" />
                  <div className="flex-1 bg-yellow-400/50" />
                  <div className="flex-1 bg-red-400/50" />
                </div>
                <div
                  className={`relative h-4 w-4 rounded-full shadow-lg border-2 border-white -mt-4 ${getBMIBarColor(profile.bmi)}`}
                  style={{
                    marginLeft: `calc(${getBMIBarPercent(profile.bmi)}% - 8px)`,
                    transition: "margin-left 0.5s ease",
                  }}
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>Underweight</span>
                  <span>Normal</span>
                  <span>Overweight</span>
                  <span>Obese</span>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 mb-5 text-center">
                <div className="bg-muted/20 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Age</p>
                  <p className="font-semibold">{profile.age}</p>
                </div>
                <div className="bg-muted/20 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Height</p>
                  <p className="font-semibold">{profile.heightCm}cm</p>
                </div>
                <div className="bg-muted/20 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Weight</p>
                  <p className="font-semibold">{profile.weightKg}kg</p>
                </div>
              </div>

              {/* Difficulty Suggestion */}
              <div className={`border rounded-xl p-4 mb-4 ${difficultyStyles[profile.suggestedDifficulty]}`}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">Recommended Difficulty</p>
                <p className="text-2xl font-bold capitalize mb-2">{profile.suggestedDifficulty}</p>
                <p className="text-xs opacity-80 leading-relaxed">
                  {getDifficultyReason(profile.bmi, profile.activityLevel, profile.gender)}
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => setIsEditing(true)}
                data-testid="button-edit-profile"
              >
                <RefreshCw className="w-3 h-3 mr-2" />
                Update my details
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          {!profile && (
            <Button
              variant="ghost"
              className="flex-1"
              onClick={handleSkip}
              data-testid="button-skip-bmi"
            >
              Skip for now
            </Button>
          )}
          <Button
            size="lg"
            className="flex-1 py-6 text-base"
            onClick={handleContinue}
            data-testid="button-continue"
          >
            {profile ? "Continue to App" : "Continue"}
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
