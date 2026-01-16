import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Volume2, VolumeX, Play, RotateCcw, Lock, CheckCircle, Trophy, History } from "lucide-react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { GameSession } from "@shared/schema";

// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 450;
const GROUND_Y = 380;
const PLAYER_SIZE = 60;

type Difficulty = "easy" | "medium" | "hard";
type GameScreen = "menu" | "stage-select" | "playing" | "pushup-challenge" | "game-over" | "stage-complete";

interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  speedX: number;
  speedY: number;
  type: "walker" | "flyer" | "bouncer";
  color: string;
}

interface DifficultySettings {
  name: string;
  baseSpeed: number;
  enemySpawnRate: number;
  damage: number;
  color: string;
}

const DIFFICULTIES: Record<Difficulty, DifficultySettings> = {
  easy: { name: "Easy", baseSpeed: 3, enemySpawnRate: 3000, damage: 10, color: "#44ff44" },
  medium: { name: "Medium", baseSpeed: 5, enemySpawnRate: 2000, damage: 15, color: "#ffaa00" },
  hard: { name: "Hard", baseSpeed: 7, enemySpawnRate: 1200, damage: 25, color: "#ff4466" },
};

interface StageData {
  id: number;
  name: string;
  targetScore: number;
  enemyTypes: Enemy["type"][];
  bgColor1: string;
  bgColor2: string;
}

const STAGES: StageData[] = [
  { id: 1, name: "Neon City", targetScore: 500, enemyTypes: ["walker"], bgColor1: "#1a0a2e", bgColor2: "#4a2c6e" },
  { id: 2, name: "Sky Gardens", targetScore: 1000, enemyTypes: ["walker", "flyer"], bgColor1: "#0a2e1a", bgColor2: "#2e6e4a" },
  { id: 3, name: "Fire Valley", targetScore: 1500, enemyTypes: ["walker", "flyer", "bouncer"], bgColor1: "#2e0a0a", bgColor2: "#6e2a2a" },
  { id: 4, name: "Ice Peaks", targetScore: 2000, enemyTypes: ["walker", "flyer", "bouncer"], bgColor1: "#0a1a2e", bgColor2: "#2a4a6e" },
  { id: 5, name: "Final Zone", targetScore: 3000, enemyTypes: ["walker", "flyer", "bouncer"], bgColor1: "#2e1a2e", bgColor2: "#6e4a6e" },
];

