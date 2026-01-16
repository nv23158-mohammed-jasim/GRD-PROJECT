import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  Play,
  Target,
  Zap,
  History,
  AlertTriangle,
} from "lucide-react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
import type { SpecialSession } from "@shared/schema";

// Level configurations
const LEVELS = [
  { level: 1, ballTime: 3000, targetHits: 5 },   // 3s to hit, need 5 hits
  { level: 2, ballTime: 2500, targetHits: 8 },   // 2.5s, need 8 hits
  { level: 3, ballTime: 2000, targetHits: 12 },  // 2s, need 12 hits
  { level: 4, ballTime: 1800, targetHits: 15 },  // 1.8s, need 15 hits
  { level: 5, ballTime: 1500, targetHits: 20 },  // 1.5s, need 20 hits
];

type Screen = "menu" | "level-select" | "countdown" | "playing" | "result";

interface Ball {
  id: number;
  x: number;
  y: number;
  targetY: number;
  speed: number;
  active: boolean;
  timeLeft: number;
}

export default function SpecialModePage() {
  const [, setLocation] = useLocation();
  const [screen, setScreen] = useState<Screen>("menu");
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [countdown, setCountdown] = useState(3);
  
  // Game state
  const [ballsHit, setBallsHit] = useState(0);
  const [ballsMissed, setBallsMissed] = useState(0);
  const [currentBall, setCurrentBall] = useState<Ball | null>(null);
  const [ballY, setBallY] = useState(0); // Animated ball Y position (0-100%)
  const [gameResult, setGameResult] = useState<"win" | "lose" | null>(null);
  const gameStartTimeRef = useRef(0);
  const ballIdRef = useRef(0);
  const ballTimeoutRef = useRef<number | null>(null);
  const ballAnimationRef = useRef<number | null>(null);
  const ballStartTimeRef = useRef(0);
  
  // Pose detection state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [bodyDetected, setBodyDetected] = useState(false);
  const [isSitupDown, setIsSitupDown] = useState(false);
  
  // Situp detection state
  const situpPhaseRef = useRef<"up" | "down">("up");
  const lastSitupTimeRef = useRef(0);
  const baselineRatioRef = useRef<number | null>(null);
  const calibrationCountRef = useRef(0);
  const hasCompletedCycleRef = useRef(false); // Require one full cycle before counting hits
  
  // Audio feedback
  const speak = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.2;
      utterance.volume = 0.8;
      speechSynthesis.speak(utterance);
    }
  }, []);

  // Fetch history
  const { data: specialSessions = [], isLoading: historyLoading } = useQuery<SpecialSession[]>({
    queryKey: ["/api/special-sessions"],
  });

  // Save session mutation
  const saveSessionMutation = useMutation({
    mutationFn: async (data: {
      level: number;
      ballsHit: number;
      ballsMissed: number;
      targetHits: number;
      completed: number;
      timePlayed: number;
    }) => {
      return apiRequest("POST", "/api/special-sessions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/special-sessions"] });
    },
  });

  // Initialize camera and pose detection
  const initCamera = useCallback(async () => {
    try {
      setCameraError(null);
      
      await tf.ready();
      await tf.setBackend("webgl");
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;
          video.onloadedmetadata = () => video.play().then(resolve).catch(reject);
          video.onerror = () => reject(new Error("Video failed"));
        });
      }
      
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );
      
      detectorRef.current = detector;
      setCameraReady(true);
      isRunningRef.current = true;
      runDetection();
      
    } catch (err: any) {
      let message = "Failed to start camera.";
      if (err.name === "NotAllowedError") message = "Camera access denied.";
      else if (err.name === "NotFoundError") message = "No camera found.";
      setCameraError(message);
    }
  }, []);

  // Stop camera
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

  // Situp detection for sideways body position
  // User lies on their side facing the camera. During a situp, shoulder moves UP (y decreases) relative to hip
  const processPose = useCallback((keypoints: poseDetection.Keypoint[]) => {
    if (screen !== "playing") return;
    
    const minConfidence = 0.3;
    
    // Get keypoints - for sideways situps we need shoulder and hip
    const leftShoulder = keypoints.find(k => k.name === "left_shoulder");
    const rightShoulder = keypoints.find(k => k.name === "right_shoulder");
    const shoulder = (leftShoulder && (leftShoulder.score ?? 0) > minConfidence) ? leftShoulder :
                     (rightShoulder && (rightShoulder.score ?? 0) > minConfidence) ? rightShoulder : null;
    
    const leftHip = keypoints.find(k => k.name === "left_hip");
    const rightHip = keypoints.find(k => k.name === "right_hip");
    const hip = (leftHip && (leftHip.score ?? 0) > minConfidence) ? leftHip :
                (rightHip && (rightHip.score ?? 0) > minConfidence) ? rightHip : null;
    
    // Also get nose for alternative detection
    const nose = keypoints.find(k => k.name === "nose");
    const noseValid = nose && (nose.score ?? 0) > minConfidence;
    
    const shoulderValid = shoulder !== null;
    const hipValid = hip !== null;
    
    if (!shoulderValid || !hipValid) {
      setBodyDetected(false);
      return;
    }
    
    setBodyDetected(true);
    
    // Use shoulder Y position relative to hip Y
    // When lying down sideways: shoulder and hip are at similar Y
    // When sitting up: shoulder moves UP (lower Y value in screen coords)
    const shoulderY = shoulder!.y;
    const hipY = hip!.y;
    const frameHeight = videoRef.current?.videoHeight || 480;
    
    // Normalize by frame height for consistency
    const normalizedShoulderY = shoulderY / frameHeight;
    const normalizedHipY = hipY / frameHeight;
    
    // Calibrate baseline (resting position - shoulder at similar level or below hip)
    if (calibrationCountRef.current < 20) {
      calibrationCountRef.current++;
      const currentRatio = normalizedShoulderY - normalizedHipY;
      if (baselineRatioRef.current === null) {
        baselineRatioRef.current = currentRatio;
      } else {
        // Average the baseline
        baselineRatioRef.current = baselineRatioRef.current * 0.9 + currentRatio * 0.1;
      }
      return;
    }
    
    // Current shoulder position relative to hip
    const currentRatio = normalizedShoulderY - normalizedHipY;
    const baseline = baselineRatioRef.current || 0;
    
    // When sitting up from sideways: shoulder moves UP (Y decreases), so currentRatio becomes more negative
    // Change = baseline - currentRatio (positive when sitting up)
    const change = baseline - currentRatio;
    
    // Thresholds - sitting up should show shoulder rising relative to hip
    const situpThreshold = 0.08;   // Shoulder moved up this much relative to baseline
    const restThreshold = 0.03;    // Back to resting position
    
    const now = Date.now();
    const MIN_SITUP_INTERVAL = 500;
    
    // Phase: "up" means resting (lying down), "down" means in situp position (torso raised)
    if (situpPhaseRef.current === "up" && change > situpThreshold) {
      // User is sitting up
      situpPhaseRef.current = "down";
      setIsSitupDown(true);
      
      // HIT THE BALL when user sits up (only after completing first cycle to avoid calibration issues)
      if (hasCompletedCycleRef.current && currentBall?.active && now - lastSitupTimeRef.current >= MIN_SITUP_INTERVAL) {
        lastSitupTimeRef.current = now;
        setBallsHit(prev => prev + 1);
        speak("Hit!");
        setCurrentBall(null);
        if (ballTimeoutRef.current) {
          clearTimeout(ballTimeoutRef.current);
          ballTimeoutRef.current = null;
        }
      }
    } else if (situpPhaseRef.current === "down" && change < restThreshold) {
      // User returned to resting position - this completes a cycle
      situpPhaseRef.current = "up";
      setIsSitupDown(false);
      hasCompletedCycleRef.current = true; // Now we know the user can do situps correctly
    }
  }, [screen, currentBall, speak]);

  // Draw skeleton
  const drawSkeleton = useCallback((keypoints: poseDetection.Keypoint[], canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const connections = [
      ["left_shoulder", "right_shoulder"],
      ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
      ["left_hip", "right_hip"],
      ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
      ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
      ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
      ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
    ];
    
    const getPoint = (name: string) => keypoints.find(k => k.name === name);
    
    ctx.strokeStyle = "#00ffff";
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
        ctx.fillStyle = (kp.score ?? 0) > 0.5 ? "#00ff00" : "#ffff00";
        ctx.fill();
      }
    });
  }, []);

  // Detection loop
  const runDetection = useCallback(async () => {
    if (!isRunningRef.current) return;
    if (!detectorRef.current || !videoRef.current || !canvasRef.current) {
      animationFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }
    
    const video = videoRef.current;
    if (video.readyState >= 2) {
      try {
        const poses = await detectorRef.current.estimatePoses(video);
        if (poses.length > 0 && poses[0].keypoints) {
          drawSkeleton(poses[0].keypoints, canvasRef.current!, video);
          processPose(poses[0].keypoints);
        } else {
          setBodyDetected(false);
        }
      } catch (e) {
        console.error("Detection error:", e);
      }
    }
    
    animationFrameRef.current = requestAnimationFrame(runDetection);
  }, [drawSkeleton, processPose]);

  // Spawn a new ball
  const spawnBall = useCallback(() => {
    if (screen !== "playing") return;
    
    const levelConfig = LEVELS[selectedLevel - 1];
    
    ballIdRef.current++;
    const newBall: Ball = {
      id: ballIdRef.current,
      x: Math.random() * 60 + 20, // 20-80% of width
      y: 0,
      targetY: 80,
      speed: 80 / (levelConfig.ballTime / 1000), // Pixels per second to travel
      active: true,
      timeLeft: levelConfig.ballTime,
    };
    
    setCurrentBall(newBall);
    setBallY(0);
    ballStartTimeRef.current = Date.now();
    speak("Ball!");
    
    // Set timeout for missed ball
    ballTimeoutRef.current = window.setTimeout(() => {
      setCurrentBall(prev => {
        if (prev?.id === newBall.id && prev.active) {
          setBallsMissed(m => m + 1);
          speak("Miss!");
          return null;
        }
        return prev;
      });
    }, levelConfig.ballTime);
  }, [screen, selectedLevel, speak]);

  // Ball animation loop
  useEffect(() => {
    if (screen !== "playing" || !currentBall?.active) {
      if (ballAnimationRef.current) {
        cancelAnimationFrame(ballAnimationRef.current);
        ballAnimationRef.current = null;
      }
      return;
    }
    
    const levelConfig = LEVELS[selectedLevel - 1];
    const duration = levelConfig.ballTime;
    
    const animateBall = () => {
      const elapsed = Date.now() - ballStartTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-in animation (ball accelerates as it falls)
      const easedProgress = progress * progress;
      const newY = easedProgress * 80; // Animate from 0 to 80%
      setBallY(newY);
      
      if (progress < 1 && currentBall?.active) {
        ballAnimationRef.current = requestAnimationFrame(animateBall);
      }
    };
    
    ballAnimationRef.current = requestAnimationFrame(animateBall);
    
    return () => {
      if (ballAnimationRef.current) {
        cancelAnimationFrame(ballAnimationRef.current);
      }
    };
  }, [screen, currentBall, selectedLevel]);

  // Game loop - spawn balls
  useEffect(() => {
    if (screen !== "playing") return;
    
    const levelConfig = LEVELS[selectedLevel - 1];
    
    // Spawn first ball after a short delay
    const initialDelay = setTimeout(() => {
      spawnBall();
    }, 1000);
    
    // Spawn balls periodically
    const spawnInterval = setInterval(() => {
      if (!currentBall) {
        spawnBall();
      }
    }, levelConfig.ballTime + 500);
    
    return () => {
      clearTimeout(initialDelay);
      clearInterval(spawnInterval);
      if (ballTimeoutRef.current) clearTimeout(ballTimeoutRef.current);
    };
  }, [screen, selectedLevel, currentBall, spawnBall]);

  // Check win/lose conditions
  useEffect(() => {
    if (screen !== "playing") return;
    
    const levelConfig = LEVELS[selectedLevel - 1];
    
    // Lose condition: 10 missed balls
    if (ballsMissed >= 10) {
      const timePlayed = Math.floor((Date.now() - gameStartTimeRef.current) / 1000);
      setGameResult("lose");
      setScreen("result");
      speak("Game over!");
      
      saveSessionMutation.mutate({
        level: selectedLevel,
        ballsHit,
        ballsMissed,
        targetHits: levelConfig.targetHits,
        completed: 0,
        timePlayed,
      });
    }
    
    // Win condition: hit target number of balls
    if (ballsHit >= levelConfig.targetHits) {
      const timePlayed = Math.floor((Date.now() - gameStartTimeRef.current) / 1000);
      setGameResult("win");
      setScreen("result");
      speak("Level complete!");
      
      saveSessionMutation.mutate({
        level: selectedLevel,
        ballsHit,
        ballsMissed,
        targetHits: levelConfig.targetHits,
        completed: 1,
        timePlayed,
      });
    }
  }, [screen, ballsHit, ballsMissed, selectedLevel, speak, saveSessionMutation]);

  // Countdown effect
  useEffect(() => {
    if (screen !== "countdown") return;
    
    if (countdown > 0) {
      speak(countdown.toString());
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      speak("Go!");
      gameStartTimeRef.current = Date.now();
      setScreen("playing");
    }
  }, [screen, countdown, speak]);

  // Initialize camera on mount
  useEffect(() => {
    initCamera();
    return () => stopCamera();
  }, [initCamera, stopCamera]);

  // Start game
  const startGame = (level: number) => {
    setSelectedLevel(level);
    setBallsHit(0);
    setBallsMissed(0);
    setCurrentBall(null);
    setGameResult(null);
    setCountdown(3);
    calibrationCountRef.current = 0;
    baselineRatioRef.current = null;
    situpPhaseRef.current = "up";
    hasCompletedCycleRef.current = false; // Reset cycle requirement for new game
    setScreen("countdown");
  };

  // Ball animation component
  const levelConfig = LEVELS[selectedLevel - 1];

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 via-purple-950 to-zinc-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-zinc-900/90 border-b border-purple-500/30 backdrop-blur">
        <div className="container max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-purple-400">Special Mode</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="container max-w-6xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          {/* Main game area */}
          <div className="space-y-4">
            {/* Game Canvas */}
            <Card className="relative overflow-hidden bg-black aspect-video">
              {screen === "menu" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-purple-900/50 to-black/80 z-10">
                  <Zap className="w-20 h-20 text-yellow-400 mb-4" />
                  <h2 className="text-3xl font-bold text-white mb-2">Special Mode</h2>
                  <p className="text-purple-300 mb-6 text-center px-4">
                    Situp Ball Challenge - Hit balls with your situps!
                  </p>
                  <Button
                    size="lg"
                    className="bg-purple-600 hover:bg-purple-700"
                    onClick={() => setScreen("level-select")}
                    data-testid="button-start-special"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    Start Game
                  </Button>
                </div>
              )}

              {screen === "level-select" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-purple-900/50 to-black/80 z-10 p-6">
                  <h2 className="text-2xl font-bold text-white mb-6">Select Level</h2>
                  <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                    {LEVELS.map((lvl) => (
                      <Button
                        key={lvl.level}
                        variant="outline"
                        className="h-20 flex-col border-purple-500/50 hover:bg-purple-900/50"
                        onClick={() => startGame(lvl.level)}
                        data-testid={`button-level-${lvl.level}`}
                      >
                        <span className="text-xl font-bold">Level {lvl.level}</span>
                        <span className="text-xs text-muted-foreground">
                          Target: {lvl.targetHits} hits | {lvl.ballTime / 1000}s/ball
                        </span>
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    className="mt-4"
                    onClick={() => setScreen("menu")}
                    data-testid="button-back-to-menu"
                  >
                    Back
                  </Button>
                </div>
              )}

              {screen === "countdown" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                  <div className="text-8xl font-bold text-purple-400 animate-pulse">
                    {countdown || "GO!"}
                  </div>
                </div>
              )}

              {screen === "result" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-purple-900/50 to-black/80 z-10 p-6">
                  {gameResult === "win" ? (
                    <>
                      <Target className="w-20 h-20 text-green-400 mb-4" />
                      <h2 className="text-3xl font-bold text-green-400 mb-2">Level Complete!</h2>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-20 h-20 text-red-400 mb-4" />
                      <h2 className="text-3xl font-bold text-red-400 mb-2">Game Over</h2>
                    </>
                  )}
                  <p className="text-white text-lg mb-2">
                    Balls Hit: {ballsHit} / {levelConfig.targetHits}
                  </p>
                  <p className="text-muted-foreground mb-6">
                    Missed: {ballsMissed}
                  </p>
                  <div className="flex gap-4">
                    <Button
                      onClick={() => startGame(selectedLevel)}
                      data-testid="button-retry"
                    >
                      Try Again
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setScreen("level-select")}
                      data-testid="button-level-select-result"
                    >
                      Change Level
                    </Button>
                  </div>
                </div>
              )}

              {/* Game playing state - show ball */}
              {screen === "playing" && (
                <div className="absolute inset-0 pointer-events-none z-10">
                  {/* HUD */}
                  <div className="absolute top-4 left-4 right-4 flex justify-between text-white">
                    <div className="bg-black/50 px-3 py-1 rounded">
                      <span className="text-green-400">Hits: {ballsHit}/{levelConfig.targetHits}</span>
                    </div>
                    <div className="bg-black/50 px-3 py-1 rounded">
                      <span className="text-red-400">Missed: {ballsMissed}/10</span>
                    </div>
                  </div>
                  
                  {/* Ball */}
                  {currentBall?.active && (
                    <div
                      className="absolute w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg shadow-yellow-500/50"
                      style={{
                        left: `${currentBall.x}%`,
                        top: `${5 + ballY}%`,
                        transform: "translateX(-50%)",
                        transition: "none",
                      }}
                      data-testid="ball-active"
                    >
                      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-white/50 to-transparent" />
                    </div>
                  )}
                  
                  {/* Situp indicator */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 px-4 py-2 rounded-lg">
                    <span className={`font-bold ${isSitupDown ? "text-green-400" : "text-white"}`}>
                      {isSitupDown ? "UP! ↑" : "DO SITUP ↓"}
                    </span>
                  </div>
                </div>
              )}

              {/* Camera feed */}
              <div className="relative w-full h-full">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full scale-x-[-1]"
                />
                
                {!cameraReady && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <p className="text-white">Loading camera...</p>
                  </div>
                )}
                
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <p className="text-red-400 text-center p-4">{cameraError}</p>
                  </div>
                )}
                
                {cameraReady && screen === "playing" && (
                  <div
                    className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-bold ${
                      bodyDetected ? "bg-green-500" : "bg-red-500"
                    }`}
                    data-testid="status-body-detection"
                  >
                    {bodyDetected ? "Body Detected" : "Get in Frame (Side View)"}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3">How to Play</h3>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">1.</span>
                  Position yourself sideways to the camera
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">2.</span>
                  Lie down for situps position
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">3.</span>
                  When a ball appears, do a situp to hit it
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">4.</span>
                  Hit the target number of balls to win
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">5.</span>
                  Miss 10 balls and it's game over
                </li>
              </ul>
            </Card>

            <Card className="p-4" data-testid="card-special-history">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <History className="w-4 h-4" />
                Game History
              </h3>
              {historyLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : specialSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No games played yet</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {specialSessions.slice(0, 10).map((session) => (
                    <div
                      key={session.id}
                      className={`flex items-center justify-between text-sm p-2 rounded ${
                        session.completed ? "bg-green-500/10" : "bg-red-500/10"
                      }`}
                      data-testid={`special-session-${session.id}`}
                    >
                      <div>
                        <span className="font-medium">Level {session.level}</span>
                      </div>
                      <div className="text-right">
                        <span className={session.completed ? "text-green-500" : "text-red-500"}>
                          {session.ballsHit}/{session.targetHits}
                        </span>
                        <span className="text-muted-foreground ml-2">{session.timePlayed}s</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
