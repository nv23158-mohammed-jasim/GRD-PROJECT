import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Volume2, VolumeX, Play, RotateCcw } from "lucide-react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";

// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 450;
const GROUND_Y = 380;
const PLAYER_SIZE = 60;
const OBSTACLE_WIDTH = 50;
const OBSTACLE_HEIGHT = 60;

interface Obstacle {
  x: number;
  type: "jump" | "duck";
  passed: boolean;
}

export default function GamePage() {
  const [, setLocation] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(100);
  const [stage, setStage] = useState(1);
  
  // Player state
  const playerYRef = useRef(GROUND_Y - PLAYER_SIZE);
  const playerVelocityRef = useRef(0);
  const isJumpingRef = useRef(false);
  const isDuckingRef = useRef(false);
  
  // Pose detection state
  const [isJumping, setIsJumping] = useState(false);
  const [isDucking, setIsDucking] = useState(false);
  const [bodyDetected, setBodyDetected] = useState(false);
  
  // Game state
  const obstaclesRef = useRef<Obstacle[]>([]);
  const speedRef = useRef(6);
  const distanceRef = useRef(0);
  const lastObstacleRef = useRef(0);

  // Speak function
  const speak = useCallback((text: string) => {
    if (!audioEnabled) return;
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.3;
        synth.speak(u);
      }
    } catch (e) { /* ignore */ }
  }, [audioEnabled]);

  // Initialize camera and pose detection
  useEffect(() => {
    let mounted = true;
    
    async function init() {
      try {
        // Get camera
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
        
        // Initialize TensorFlow
        await tf.setBackend("webgl");
        await tf.ready();
        
        // Create detector
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
        );
        
        if (!mounted) return;
        detectorRef.current = detector;
        setCameraReady(true);
        
      } catch (err) {
        if (mounted) {
          setCameraError("Camera access needed. Open in new tab and allow camera.");
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
    const standingShoulderY = { value: 0, calibrated: false, frames: 0 };
    
    async function detectPose() {
      if (!running || !detectorRef.current || !videoRef.current) return;
      
      try {
        const poses = await detectorRef.current.estimatePoses(videoRef.current);
        
        if (poses.length > 0 && poses[0].keypoints) {
          const kps = poses[0].keypoints;
          setBodyDetected(true);
          
          // Get key points
          const getY = (name: string) => {
            const kp = kps.find(k => k.name === name);
            return kp && (kp.score ?? 0) > 0.3 ? kp.y : null;
          };
          
          const lShoulder = getY("left_shoulder");
          const rShoulder = getY("right_shoulder");
          const lHip = getY("left_hip");
          const rHip = getY("right_hip");
          const lWrist = getY("left_wrist");
          const rWrist = getY("right_wrist");
          
          const shoulderY = lShoulder && rShoulder ? (lShoulder + rShoulder) / 2 : lShoulder || rShoulder;
          const hipY = lHip && rHip ? (lHip + rHip) / 2 : lHip || rHip;
          const wristY = lWrist && rWrist ? Math.min(lWrist, rWrist) : lWrist || rWrist;
          
          if (shoulderY !== null) {
            // Calibrate standing position
            if (!standingShoulderY.calibrated && standingShoulderY.frames < 30) {
              standingShoulderY.frames++;
              if (standingShoulderY.value === 0 || shoulderY < standingShoulderY.value) {
                standingShoulderY.value = shoulderY;
              }
              if (standingShoulderY.frames >= 30) {
                standingShoulderY.calibrated = true;
              }
            }
            
            if (standingShoulderY.calibrated) {
              // JUMP: Arms raised above shoulders
              const jumping = wristY !== null && wristY < shoulderY - 40;
              setIsJumping(jumping);
              
              // DUCK: Shoulders dropped significantly (squatting)
              const shoulderDrop = shoulderY - standingShoulderY.value;
              const ducking = shoulderDrop > 50;
              setIsDucking(ducking);
            }
          }
        } else {
          setBodyDetected(false);
        }
      } catch (e) { /* ignore */ }
      
      if (running) {
        requestAnimationFrame(detectPose);
      }
    }
    
    detectPose();
    
    return () => { running = false; };
  }, [cameraReady]);

  // Game loop
  useEffect(() => {
    if (!gameStarted || gameOver) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    let running = true;
    
    function gameLoop(timestamp: number) {
      if (!running || !ctx) return;
      
      const delta = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;
      
      // Update player based on pose
      if (isJumping && !isJumpingRef.current && playerYRef.current >= GROUND_Y - PLAYER_SIZE - 5) {
        playerVelocityRef.current = -18;
        isJumpingRef.current = true;
      }
      isDuckingRef.current = isDucking;
      
      // Apply physics
      playerVelocityRef.current += 0.8; // gravity
      playerYRef.current += playerVelocityRef.current;
      
      const groundLevel = isDuckingRef.current ? GROUND_Y - PLAYER_SIZE / 2 : GROUND_Y - PLAYER_SIZE;
      if (playerYRef.current >= groundLevel) {
        playerYRef.current = groundLevel;
        playerVelocityRef.current = 0;
        isJumpingRef.current = false;
      }
      
      // Update game
      distanceRef.current += speedRef.current;
      const currentStage = Math.floor(distanceRef.current / 2000) + 1;
      if (currentStage !== stage) {
        setStage(currentStage);
        speedRef.current = Math.min(14, 6 + currentStage * 0.8);
        speak(`Stage ${currentStage}`);
      }
      
      // Generate obstacles
      if (distanceRef.current - lastObstacleRef.current > 400 + Math.random() * 300) {
        const type = Math.random() > 0.5 ? "jump" : "duck";
        obstaclesRef.current.push({
          x: GAME_WIDTH,
          type,
          passed: false
        });
        lastObstacleRef.current = distanceRef.current;
      }
      
      // Update obstacles and check collisions
      let hit = false;
      obstaclesRef.current = obstaclesRef.current.filter(obs => {
        obs.x -= speedRef.current;
        
        // Check collision
        const playerX = 80;
        const playerHeight = isDuckingRef.current ? PLAYER_SIZE / 2 : PLAYER_SIZE;
        const playerTop = playerYRef.current;
        
        const obsTop = obs.type === "jump" ? GROUND_Y - OBSTACLE_HEIGHT : GROUND_Y - OBSTACLE_HEIGHT * 2;
        const obsBottom = obs.type === "jump" ? GROUND_Y : GROUND_Y - OBSTACLE_HEIGHT;
        
        const collisionX = playerX + PLAYER_SIZE - 10 > obs.x && playerX + 10 < obs.x + OBSTACLE_WIDTH;
        const collisionY = playerTop + playerHeight > obsTop && playerTop < obsBottom;
        
        if (collisionX && collisionY && !obs.passed) {
          hit = true;
          obs.passed = true;
        }
        
        // Score for passing
        if (obs.x + OBSTACLE_WIDTH < playerX && !obs.passed) {
          obs.passed = true;
          setScore(s => s + 10 + currentStage * 5);
        }
        
        return obs.x > -OBSTACLE_WIDTH;
      });
      
      if (hit) {
        setHealth(h => {
          const newHealth = h - (15 + currentStage * 2);
          if (newHealth <= 0) {
            setGameOver(true);
            speak("Game over");
            return 0;
          }
          return newHealth;
        });
      }
      
      // Draw
      render(ctx);
      
      if (running && !gameOver) {
        gameLoopRef.current = requestAnimationFrame(gameLoop);
      }
    }
    
    function render(ctx: CanvasRenderingContext2D) {
      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
      skyGrad.addColorStop(0, "#1a0a2e");
      skyGrad.addColorStop(0.5, "#2d1b4e");
      skyGrad.addColorStop(1, "#4a2c6e");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      // Stars
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 30; i++) {
        const sx = (i * 97 + Math.floor(distanceRef.current * 0.1)) % GAME_WIDTH;
        const sy = (i * 43) % 150 + 20;
        ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 300 + i) * 0.3;
        ctx.beginPath();
        ctx.arc(sx, sy, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // Moon
      ctx.fillStyle = "#f0e68c";
      ctx.beginPath();
      ctx.arc(650, 80, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4a2c6e";
      ctx.beginPath();
      ctx.arc(670, 70, 35, 0, Math.PI * 2);
      ctx.fill();
      
      // Ground
      const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, GAME_HEIGHT);
      groundGrad.addColorStop(0, "#3d2b5e");
      groundGrad.addColorStop(1, "#2a1e40");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);
      
      // Ground lines
      ctx.strokeStyle = "#5a4080";
      ctx.lineWidth = 1;
      for (let i = 0; i < GAME_WIDTH + 50; i += 50) {
        const x = (i - (distanceRef.current * 2) % 50);
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y);
        ctx.lineTo(x + 25, GAME_HEIGHT);
        ctx.stroke();
      }
      
      // Draw obstacles
      obstaclesRef.current.forEach(obs => {
        if (obs.type === "jump") {
          // Spiky obstacle - must jump over
          ctx.fillStyle = "#ff4466";
          ctx.beginPath();
          ctx.moveTo(obs.x, GROUND_Y);
          ctx.lineTo(obs.x + OBSTACLE_WIDTH / 2, GROUND_Y - OBSTACLE_HEIGHT);
          ctx.lineTo(obs.x + OBSTACLE_WIDTH, GROUND_Y);
          ctx.closePath();
          ctx.fill();
          
          ctx.fillStyle = "#cc3355";
          ctx.beginPath();
          ctx.moveTo(obs.x + 10, GROUND_Y);
          ctx.lineTo(obs.x + OBSTACLE_WIDTH / 2, GROUND_Y - OBSTACLE_HEIGHT + 15);
          ctx.lineTo(obs.x + OBSTACLE_WIDTH - 10, GROUND_Y);
          ctx.closePath();
          ctx.fill();
        } else {
          // Floating obstacle - must duck under
          const barY = GROUND_Y - OBSTACLE_HEIGHT * 1.5;
          ctx.fillStyle = "#44aaff";
          ctx.fillRect(obs.x, barY, OBSTACLE_WIDTH, OBSTACLE_HEIGHT * 0.7);
          
          ctx.fillStyle = "#2288dd";
          ctx.fillRect(obs.x + 5, barY + 5, OBSTACLE_WIDTH - 10, OBSTACLE_HEIGHT * 0.7 - 10);
          
          // Glow effect
          ctx.shadowColor = "#44aaff";
          ctx.shadowBlur = 10;
          ctx.fillStyle = "#66ccff";
          ctx.fillRect(obs.x + 10, barY + 10, OBSTACLE_WIDTH - 20, 5);
          ctx.shadowBlur = 0;
        }
      });
      
      // Draw player
      const px = 80;
      const py = playerYRef.current;
      const ph = isDuckingRef.current ? PLAYER_SIZE / 2 : PLAYER_SIZE;
      
      // Body glow
      ctx.shadowColor = "#00ff88";
      ctx.shadowBlur = 15;
      ctx.fillStyle = "#00cc66";
      ctx.fillRect(px, py, PLAYER_SIZE, ph);
      ctx.shadowBlur = 0;
      
      // Body
      ctx.fillStyle = "#00ff88";
      ctx.fillRect(px + 5, py + 5, PLAYER_SIZE - 10, ph - 10);
      
      // Face
      ctx.fillStyle = "#fff";
      ctx.fillRect(px + 15, py + 10, 8, 8);
      ctx.fillRect(px + 35, py + 10, 8, 8);
      
      // Mouth
      ctx.fillStyle = "#00aa55";
      ctx.fillRect(px + 15, py + 25, 28, 5);
      
      // Draw HUD
      ctx.fillStyle = "#fff";
      ctx.font = "bold 24px Arial";
      ctx.fillText(`Score: ${score}`, 20, 35);
      ctx.font = "18px Arial";
      ctx.fillText(`Stage ${stage}`, 20, 60);
      
      // Health bar
      const hbWidth = 200;
      const hbHeight = 20;
      const hbX = GAME_WIDTH - hbWidth - 20;
      
      ctx.fillStyle = "#333";
      ctx.fillRect(hbX, 15, hbWidth, hbHeight);
      
      const healthPct = health / 100;
      ctx.fillStyle = healthPct > 0.5 ? "#00ff88" : healthPct > 0.25 ? "#ffaa00" : "#ff4466";
      ctx.fillRect(hbX, 15, hbWidth * healthPct, hbHeight);
      
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(hbX, 15, hbWidth, hbHeight);
      
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`${health}%`, hbX + hbWidth / 2, 30);
      ctx.textAlign = "left";
      
      // Running indicator
      if (!isJumpingRef.current && !isDuckingRef.current) {
        const legOffset = Math.sin(distanceRef.current / 20) * 8;
        ctx.fillStyle = "#00aa55";
        ctx.fillRect(px + 10, py + ph, 12, 10 + legOffset);
        ctx.fillRect(px + PLAYER_SIZE - 22, py + ph, 12, 10 - legOffset);
      }
    }
    
    lastFrameTimeRef.current = performance.now();
    gameLoopRef.current = requestAnimationFrame(gameLoop);
    
    return () => {
      running = false;
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [gameStarted, gameOver, isJumping, isDucking, stage, speak, score, health]);

  // Draw initial/game over screen
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    if (!gameStarted || gameOver) {
      // Background
      const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
      grad.addColorStop(0, "#1a0a2e");
      grad.addColorStop(1, "#4a2c6e");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      
      if (gameOver) {
        ctx.font = "bold 48px Arial";
        ctx.fillStyle = "#ff4466";
        ctx.fillText("GAME OVER", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
        
        ctx.font = "28px Arial";
        ctx.fillStyle = "#fff";
        ctx.fillText(`Final Score: ${score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10);
        ctx.fillText(`Stage Reached: ${stage}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 45);
      } else {
        ctx.font = "bold 42px Arial";
        ctx.fillStyle = "#00ff88";
        ctx.fillText("NEON RUN", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60);
        
        ctx.font = "20px Arial";
        ctx.fillStyle = "#fff";
        ctx.fillText("Raise arms to JUMP over red spikes", GAME_WIDTH / 2, GAME_HEIGHT / 2);
        ctx.fillText("Squat down to DUCK under blue bars", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30);
        
        if (cameraReady && bodyDetected) {
          ctx.fillStyle = "#00ff88";
          ctx.fillText("Body detected! Click START to begin", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80);
        } else if (cameraReady) {
          ctx.fillStyle = "#ffaa00";
          ctx.fillText("Stand in front of camera", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80);
        } else if (cameraError) {
          ctx.fillStyle = "#ff4466";
          ctx.fillText(cameraError, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80);
        } else {
          ctx.fillStyle = "#ffaa00";
          ctx.fillText("Loading camera...", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80);
        }
      }
      
      ctx.textAlign = "left";
    }
  }, [gameStarted, gameOver, cameraReady, cameraError, bodyDetected, score, stage]);

  const startGame = () => {
    if (!bodyDetected) return;
    
    // Reset game state
    setScore(0);
    setHealth(100);
    setStage(1);
    setGameOver(false);
    setGameStarted(true);
    
    playerYRef.current = GROUND_Y - PLAYER_SIZE;
    playerVelocityRef.current = 0;
    isJumpingRef.current = false;
    isDuckingRef.current = false;
    obstaclesRef.current = [];
    speedRef.current = 6;
    distanceRef.current = 0;
    lastObstacleRef.current = 0;
    
    speak("Stage 1. Go!");
  };

  const restartGame = () => {
    startGame();
  };

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
              
              <div className="flex gap-3 mt-4 justify-center">
                {!gameStarted && (
                  <Button
                    onClick={startGame}
                    disabled={!bodyDetected}
                    size="lg"
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-start-game"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    Start Game
                  </Button>
                )}
                {gameOver && (
                  <Button
                    onClick={restartGame}
                    size="lg"
                    className="bg-purple-600 hover:bg-purple-700"
                    data-testid="button-restart-game"
                  >
                    <RotateCcw className="w-5 h-5 mr-2" />
                    Play Again
                  </Button>
                )}
              </div>
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
                    <p className="text-white text-sm">Loading camera...</p>
                  </div>
                )}
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <p className="text-red-400 text-sm text-center p-2">{cameraError}</p>
                  </div>
                )}
                {cameraReady && (
                  <div className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-bold ${
                    bodyDetected ? "bg-green-500" : "bg-red-500"
                  }`}>
                    {bodyDetected ? "Ready" : "Get in Frame"}
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-3">Controls</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isJumping ? "bg-green-500" : "bg-muted"}`} />
                  <span>Jump (raise both arms high)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isDucking ? "bg-green-500" : "bg-muted"}`} />
                  <span>Duck (squat down low)</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-3">How to Play</h3>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>Game scrolls automatically</li>
                <li>Raise arms to jump over red spikes</li>
                <li>Squat to duck under blue bars</li>
                <li>Difficulty increases each stage</li>
                <li>Survive as long as possible!</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