export default function GamePage() {
  const [, setLocation] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Game state
  const [screen, setScreen] = useState<GameScreen>("menu");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [selectedStage, setSelectedStage] = useState(1);
  const [unlockedStages, setUnlockedStages] = useState<number[]>([1]);
  const [completedStages, setCompletedStages] = useState<number[]>([]);
  
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(100);
  const [pushupCount, setPushupCount] = useState(0);
  const [pushupTimeLeft, setPushupTimeLeft] = useState(30);
  
  // Pose detection state
  const [isJogging, setIsJogging] = useState(false);
  const [isJumping, setIsJumping] = useState(false);
  const [isPushup, setIsPushup] = useState(false);
  const [bodyDetected, setBodyDetected] = useState(false);
  
  // Game refs
  const playerYRef = useRef(GROUND_Y - PLAYER_SIZE);
  const playerVelocityRef = useRef(0);
  const isJumpingRef = useRef(false);
  const enemiesRef = useRef<Enemy[]>([]);
  const distanceRef = useRef(0);
  const lastEnemyRef = useRef(0);
  const healthRef = useRef(100);
  const scoreRef = useRef(0);
  const gameStartTimeRef = useRef<number>(0);
  
  // Game history
  const { data: gameSessions = [], isLoading: historyLoading } = useQuery<GameSession[]>({
    queryKey: ["/api/game-sessions"],
  });
  
  const saveGameMutation = useMutation({
    mutationFn: async (session: {
      difficulty: string;
      stage: number;
      score: number;
      targetScore: number;
      completed: number;
      timePlayed: number;
    }) => {
      return apiRequest("/api/game-sessions", { method: "POST", body: JSON.stringify(session) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/game-sessions"] });
    },
  });

  // Speak function
  const speak = useCallback((text: string) => {
    if (!audioEnabled) return;
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.2;
        synth.speak(u);
      }
    } catch (e) { /* ignore */ }
  }, [audioEnabled]);

  // Load progress from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("neonrun-progress");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setUnlockedStages(data.unlocked || [1]);
        setCompletedStages(data.completed || []);
      } catch (e) { /* ignore */ }
    }
  }, []);

  // Save progress
  const saveProgress = useCallback((unlocked: number[], completed: number[]) => {
    localStorage.setItem("neonrun-progress", JSON.stringify({ unlocked, completed }));
  }, []);

  // Initialize camera and pose detection
  useEffect(() => {
    let mounted = true;
    
    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 320, height: 240 }
        });
        
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        
        await tf.setBackend("webgl");
        await tf.ready();
        
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
        );
        
        if (!mounted) return;
        detectorRef.current = detector;
        setCameraReady(true);
        
      } catch (err) {
        if (mounted) {
          setCameraError("Camera needed. Open in new browser tab.");
        }
      }
    }
    
    init();
    
    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Pose detection loop
  useEffect(() => {
    if (!cameraReady) return;
    
    let running = true;
    const calibration = { shoulderY: 0, hipY: 0, calibrated: false, frames: 0 };
    const jogHistory: number[] = [];
    const pushupState = { wasDown: false };
    
    async function detectPose() {
      if (!running || !detectorRef.current || !videoRef.current) return;
      
      try {
        const poses = await detectorRef.current.estimatePoses(videoRef.current);
        
        if (poses.length > 0 && poses[0].keypoints) {
          const kps = poses[0].keypoints;
          setBodyDetected(true);
          
          const getPoint = (name: string) => {
            const kp = kps.find(k => k.name === name);
            return kp && (kp.score ?? 0) > 0.3 ? { x: kp.x, y: kp.y } : null;
          };
          
          const lShoulder = getPoint("left_shoulder");
          const rShoulder = getPoint("right_shoulder");
          const lHip = getPoint("left_hip");
          const rHip = getPoint("right_hip");
          const lWrist = getPoint("left_wrist");
          const rWrist = getPoint("right_wrist");
          const lElbow = getPoint("left_elbow");
          const rElbow = getPoint("right_elbow");
          
          const shoulderY = lShoulder && rShoulder ? (lShoulder.y + rShoulder.y) / 2 : 
                           lShoulder?.y || rShoulder?.y || null;
          const hipY = lHip && rHip ? (lHip.y + rHip.y) / 2 : lHip?.y || rHip?.y || null;
          const wristY = lWrist && rWrist ? Math.min(lWrist.y, rWrist.y) : lWrist?.y || rWrist?.y || null;
          
          if (shoulderY !== null && hipY !== null) {
            // Calibration
            if (!calibration.calibrated && calibration.frames < 20) {
              calibration.frames++;
              if (calibration.shoulderY === 0 || shoulderY < calibration.shoulderY) {
                calibration.shoulderY = shoulderY;
                calibration.hipY = hipY;
              }
              if (calibration.frames >= 20) calibration.calibrated = true;
            }
            
            if (calibration.calibrated) {
              // JOGGING: Track vertical oscillation
              jogHistory.push(shoulderY);
              if (jogHistory.length > 15) jogHistory.shift();
              
              if (jogHistory.length >= 10) {
                let oscillation = 0;
                for (let i = 1; i < jogHistory.length; i++) {
                  oscillation += Math.abs(jogHistory[i] - jogHistory[i - 1]);
                }
                setIsJogging(oscillation > 25);
              }
              
              // JUMPING: Arms raised high
              const jumping = wristY !== null && wristY < shoulderY - 50;
              setIsJumping(jumping);
              
              // PUSHUP: Detect arm bend with body low
              const calcAngle = (p1: {x:number,y:number}, p2: {x:number,y:number}, p3: {x:number,y:number}) => {
                const rad = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
                let angle = Math.abs((rad * 180) / Math.PI);
                return angle > 180 ? 360 - angle : angle;
              };
              
              let elbowAngle = 180;
              if (lShoulder && lElbow && lWrist) {
                elbowAngle = calcAngle(lShoulder, lElbow, lWrist);
              } else if (rShoulder && rElbow && rWrist) {
                elbowAngle = calcAngle(rShoulder, rElbow, rWrist);
              }
              
              const isDown = elbowAngle < 100 && shoulderY > calibration.shoulderY + 30;
              const isUp = elbowAngle > 140;
              
              if (isDown && !pushupState.wasDown) {
                pushupState.wasDown = true;
              } else if (isUp && pushupState.wasDown) {
                pushupState.wasDown = false;
                // Signal pushup completed (will be handled by effect with cooldown)
                setIsPushup(true);
              }
            }
          }
        } else {
          setBodyDetected(false);
        }
      } catch (e) { /* ignore */ }
      
      if (running) requestAnimationFrame(detectPose);
    }
    
    detectPose();
    return () => { running = false; };
  }, [cameraReady]);

  // Main game loop
  useEffect(() => {
    if (screen !== "playing") return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const settings = DIFFICULTIES[difficulty];
    const stageData = STAGES[selectedStage - 1];
    let running = true;
    
    function createEnemy(): Enemy {
      const types = stageData.enemyTypes;
      const type = types[Math.floor(Math.random() * types.length)];
      
      const baseEnemy = {
        x: GAME_WIDTH + 50,
        width: 50,
        height: 50,
        color: "#ff4466",
      };
      
      if (type === "walker") {
        return {
          ...baseEnemy,
          y: GROUND_Y - 50,
          speedX: settings.baseSpeed * 0.8 + Math.random() * 2,
          speedY: 0,
          type: "walker",
          color: "#ff4466",
        };
      } else if (type === "flyer") {
        return {
          ...baseEnemy,
          y: 150 + Math.random() * 100,
          width: 45,
          height: 35,
          speedX: settings.baseSpeed * 0.6 + Math.random() * 1.5,
          speedY: Math.sin(Math.random() * Math.PI * 2) * 2,
          type: "flyer",
          color: "#ff66aa",
        };
      } else {
        return {
          ...baseEnemy,
          y: GROUND_Y - 60,
          speedX: settings.baseSpeed * 0.5 + Math.random(),
          speedY: -8,
          type: "bouncer",
          color: "#ff8844",
        };
      }
    }
    
    function gameLoop() {
      if (!running || !ctx) return;
      
      // Update player
      if (isJumping && !isJumpingRef.current && playerYRef.current >= GROUND_Y - PLAYER_SIZE - 5) {
        playerVelocityRef.current = -16;
        isJumpingRef.current = true;
      }
      
      playerVelocityRef.current += 0.7;
      playerYRef.current += playerVelocityRef.current;
      
      if (playerYRef.current >= GROUND_Y - PLAYER_SIZE) {
        playerYRef.current = GROUND_Y - PLAYER_SIZE;
        playerVelocityRef.current = 0;
        isJumpingRef.current = false;
      }
      
      // Score and spawn enemies only when jogging, but enemies always move
      if (isJogging) {
        distanceRef.current += settings.baseSpeed;
        scoreRef.current += 1;
        setScore(scoreRef.current);
        
        // Spawn enemies only when jogging
        if (distanceRef.current - lastEnemyRef.current > settings.enemySpawnRate / 10) {
          enemiesRef.current.push(createEnemy());
          lastEnemyRef.current = distanceRef.current;
        }
      }
      
      // Update enemies - always move them to prevent freezing in front of player
      const playerX = 100;
      let wasHit = false;
      
      enemiesRef.current = enemiesRef.current.filter(enemy => {
        // Enemies always move (at reduced speed when player stopped)
        const moveSpeed = isJogging ? enemy.speedX : enemy.speedX * 0.5;
        enemy.x -= moveSpeed;
        
        // Special movement
        if (enemy.type === "flyer") {
          enemy.y += Math.sin(Date.now() / 200 + enemy.x) * 1.5;
        } else if (enemy.type === "bouncer") {
          enemy.speedY += 0.5;
          enemy.y += enemy.speedY;
          if (enemy.y >= GROUND_Y - enemy.height) {
            enemy.y = GROUND_Y - enemy.height;
            enemy.speedY = -10 - Math.random() * 4;
          }
        }
        
        // Collision check
        const px = playerX, py = playerYRef.current, pw = PLAYER_SIZE, ph = PLAYER_SIZE;
        const ex = enemy.x, ey = enemy.y, ew = enemy.width, eh = enemy.height;
        
        if (px + pw - 15 > ex && px + 15 < ex + ew && py + ph - 10 > ey && py + 10 < ey + eh) {
          wasHit = true;
          return false;
        }
        
        return enemy.x > -enemy.width;
      });
      
      if (wasHit) {
        healthRef.current = Math.max(0, healthRef.current - settings.damage);
        setHealth(healthRef.current);
        
        if (healthRef.current <= 0) {
          running = false;
          setScreen("pushup-challenge");
          setPushupCount(0);
          setPushupTimeLeft(30);
          speak("Do 10 pushups to continue!");
          return;
        }
      }
      
      // Check stage complete
      if (scoreRef.current >= stageData.targetScore) {
        running = false;
        
        // Compute final unlocked and completed arrays once
        const nextStage = selectedStage + 1;
        const newUnlocked = nextStage <= STAGES.length && !unlockedStages.includes(nextStage) 
          ? [...unlockedStages, nextStage] 
          : unlockedStages;
        const newCompleted = !completedStages.includes(selectedStage)
          ? [...completedStages, selectedStage]
          : completedStages;
        
        // Update state and save once
        setUnlockedStages(newUnlocked);
        setCompletedStages(newCompleted);
        saveProgress(newUnlocked, newCompleted);
        
        // Save game session to history
        const timePlayed = Math.floor((Date.now() - gameStartTimeRef.current) / 1000);
        saveGameMutation.mutate({
          difficulty,
          stage: selectedStage,
          score: scoreRef.current,
          targetScore: stageData.targetScore,
          completed: 1,
          timePlayed,
        });
        
        setScreen("stage-complete");
        speak("Stage complete!");
        return;
      }
      
      // Render
      render(ctx, stageData);
      
      if (running) gameLoopRef.current = requestAnimationFrame(gameLoop);
    }
    
    function render(ctx: CanvasRenderingContext2D, stage: StageData) {
      // Background
      const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
      grad.addColorStop(0, stage.bgColor1);
      grad.addColorStop(1, stage.bgColor2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      // Stars
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 25; i++) {
        const sx = (i * 97 + Math.floor(distanceRef.current * 0.3)) % GAME_WIDTH;
        const sy = (i * 43) % 150 + 20;
        ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 400 + i) * 0.3;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // Ground
      ctx.fillStyle = "#3d2b5e";
      ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);
      
      // Ground lines
      ctx.strokeStyle = "#5a4080";
      ctx.lineWidth = 1;
      for (let i = 0; i < GAME_WIDTH + 60; i += 60) {
        const x = i - (distanceRef.current * 3) % 60;
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y);
        ctx.lineTo(x + 30, GAME_HEIGHT);
        ctx.stroke();
      }
      
      // Draw enemies
      enemiesRef.current.forEach(enemy => {
        ctx.fillStyle = enemy.color;
        ctx.shadowColor = enemy.color;
        ctx.shadowBlur = 10;
        
        if (enemy.type === "walker") {
          // Spiky enemy
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width / 2, enemy.y);
          ctx.lineTo(enemy.x + enemy.width, enemy.y + enemy.height);
          ctx.lineTo(enemy.x, enemy.y + enemy.height);
          ctx.closePath();
          ctx.fill();
          
          // Eyes
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width / 3, enemy.y + enemy.height / 2, 5, 0, Math.PI * 2);
          ctx.arc(enemy.x + (enemy.width * 2) / 3, enemy.y + enemy.height / 2, 5, 0, Math.PI * 2);
          ctx.fill();
        } else if (enemy.type === "flyer") {
          // Flying bat-like enemy
          ctx.beginPath();
          ctx.ellipse(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width / 2, enemy.height / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          
          // Wings
          const wingFlap = Math.sin(Date.now() / 50) * 10;
          ctx.beginPath();
          ctx.moveTo(enemy.x, enemy.y + enemy.height / 2);
          ctx.lineTo(enemy.x - 15, enemy.y + wingFlap);
          ctx.lineTo(enemy.x + 10, enemy.y + enemy.height / 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width, enemy.y + enemy.height / 2);
          ctx.lineTo(enemy.x + enemy.width + 15, enemy.y + wingFlap);
          ctx.lineTo(enemy.x + enemy.width - 10, enemy.y + enemy.height / 2);
          ctx.fill();
        } else {
          // Bouncing ball enemy
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width / 2, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width / 3, enemy.y + enemy.height / 3, 6, 0, Math.PI * 2);
          ctx.arc(enemy.x + (enemy.width * 2) / 3, enemy.y + enemy.height / 3, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        
        ctx.shadowBlur = 0;
      });
      
      // Draw player
      const px = 100;
      const py = playerYRef.current;
      
      ctx.shadowColor = "#00ff88";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#00cc66";
      ctx.fillRect(px, py, PLAYER_SIZE, PLAYER_SIZE);
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = "#00ff88";
      ctx.fillRect(px + 5, py + 5, PLAYER_SIZE - 10, PLAYER_SIZE - 10);
      
      // Face
      ctx.fillStyle = "#fff";
      ctx.fillRect(px + 15, py + 15, 8, 8);
      ctx.fillRect(px + 35, py + 15, 8, 8);
      ctx.fillStyle = "#00aa55";
      ctx.fillRect(px + 15, py + 35, 28, 5);
      
      // Running animation
      if (isJogging && !isJumpingRef.current) {
        const legOffset = Math.sin(distanceRef.current / 15) * 10;
        ctx.fillStyle = "#00aa55";
        ctx.fillRect(px + 10, py + PLAYER_SIZE, 15, 12 + legOffset);
        ctx.fillRect(px + PLAYER_SIZE - 25, py + PLAYER_SIZE, 15, 12 - legOffset);
      }
      
      // HUD
      ctx.fillStyle = "#fff";
      ctx.font = "bold 22px Arial";
      ctx.fillText(`Score: ${scoreRef.current} / ${stage.targetScore}`, 20, 35);
      ctx.font = "16px Arial";
      ctx.fillText(`Stage ${selectedStage}: ${stage.name}`, 20, 55);
      
      // Health bar
      const hbW = 180, hbH = 18, hbX = GAME_WIDTH - hbW - 20;
      ctx.fillStyle = "#222";
      ctx.fillRect(hbX, 15, hbW, hbH);
      const hPct = healthRef.current / 100;
      ctx.fillStyle = hPct > 0.5 ? "#00ff88" : hPct > 0.25 ? "#ffaa00" : "#ff4466";
      ctx.fillRect(hbX, 15, hbW * hPct, hbH);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(hbX, 15, hbW, hbH);
      
      // Jogging indicator
      ctx.fillStyle = isJogging ? "#00ff88" : "#666";
      ctx.font = "bold 14px Arial";
      ctx.fillText(isJogging ? "RUNNING" : "JOG TO MOVE", GAME_WIDTH - 200, 55);
    }
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
    
    return () => {
      running = false;
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [screen, difficulty, selectedStage, isJogging, isJumping, speak, unlockedStages, completedStages, saveProgress]);

  // Pushup challenge timer and counter
  useEffect(() => {
    if (screen !== "pushup-challenge") return;
    
    const timer = setInterval(() => {
      setPushupTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer);
          // Save failed game session
          const timePlayed = Math.floor((Date.now() - gameStartTimeRef.current) / 1000);
          const stageData = STAGES[selectedStage - 1];
          saveGameMutation.mutate({
            difficulty,
            stage: selectedStage,
            score: scoreRef.current,
            targetScore: stageData.targetScore,
            completed: 0,
            timePlayed,
          });
          setScreen("game-over");
          speak("Game over!");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [screen, speak, selectedStage, difficulty, saveGameMutation]);

  // Count pushups during challenge with cooldown
  const lastPushupTimeRef = useRef(0);
  
  useEffect(() => {
    if (screen !== "pushup-challenge" || !isPushup) return;
    
    // Cooldown: at least 800ms between pushups
    const now = Date.now();
    if (now - lastPushupTimeRef.current < 800) {
      setIsPushup(false);
      return;
    }
    
    lastPushupTimeRef.current = now;
    setIsPushup(false); // Reset immediately after counting
    
    setPushupCount(c => {
      const newCount = c + 1;
      speak(String(newCount));
      
      if (newCount >= 10) {
        // Revival!
        setTimeout(() => {
          healthRef.current = 50;
          setHealth(50);
          setScreen("playing");
          speak("Continue!");
        }, 500);
      }
      
      return newCount;
    });
  }, [isPushup, screen, speak]);

  // Render non-playing screens
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    if (screen === "menu" || screen === "stage-select" || screen === "pushup-challenge" || screen === "game-over" || screen === "stage-complete") {
      // Background
      const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
      grad.addColorStop(0, "#1a0a2e");
      grad.addColorStop(1, "#4a2c6e");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      ctx.textAlign = "center";
      
      if (screen === "menu") {
        ctx.font = "bold 50px Arial";
        ctx.fillStyle = "#00ff88";
        ctx.fillText("NEON RUN", GAME_WIDTH / 2, 100);
        
        ctx.font = "22px Arial";
        ctx.fillStyle = "#fff";
        ctx.fillText("Select Difficulty:", GAME_WIDTH / 2, 180);
        
        // Difficulty buttons drawn via DOM
        
        ctx.font = "16px Arial";
        ctx.fillStyle = "#aaa";
        ctx.fillText("Jog in place to run, raise arms to jump", GAME_WIDTH / 2, GAME_HEIGHT - 40);
        
      } else if (screen === "stage-select") {
        ctx.font = "bold 36px Arial";
        ctx.fillStyle = "#00ff88";
        ctx.fillText("SELECT STAGE", GAME_WIDTH / 2, 60);
        
        ctx.font = "18px Arial";
        ctx.fillStyle = "#aaa";
        ctx.fillText(`Difficulty: ${DIFFICULTIES[difficulty].name}`, GAME_WIDTH / 2, 95);
        
      } else if (screen === "pushup-challenge") {
        ctx.font = "bold 40px Arial";
        ctx.fillStyle = "#ffaa00";
        ctx.fillText("PUSHUP CHALLENGE!", GAME_WIDTH / 2, 100);
        
        ctx.font = "bold 80px Arial";
        ctx.fillStyle = "#fff";
        ctx.fillText(`${pushupCount}/10`, GAME_WIDTH / 2, 220);
        
        ctx.font = "bold 30px Arial";
        ctx.fillStyle = pushupTimeLeft <= 10 ? "#ff4466" : "#fff";
        ctx.fillText(`Time: ${pushupTimeLeft}s`, GAME_WIDTH / 2, 300);
        
        ctx.font = "20px Arial";
        ctx.fillStyle = "#aaa";
        ctx.fillText("Do 10 pushups to continue!", GAME_WIDTH / 2, 370);
        
      } else if (screen === "game-over") {
        ctx.font = "bold 50px Arial";
        ctx.fillStyle = "#ff4466";
        ctx.fillText("GAME OVER", GAME_WIDTH / 2, 150);
        
        ctx.font = "28px Arial";
        ctx.fillStyle = "#fff";
        ctx.fillText(`Final Score: ${score}`, GAME_WIDTH / 2, 220);
        
      } else if (screen === "stage-complete") {
        ctx.font = "bold 45px Arial";
        ctx.fillStyle = "#00ff88";
        ctx.fillText("STAGE COMPLETE!", GAME_WIDTH / 2, 120);
        
        ctx.font = "28px Arial";
        ctx.fillStyle = "#fff";
        ctx.fillText(`Score: ${score}`, GAME_WIDTH / 2, 180);
        
        if (selectedStage < STAGES.length) {
          ctx.font = "20px Arial";
          ctx.fillStyle = "#aaa";
          ctx.fillText(`Stage ${selectedStage + 1} Unlocked!`, GAME_WIDTH / 2, 230);
        } else {
          ctx.font = "24px Arial";
          ctx.fillStyle = "#ffaa00";
          ctx.fillText("All Stages Complete! You Win!", GAME_WIDTH / 2, 230);
        }
      }
      
      ctx.textAlign = "left";
    }
  }, [screen, difficulty, score, pushupCount, pushupTimeLeft, selectedStage]);

  const startGame = (stageId: number) => {
    if (!bodyDetected || !unlockedStages.includes(stageId)) return;
    
    setSelectedStage(stageId);
    setScore(0);
    setHealth(100);
    scoreRef.current = 0;
    healthRef.current = 100;
    gameStartTimeRef.current = Date.now();
    
    playerYRef.current = GROUND_Y - PLAYER_SIZE;
    playerVelocityRef.current = 0;
    isJumpingRef.current = false;
    enemiesRef.current = [];
    distanceRef.current = 0;
    lastEnemyRef.current = 0;
    
    setScreen("playing");
    speak(`Stage ${stageId}. Go!`);
  };
  
  const saveGameSession = useCallback((finalScore: number, stageId: number, completed: boolean) => {
    const timePlayed = Math.floor((Date.now() - gameStartTimeRef.current) / 1000);
    const stageData = STAGES[stageId - 1];
    
    saveGameMutation.mutate({
      difficulty,
      stage: stageId,
      score: finalScore,
      targetScore: stageData.targetScore,
      completed: completed ? 1 : 0,
      timePlayed,
    });
  }, [difficulty, saveGameMutation]);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => setLocation("/")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold" style={{ color: "#00ff88" }}>Neon Run</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setAudioEnabled(!audioEnabled);
              if (audioEnabled) window.speechSynthesis?.cancel();
            }}
            data-testid="button-audio-toggle"
          >
            {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Game Canvas */}
          <div className="lg:col-span-2">
            <Card className="p-4">
              <canvas
                ref={canvasRef}
                width={GAME_WIDTH}
                height={GAME_HEIGHT}
                className="w-full rounded-lg border-2 border-purple-500/30"
                data-testid="game-canvas"
              />
              
              {/* Menu buttons */}
              {screen === "menu" && (
                <div className="flex flex-col items-center gap-3 mt-4">
                  <div className="flex gap-3">
                    {(["easy", "medium", "hard"] as Difficulty[]).map(d => (
                      <Button
                        key={d}
                        onClick={() => setDifficulty(d)}
                        variant={difficulty === d ? "default" : "outline"}
                        style={difficulty === d ? { backgroundColor: DIFFICULTIES[d].color, color: "#000" } : {}}
                        data-testid={`button-difficulty-${d}`}
                      >
                        {DIFFICULTIES[d].name}
                      </Button>
                    ))}
                  </div>
                  <Button
                    onClick={() => setScreen("stage-select")}
                    size="lg"
                    disabled={!cameraReady}
                    data-testid="button-select-stage"
                  >
                    Select Stage
                  </Button>
                </div>
              )}
              
              {/* Stage selection */}
              {screen === "stage-select" && (
                <div className="mt-4">
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {STAGES.map(stage => {
                      const isUnlocked = unlockedStages.includes(stage.id);
                      const isCompleted = completedStages.includes(stage.id);
                      
                      return (
                        <Button
                          key={stage.id}
                          onClick={() => isUnlocked && startGame(stage.id)}
                          disabled={!isUnlocked || !bodyDetected}
                          variant="outline"
                          className="h-20 flex flex-col relative"
                          style={isCompleted ? { borderColor: "#00ff88" } : {}}
                          data-testid={`button-stage-${stage.id}`}
                        >
                          {!isUnlocked && <Lock className="w-5 h-5 absolute top-1 right-1 text-gray-500" />}
                          {isCompleted && <CheckCircle className="w-5 h-5 absolute top-1 right-1 text-green-500" />}
                          <span className="font-bold text-lg">{stage.id}</span>
                          <span className="text-xs">{stage.name}</span>
                        </Button>
                      );
                    })}
                  </div>
                  <div className="flex justify-center gap-3">
                    <Button variant="ghost" onClick={() => setScreen("menu")} data-testid="button-back-menu">
                      Back to Menu
                    </Button>
                  </div>
                  {!bodyDetected && cameraReady && (
                    <p className="text-center text-yellow-500 mt-2">Stand in front of camera to start</p>
                  )}
                </div>
              )}
              
              {/* Game over buttons */}
              {screen === "game-over" && (
                <div className="flex justify-center gap-3 mt-4">
                  <Button onClick={() => startGame(selectedStage)} disabled={!bodyDetected} data-testid="button-retry">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Retry Stage
                  </Button>
                  <Button variant="outline" onClick={() => setScreen("stage-select")} data-testid="button-stage-select">
                    Stage Select
                  </Button>
                </div>
              )}
              
              {/* Stage complete buttons */}
              {screen === "stage-complete" && (
                <div className="flex justify-center gap-3 mt-4">
                  {selectedStage < STAGES.length && (
                    <Button
                      onClick={() => startGame(selectedStage + 1)}
                      disabled={!bodyDetected}
                      data-testid="button-next-stage"
                    >
                      <Trophy className="w-4 h-4 mr-2" />
                      Next Stage
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setScreen("stage-select")} data-testid="button-stage-select-2">
                    Stage Select
                  </Button>
                </div>
              )}
            </Card>
          </div>

          {/* Camera and Controls */}
          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Camera</h3>
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                {!cameraReady && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-white text-sm">Loading...</p>
                  </div>
                )}
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <p className="text-red-400 text-sm text-center p-2">{cameraError}</p>
                  </div>
                )}
                {cameraReady && (
                  <div 
                    className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-bold ${
                      bodyDetected ? "bg-green-500" : "bg-red-500"
                    }`}
                    data-testid="status-body-detection"
                  >
                    {bodyDetected ? "Ready" : "Get in Frame"}
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-4" data-testid="card-controls">
              <h3 className="font-semibold mb-3">Controls</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isJogging ? "bg-green-500" : "bg-muted"}`} data-testid="indicator-jogging" />
                  <span>Run (jog in place)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isJumping ? "bg-green-500" : "bg-muted"}`} data-testid="indicator-jumping" />
                  <span>Jump (raise arms high)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isPushup ? "bg-green-500" : "bg-muted"}`} data-testid="indicator-pushup" />
                  <span>Pushup (for revival)</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-3">How to Play</h3>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>Jog in place to move forward</li>
                <li>Raise arms to jump over enemies</li>
                <li>Reach target score to clear stage</li>
                <li>If health depletes: 10 pushups = revive!</li>
                <li>Complete stages to unlock next ones</li>
              </ul>
            </Card>

            <Card className="p-4" data-testid="card-game-history">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <History className="w-4 h-4" />
                Game History
              </h3>
              {historyLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : gameSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No games played yet</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {gameSessions.slice(0, 10).map((session) => (
                    <div
                      key={session.id}
                      className={`flex items-center justify-between text-sm p-2 rounded ${
                        session.completed ? "bg-green-500/10" : "bg-red-500/10"
                      }`}
                      data-testid={`game-session-${session.id}`}
                    >
                      <div>
                        <span className="font-medium">Stage {session.stage}</span>
                        <span className="text-muted-foreground ml-2 capitalize">{session.difficulty}</span>
                      </div>
                      <div className="text-right">
                        <span className={session.completed ? "text-green-500" : "text-red-500"}>
                          {session.score}/{session.targetScore}
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
