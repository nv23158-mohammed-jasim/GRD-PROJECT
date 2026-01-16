import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@shared/routes";
import type { BoxingSession, CreateBoxingSessionRequest } from "@shared/schema";
import {
  ArrowLeft,
  Target,
  Shield,
  Zap,
  Trophy,
  Timer,
  Heart,
  Play,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";

type Difficulty = "easy" | "medium" | "hard";
type CommandType = "jab_left" | "jab_right" | "hook_left" | "hook_right" | "dodge_left" | "dodge_right" | "block";
type Screen = "menu" | "countdown" | "round" | "rest" | "result";

interface Command {
  type: CommandType;
  label: string;
  icon: string;
}

const COMMANDS: Record<CommandType, Command> = {
  jab_left: { type: "jab_left", label: "JAB LEFT", icon: "👊" },
  jab_right: { type: "jab_right", label: "JAB RIGHT", icon: "👊" },
  hook_left: { type: "hook_left", label: "HOOK LEFT", icon: "🥊" },
  hook_right: { type: "hook_right", label: "HOOK RIGHT", icon: "🥊" },
  dodge_left: { type: "dodge_left", label: "DODGE LEFT", icon: "⬅️" },
  dodge_right: { type: "dodge_right", label: "DODGE RIGHT", icon: "➡️" },
  block: { type: "block", label: "BLOCK", icon: "🛡️" },
};

const DIFFICULTY_CONFIG: Record<Difficulty, { rounds: number; roundTime: number; restTime: number; commandInterval: number; commandTimeout: number }> = {
  easy: { rounds: 3, roundTime: 60, restTime: 30, commandInterval: 3000, commandTimeout: 2500 },
  medium: { rounds: 4, roundTime: 90, restTime: 20, commandInterval: 2000, commandTimeout: 1800 },
  hard: { rounds: 5, roundTime: 120, restTime: 15, commandInterval: 1500, commandTimeout: 1200 },
};

export default function BoxingModePage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [screen, setScreen] = useState<Screen>("menu");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [currentRound, setCurrentRound] = useState(1);
  const [countdown, setCountdown] = useState(3);
  const [roundTime, setRoundTime] = useState(0);
  const [restTime, setRestTime] = useState(0);
  const [currentCommand, setCurrentCommand] = useState<Command | null>(null);
  const [commandFeedback, setCommandFeedback] = useState<"success" | "miss" | null>(null);

  const [score, setScore] = useState(0);
  const [punchesLanded, setPunchesLanded] = useState(0);
  const [punchesMissed, setPunchesMissed] = useState(0);
  const [dodgesSuccessful, setDodgesSuccessful] = useState(0);
  const [dodgesMissed, setDodgesMissed] = useState(0);
  const [blocksSuccessful, setBlocksSuccessful] = useState(0);
  const [blocksMissed, setBlocksMissed] = useState(0);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [bodyDetected, setBodyDetected] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  const gameStartTimeRef = useRef(0);
  const commandTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commandIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const baselineRef = useRef<{ headX: number; leftWristX: number; rightWristX: number; shoulderY: number } | null>(null);
  const calibrationFrames = useRef(0);
  const lastActionTimeRef = useRef(0);

  const { data: sessions } = useQuery<BoxingSession[]>({
    queryKey: [api.boxingSessions.list.path],
  });

  const saveSessionMutation = useMutation({
    mutationFn: (data: CreateBoxingSessionRequest) =>
      apiRequest(api.boxingSessions.create.method, api.boxingSessions.create.path, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.boxingSessions.list.path] }),
  });

  const speak = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.2;
      utterance.pitch = 1;
      speechSynthesis.speak(utterance);
    }
  }, []);

  const initCamera = useCallback(async () => {
    try {
      await tf.setBackend("webgl");
      await tf.ready();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );
      detectorRef.current = detector;
      setCameraReady(true);

      isRunningRef.current = true;
      const runDetection = async () => {
        if (!isRunningRef.current || !detectorRef.current || !videoRef.current) return;

        try {
          const poses = await detectorRef.current.estimatePoses(videoRef.current);
          if (poses.length > 0 && poses[0].keypoints) {
            processPose(poses[0].keypoints);
            if (canvasRef.current && videoRef.current) {
              drawSkeleton(poses[0].keypoints, canvasRef.current, videoRef.current);
            }
          } else {
            setBodyDetected(false);
          }
        } catch (err) {
          console.error("Pose detection error:", err);
        }

        animationFrameRef.current = requestAnimationFrame(runDetection);
      };
      runDetection();

    } catch (err: any) {
      let message = "Failed to start camera.";
      if (err.name === "NotAllowedError") message = "Camera access denied.";
      else if (err.name === "NotFoundError") message = "No camera found.";
      setCameraError(message);
    }
  }, []);

  const stopCamera = useCallback(() => {
    isRunningRef.current = false;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (detectorRef.current) {
      detectorRef.current.dispose();
      detectorRef.current = null;
    }
    setCameraReady(false);
  }, []);

  const currentCommandRef = useRef<Command | null>(null);
  useEffect(() => {
    currentCommandRef.current = currentCommand;
  }, [currentCommand]);

  const processPose = useCallback((keypoints: poseDetection.Keypoint[]) => {
    const minConfidence = 0.3;

    const nose = keypoints.find(k => k.name === "nose");
    const leftShoulder = keypoints.find(k => k.name === "left_shoulder");
    const rightShoulder = keypoints.find(k => k.name === "right_shoulder");
    const leftWrist = keypoints.find(k => k.name === "left_wrist");
    const rightWrist = keypoints.find(k => k.name === "right_wrist");
    const leftElbow = keypoints.find(k => k.name === "left_elbow");
    const rightElbow = keypoints.find(k => k.name === "right_elbow");

    const noseValid = nose && (nose.score ?? 0) > minConfidence;
    const leftShoulderValid = leftShoulder && (leftShoulder.score ?? 0) > minConfidence;
    const rightShoulderValid = rightShoulder && (rightShoulder.score ?? 0) > minConfidence;
    const leftWristValid = leftWrist && (leftWrist.score ?? 0) > minConfidence;
    const rightWristValid = rightWrist && (rightWrist.score ?? 0) > minConfidence;
    const leftElbowValid = leftElbow && (leftElbow.score ?? 0) > minConfidence;
    const rightElbowValid = rightElbow && (rightElbow.score ?? 0) > minConfidence;

    if (!noseValid || (!leftShoulderValid && !rightShoulderValid)) {
      setBodyDetected(false);
      return;
    }
    setBodyDetected(true);

    const headX = nose!.x;
    const shoulderY = leftShoulderValid ? leftShoulder!.y : rightShoulder!.y;
    const bodyCenter = leftShoulderValid && rightShoulderValid 
      ? (leftShoulder!.x + rightShoulder!.x) / 2 
      : (leftShoulderValid ? leftShoulder!.x : rightShoulder!.x);
    const leftWristX = leftWristValid ? leftWrist!.x : 0;
    const rightWristX = rightWristValid ? rightWrist!.x : 0;
    const leftWristY = leftWristValid ? leftWrist!.y : 999;
    const rightWristY = rightWristValid ? rightWrist!.y : 999;
    const leftElbowX = leftElbowValid ? leftElbow!.x : leftWristX;
    const rightElbowX = rightElbowValid ? rightElbow!.x : rightWristX;

    if (calibrationFrames.current < 20) {
      calibrationFrames.current++;
      if (!baselineRef.current) {
        baselineRef.current = { headX, leftWristX, rightWristX, shoulderY };
      } else {
        baselineRef.current.headX = baselineRef.current.headX * 0.9 + headX * 0.1;
        baselineRef.current.leftWristX = baselineRef.current.leftWristX * 0.9 + leftWristX * 0.1;
        baselineRef.current.rightWristX = baselineRef.current.rightWristX * 0.9 + rightWristX * 0.1;
        baselineRef.current.shoulderY = baselineRef.current.shoulderY * 0.9 + shoulderY * 0.1;
      }
      return;
    }

    const baseline = baselineRef.current;
    if (!baseline) return;

    const frameWidth = videoRef.current?.videoWidth || 640;
    const dodgeThreshold = frameWidth * 0.08;
    const blockThreshold = shoulderY - 30;

    const now = Date.now();
    const MIN_ACTION_INTERVAL = 400;

    if (now - lastActionTimeRef.current < MIN_ACTION_INTERVAL) return;

    const command = currentCommandRef.current;
    if (!command) return;

    let success = false;

    // Dodge detection - head movement
    if (command.type === "dodge_left" && headX > baseline.headX + dodgeThreshold) {
      success = true;
    } else if (command.type === "dodge_right" && headX < baseline.headX - dodgeThreshold) {
      success = true;
    } 
    // Block detection - both arms raised
    else if (command.type === "block" && leftWristY < blockThreshold && rightWristY < blockThreshold) {
      success = true;
    }
    // Punch detection - wrist extends past elbow toward center OR wrist raised to punch height
    else if ((command.type === "jab_left" || command.type === "hook_left") && leftWristValid) {
      // Left punch: wrist moves right (toward center/opponent) past elbow, or wrist raised and extended
      const wristPastElbow = leftWristX > leftElbowX + 20;
      const wristNearCenter = Math.abs(leftWristX - bodyCenter) < frameWidth * 0.15;
      const wristRaised = leftWristY < shoulderY + 50;
      if ((wristPastElbow || wristNearCenter) && wristRaised) {
        success = true;
      }
    }
    else if ((command.type === "jab_right" || command.type === "hook_right") && rightWristValid) {
      // Right punch: wrist moves left (toward center/opponent) past elbow, or wrist raised and extended  
      const wristPastElbow = rightWristX < rightElbowX - 20;
      const wristNearCenter = Math.abs(rightWristX - bodyCenter) < frameWidth * 0.15;
      const wristRaised = rightWristY < shoulderY + 50;
      if ((wristPastElbow || wristNearCenter) && wristRaised) {
        success = true;
      }
    }

    if (success) {
      lastActionTimeRef.current = now;
      handleCommandSuccess(command.type);
    }
  }, []);

  const handleCommandSuccess = useCallback((type: CommandType) => {
    if (commandTimeoutRef.current) {
      clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = null;
    }

    setCommandFeedback("success");
    speak("Nice!");

    if (type.includes("jab") || type.includes("hook")) {
      setPunchesLanded(p => p + 1);
      setScore(s => s + 10);
    } else if (type.includes("dodge")) {
      setDodgesSuccessful(d => d + 1);
      setScore(s => s + 15);
    } else if (type === "block") {
      setBlocksSuccessful(b => b + 1);
      setScore(s => s + 12);
    }

    setCurrentCommand(null);
    setTimeout(() => setCommandFeedback(null), 300);
  }, [speak]);

  const handleCommandMiss = useCallback((type: CommandType) => {
    setCommandFeedback("miss");

    if (type.includes("jab") || type.includes("hook")) {
      setPunchesMissed(p => p + 1);
    } else if (type.includes("dodge")) {
      setDodgesMissed(d => d + 1);
    } else if (type === "block") {
      setBlocksMissed(b => b + 1);
    }

    setCurrentCommand(null);
    setTimeout(() => setCommandFeedback(null), 300);
  }, []);

  const generateCommand = useCallback(() => {
    const commandTypes: CommandType[] = ["jab_left", "jab_right", "hook_left", "hook_right", "dodge_left", "dodge_right", "block"];
    const randomType = commandTypes[Math.floor(Math.random() * commandTypes.length)];
    const command = COMMANDS[randomType];

    setCurrentCommand(command);
    speak(command.label);

    const config = DIFFICULTY_CONFIG[difficulty];
    commandTimeoutRef.current = setTimeout(() => {
      handleCommandMiss(command.type);
    }, config.commandTimeout);
  }, [difficulty, speak, handleCommandMiss]);

  useEffect(() => {
    if (screen !== "round") return;

    const config = DIFFICULTY_CONFIG[difficulty];
    setRoundTime(config.roundTime);

    const timer = setInterval(() => {
      setRoundTime(t => {
        if (t <= 1) {
          clearInterval(timer);
          if (commandIntervalRef.current) clearInterval(commandIntervalRef.current);
          if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);

          if (currentRound < config.rounds) {
            setRestTime(config.restTime);
            setScreen("rest");
          } else {
            endGame(true);
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    const startCommands = setTimeout(() => {
      generateCommand();
      commandIntervalRef.current = setInterval(generateCommand, config.commandInterval);
    }, 1500);

    return () => {
      clearInterval(timer);
      clearTimeout(startCommands);
      if (commandIntervalRef.current) clearInterval(commandIntervalRef.current);
      if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
    };
  }, [screen, currentRound, difficulty, generateCommand]);

  useEffect(() => {
    if (screen !== "rest") return;

    const timer = setInterval(() => {
      setRestTime(t => {
        if (t <= 1) {
          clearInterval(timer);
          setCurrentRound(r => r + 1);
          setCountdown(3);
          setScreen("countdown");
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (screen !== "countdown") return;

    if (countdown > 0) {
      speak(countdown.toString());
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      speak("Fight!");
      setScreen("round");
    }
  }, [screen, countdown, speak]);

  useEffect(() => {
    initCamera();
    return () => stopCamera();
  }, [initCamera, stopCamera]);

  const startGame = (diff: Difficulty) => {
    setDifficulty(diff);
    setCurrentRound(1);
    setScore(0);
    setPunchesLanded(0);
    setPunchesMissed(0);
    setDodgesSuccessful(0);
    setDodgesMissed(0);
    setBlocksSuccessful(0);
    setBlocksMissed(0);
    setCurrentCommand(null);
    calibrationFrames.current = 0;
    baselineRef.current = null;
    gameStartTimeRef.current = Date.now();
    setCountdown(3);
    setScreen("countdown");
  };

  const endGame = useCallback((completed: boolean) => {
    const timePlayed = Math.floor((Date.now() - gameStartTimeRef.current) / 1000);
    const config = DIFFICULTY_CONFIG[difficulty];

    saveSessionMutation.mutate({
      difficulty,
      round: currentRound,
      totalRounds: config.rounds,
      score,
      punchesLanded,
      punchesMissed,
      dodgesSuccessful,
      dodgesMissed,
      blocksSuccessful,
      blocksMissed,
      completed: completed ? 1 : 0,
      timePlayed,
    });

    setScreen("result");
  }, [difficulty, currentRound, score, punchesLanded, punchesMissed, dodgesSuccessful, dodgesMissed, blocksSuccessful, blocksMissed, saveSessionMutation]);

  const config = DIFFICULTY_CONFIG[difficulty];

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 via-red-950/30 to-zinc-900">
      <header className="sticky top-0 z-50 bg-zinc-900/90 border-b border-red-500/30 backdrop-blur">
        <div className="container max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-red-400">Boxing Mode</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="container max-w-6xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          <div className="space-y-4">
            <Card className="overflow-hidden bg-zinc-900/80 border-red-500/30">
              <CardContent className="p-0 relative">
                <div className="relative aspect-video bg-black">
                  <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
                    playsInline
                    muted
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
                  />

                  {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                      <p className="text-red-400">{cameraError}</p>
                    </div>
                  )}

                  {!cameraError && !cameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                      <div className="text-center">
                        <div className="animate-spin w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full mx-auto mb-2" />
                        <p className="text-muted-foreground">Loading camera...</p>
                      </div>
                    </div>
                  )}

                  {screen === "countdown" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <div className="text-center">
                        <p className="text-6xl font-bold text-red-400 animate-pulse">
                          {countdown > 0 ? countdown : "FIGHT!"}
                        </p>
                        <p className="text-xl text-muted-foreground mt-2">Round {currentRound}</p>
                      </div>
                    </div>
                  )}

                  {screen === "round" && currentCommand && (
                    <>
                      {(currentCommand.type === "jab_left" || currentCommand.type === "hook_left") && (
                        <div className={`absolute left-8 top-1/2 -translate-y-1/2 transition-all duration-200 ${
                          commandFeedback === "success" ? "scale-150 opacity-0" : 
                          commandFeedback === "miss" ? "scale-50 opacity-50" : "animate-pulse"
                        }`}>
                          <div className="w-24 h-24 rounded-full bg-blue-500 shadow-[0_0_30px_10px_rgba(59,130,246,0.6)] flex items-center justify-center">
                            <span className="text-white font-bold text-lg">PUNCH</span>
                          </div>
                        </div>
                      )}
                      {(currentCommand.type === "jab_right" || currentCommand.type === "hook_right") && (
                        <div className={`absolute right-8 top-1/2 -translate-y-1/2 transition-all duration-200 ${
                          commandFeedback === "success" ? "scale-150 opacity-0" : 
                          commandFeedback === "miss" ? "scale-50 opacity-50" : "animate-pulse"
                        }`}>
                          <div className="w-24 h-24 rounded-full bg-blue-500 shadow-[0_0_30px_10px_rgba(59,130,246,0.6)] flex items-center justify-center">
                            <span className="text-white font-bold text-lg">PUNCH</span>
                          </div>
                        </div>
                      )}
                      {currentCommand.type === "dodge_left" && (
                        <div className={`absolute left-8 top-1/3 transition-all duration-200 ${
                          commandFeedback === "success" ? "scale-150 opacity-0" : 
                          commandFeedback === "miss" ? "scale-50 opacity-50" : "animate-pulse"
                        }`}>
                          <div className="w-20 h-20 rounded-full bg-red-500 shadow-[0_0_30px_10px_rgba(239,68,68,0.6)] flex items-center justify-center">
                            <span className="text-white font-bold text-sm">DODGE</span>
                          </div>
                          <div className="text-center mt-2 text-white font-bold animate-bounce">← MOVE</div>
                        </div>
                      )}
                      {currentCommand.type === "dodge_right" && (
                        <div className={`absolute right-8 top-1/3 transition-all duration-200 ${
                          commandFeedback === "success" ? "scale-150 opacity-0" : 
                          commandFeedback === "miss" ? "scale-50 opacity-50" : "animate-pulse"
                        }`}>
                          <div className="w-20 h-20 rounded-full bg-red-500 shadow-[0_0_30px_10px_rgba(239,68,68,0.6)] flex items-center justify-center">
                            <span className="text-white font-bold text-sm">DODGE</span>
                          </div>
                          <div className="text-center mt-2 text-white font-bold animate-bounce">MOVE →</div>
                        </div>
                      )}
                      {currentCommand.type === "block" && (
                        <div className={`absolute left-1/2 -translate-x-1/2 top-8 transition-all duration-200 ${
                          commandFeedback === "success" ? "scale-150 opacity-0" : 
                          commandFeedback === "miss" ? "scale-50 opacity-50" : "animate-pulse"
                        }`}>
                          <div className="w-24 h-24 rounded-full bg-red-500 shadow-[0_0_30px_10px_rgba(239,68,68,0.6)] flex items-center justify-center">
                            <span className="text-white font-bold text-lg">BLOCK</span>
                          </div>
                          <div className="text-center mt-2 text-white font-bold">ARMS UP!</div>
                        </div>
                      )}
                    </>
                  )}

                  {screen === "round" && (
                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
                      <Badge variant="outline" className="bg-black/60 text-lg px-4 py-2">
                        <Timer className="w-4 h-4 mr-2" />
                        {Math.floor(roundTime / 60)}:{(roundTime % 60).toString().padStart(2, '0')}
                      </Badge>
                      <Badge variant="outline" className="bg-black/60 text-lg px-4 py-2">
                        Round {currentRound}/{config.rounds}
                      </Badge>
                      <Badge variant="outline" className="bg-black/60 text-lg px-4 py-2">
                        <Trophy className="w-4 h-4 mr-2" />
                        {score}
                      </Badge>
                    </div>
                  )}

                  {screen === "rest" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                      <div className="text-center">
                        <p className="text-2xl text-muted-foreground mb-2">REST</p>
                        <p className="text-6xl font-bold text-blue-400">{restTime}</p>
                        <p className="text-lg text-muted-foreground mt-4">Next: Round {currentRound + 1}</p>
                      </div>
                    </div>
                  )}

                  {screen === "result" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                      <div className="text-center space-y-4">
                        <Trophy className="w-16 h-16 text-yellow-400 mx-auto" />
                        <p className="text-4xl font-bold">Training Complete!</p>
                        <p className="text-5xl font-bold text-red-400">{score} pts</p>
                        <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                          <div>
                            <p className="text-green-400">{punchesLanded}</p>
                            <p className="text-muted-foreground">Punches Hit</p>
                          </div>
                          <div>
                            <p className="text-green-400">{dodgesSuccessful}</p>
                            <p className="text-muted-foreground">Dodges</p>
                          </div>
                          <div>
                            <p className="text-green-400">{blocksSuccessful}</p>
                            <p className="text-muted-foreground">Blocks</p>
                          </div>
                        </div>
                        <div className="flex gap-4 justify-center mt-6">
                          <Button onClick={() => setScreen("menu")} variant="outline" data-testid="button-menu-return">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Menu
                          </Button>
                          <Button onClick={() => startGame(difficulty)} data-testid="button-play-again">
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Play Again
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {screen === "menu" && (
              <Card className="bg-zinc-900/80 border-red-500/30">
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4 text-center">Select Difficulty</h2>
                  <div className="grid grid-cols-3 gap-4">
                    {(["easy", "medium", "hard"] as Difficulty[]).map((diff) => (
                      <Button
                        key={diff}
                        variant={difficulty === diff ? "default" : "outline"}
                        className="h-20 flex-col"
                        onClick={() => startGame(diff)}
                        data-testid={`button-difficulty-${diff}`}
                      >
                        <span className="text-lg font-bold capitalize">{diff}</span>
                        <span className="text-xs text-muted-foreground">
                          {DIFFICULTY_CONFIG[diff].rounds} rounds
                        </span>
                      </Button>
                    ))}
                  </div>

                  <div className="mt-6 p-4 bg-zinc-800/50 rounded-lg">
                    <h3 className="font-semibold mb-2">How to Play</h3>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-blue-500 inline-block"></span>
                        <strong>BLUE SPOT:</strong> Punch it with the hand on that side
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-red-500 inline-block"></span>
                        <strong>RED SPOT:</strong> Dodge away or block (arms up)
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card className="bg-zinc-900/80 border-red-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-3 h-3 rounded-full ${bodyDetected ? "bg-green-500" : "bg-red-500"}`} />
                  <span className="text-sm">{bodyDetected ? "Body Detected" : "No Body"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${cameraReady ? "bg-green-500" : "bg-yellow-500"}`} />
                  <span className="text-sm">{cameraReady ? "Camera Ready" : "Loading..."}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-red-500/30">
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  Session History
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sessions?.slice(0, 5).map((session) => (
                    <div key={session.id} className="flex justify-between items-center text-sm p-2 bg-zinc-800/50 rounded">
                      <div>
                        <span className="capitalize">{session.difficulty}</span>
                        <span className="text-muted-foreground ml-2">
                          R{session.round}/{session.totalRounds}
                        </span>
                      </div>
                      <Badge variant={session.completed ? "default" : "secondary"}>
                        {session.score} pts
                      </Badge>
                    </div>
                  ))}
                  {(!sessions || sessions.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No sessions yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );

  function drawSkeleton(keypoints: poseDetection.Keypoint[], canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const connections = [
      ["left_shoulder", "right_shoulder"],
      ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
      ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
      ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
      ["left_hip", "right_hip"],
    ];

    const getPoint = (name: string) => keypoints.find(k => k.name === name);

    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;

    connections.forEach(([a, b]) => {
      const p1 = getPoint(a);
      const p2 = getPoint(b);
      if (p1 && p2 && (p1.score ?? 0) > 0.2 && (p2.score ?? 0) > 0.2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    });

    keypoints.forEach(kp => {
      if ((kp.score ?? 0) > 0.2) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
      }
    });
  }
}
