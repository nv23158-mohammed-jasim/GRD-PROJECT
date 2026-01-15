import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Heart, Trophy, Play, Volume2, VolumeX } from "lucide-react";
import { useGamePoseDetection } from "@/hooks/use-game-pose-detection";

interface GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
  type: "tunnel" | "enemy" | "health";
}

interface GameState {
  score: number;
  health: number;
  maxHealth: number;
  characterY: number;
  characterVelocityY: number;
  isJumping: boolean;
  isDucking: boolean;
  obstacles: GameObject[];
  groundY: number;
  gameSpeed: number;
  distance: number;
  isGameOver: boolean;
  isPaused: boolean;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const CHARACTER_WIDTH = 50;
const CHARACTER_HEIGHT = 80;
const CHARACTER_DUCKING_HEIGHT = 40;
const GROUND_HEIGHT = 60;
const GRAVITY = 0.8;
const JUMP_FORCE = -15;

export default function GamePage() {
  const [, setLocation] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const lastObstacleRef = useRef<number>(0);
  const pushupCooldownRef = useRef<number>(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    health: 3,
    maxHealth: 5,
    characterY: CANVAS_HEIGHT - GROUND_HEIGHT - CHARACTER_HEIGHT,
    characterVelocityY: 0,
    isJumping: false,
    isDucking: false,
    obstacles: [],
    groundY: CANVAS_HEIGHT - GROUND_HEIGHT,
    gameSpeed: 5,
    distance: 0,
    isGameOver: false,
    isPaused: true,
  });

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const {
    videoRef,
    smallCanvasRef,
    isLoading,
    loadingStatus,
    error,
    isBodyDetected,
    isRunning,
    isJumping: poseJumping,
    isDucking: poseDucking,
    isPushup: posePushup,
    startCamera,
    stopCamera,
  } = useGamePoseDetection();

  // Speak function for audio feedback
  const speak = useCallback((text: string) => {
    if (!audioEnabled || typeof window === "undefined") return;
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.2;
        utterance.volume = 0.8;
        synth.speak(utterance);
      }
    } catch (e) {
      console.error("Speech error:", e);
    }
  }, [audioEnabled]);

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [startCamera, stopCamera]);

  // Generate random obstacle
  const generateObstacle = useCallback((): GameObject => {
    const types: GameObject["type"][] = ["tunnel", "enemy", "health"];
    const weights = [0.35, 0.45, 0.2];
    const rand = Math.random();
    let type: GameObject["type"] = "enemy";
    let cumulative = 0;
    for (let i = 0; i < types.length; i++) {
      cumulative += weights[i];
      if (rand < cumulative) {
        type = types[i];
        break;
      }
    }

    const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
    
    if (type === "tunnel") {
      return {
        x: CANVAS_WIDTH,
        y: groundY - 60,
        width: 80,
        height: 60,
        type: "tunnel",
      };
    } else if (type === "enemy") {
      return {
        x: CANVAS_WIDTH,
        y: groundY - 50,
        width: 40,
        height: 50,
        type: "enemy",
      };
    } else {
      return {
        x: CANVAS_WIDTH,
        y: groundY - 100,
        width: 30,
        height: 30,
        type: "health",
      };
    }
  }, []);

  // Game loop
  const gameLoop = useCallback(() => {
    const state = gameStateRef.current;
    if (state.isGameOver || state.isPaused) {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const now = Date.now();
    
    // Handle pose detection inputs
    let newCharacterY = state.characterY;
    let newVelocityY = state.characterVelocityY;
    let newIsJumping = state.isJumping;
    let newIsDucking = poseDucking;
    let newHealth = state.health;

    // Jump when pose detects jump and character is on ground
    const groundY = CANVAS_HEIGHT - GROUND_HEIGHT - CHARACTER_HEIGHT;
    if (poseJumping && !state.isJumping && state.characterY >= groundY - 5) {
      newVelocityY = JUMP_FORCE;
      newIsJumping = true;
    }

    // Apply gravity
    newVelocityY += GRAVITY;
    newCharacterY += newVelocityY;

    // Check ground collision
    const characterHeight = newIsDucking ? CHARACTER_DUCKING_HEIGHT : CHARACTER_HEIGHT;
    const floorY = CANVAS_HEIGHT - GROUND_HEIGHT - characterHeight;
    if (newCharacterY >= floorY) {
      newCharacterY = floorY;
      newVelocityY = 0;
      newIsJumping = false;
    }

    // Handle pushup for health (with cooldown)
    if (posePushup && now - pushupCooldownRef.current > 2000) {
      if (state.health < state.maxHealth) {
        newHealth = Math.min(state.maxHealth, state.health + 1);
        pushupCooldownRef.current = now;
        speak("Health up!");
      }
    }

    // Generate obstacles
    if (now - lastObstacleRef.current > 2000 + Math.random() * 1500) {
      const newObstacle = generateObstacle();
      setGameState(prev => ({
        ...prev,
        obstacles: [...prev.obstacles, newObstacle],
      }));
      lastObstacleRef.current = now;
    }

    // Move obstacles and check collisions
    const characterX = 100;
    const charWidth = CHARACTER_WIDTH;
    const charHeight = newIsDucking ? CHARACTER_DUCKING_HEIGHT : CHARACTER_HEIGHT;
    const charY = newIsDucking ? floorY : newCharacterY;

    let hitDamage = 0;
    let scoreBonus = 0;

    const updatedObstacles = state.obstacles
      .map(obs => ({ ...obs, x: obs.x - state.gameSpeed }))
      .filter(obs => {
        if (obs.x + obs.width < 0) return false;

        // Check collision
        const obsRight = obs.x + obs.width;
        const obsBottom = obs.y + obs.height;
        const charRight = characterX + charWidth;
        const charBottom = charY + charHeight;

        const collision = 
          characterX < obsRight &&
          charRight > obs.x &&
          charY < obsBottom &&
          charBottom > obs.y;

        if (collision) {
          if (obs.type === "tunnel") {
            if (!newIsDucking) {
              hitDamage++;
              speak("Duck under tunnels!");
              return false;
            }
          } else if (obs.type === "enemy") {
            if (!newIsJumping && newCharacterY >= groundY - 10) {
              hitDamage++;
              speak("Jump over enemies!");
              return false;
            } else if (newIsJumping && newVelocityY > 0) {
              scoreBonus += 100;
              speak("Enemy defeated!");
              return false;
            }
          } else if (obs.type === "health") {
            if (newHealth < state.maxHealth) {
              newHealth++;
              speak("Health!");
            }
            scoreBonus += 50;
            return false;
          }
        }
        return true;
      });

    // Update health and check game over
    newHealth = Math.max(0, newHealth - hitDamage);
    const isGameOver = newHealth <= 0;
    
    if (isGameOver && !state.isGameOver) {
      speak("Game over!");
    }

    // Increase speed over time
    const newDistance = state.distance + state.gameSpeed;
    const newSpeed = Math.min(12, 5 + Math.floor(newDistance / 1000) * 0.5);
    const newScore = state.score + 1 + scoreBonus;

    setGameState(prev => ({
      ...prev,
      characterY: newCharacterY,
      characterVelocityY: newVelocityY,
      isJumping: newIsJumping,
      isDucking: newIsDucking,
      health: newHealth,
      obstacles: updatedObstacles,
      distance: newDistance,
      gameSpeed: newSpeed,
      score: newScore,
      isGameOver,
    }));

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [poseJumping, poseDucking, posePushup, generateObstacle, speak]);

  // Start game loop
  useEffect(() => {
    gameLoopRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [gameLoop]);

  // Render game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw ground
    ctx.fillStyle = "#4a4a6a";
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT);
    
    // Ground texture
    ctx.strokeStyle = "#5a5a7a";
    ctx.lineWidth = 2;
    for (let i = 0; i < CANVAS_WIDTH; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, CANVAS_HEIGHT - GROUND_HEIGHT);
      ctx.lineTo(i + 15, CANVAS_HEIGHT);
      ctx.stroke();
    }

    // Draw obstacles
    gameState.obstacles.forEach(obs => {
      if (obs.type === "tunnel") {
        ctx.fillStyle = "#8b4513";
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.fillStyle = "#654321";
        ctx.fillRect(obs.x + 10, obs.y + 10, obs.width - 20, obs.height - 10);
      } else if (obs.type === "enemy") {
        ctx.fillStyle = "#ff4444";
        ctx.beginPath();
        ctx.arc(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(obs.x + obs.width / 3, obs.y + obs.height / 3, 6, 0, Math.PI * 2);
        ctx.arc(obs.x + (2 * obs.width) / 3, obs.y + obs.height / 3, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (obs.type === "health") {
        ctx.fillStyle = "#44ff44";
        ctx.beginPath();
        const cx = obs.x + obs.width / 2;
        const cy = obs.y + obs.height / 2;
        ctx.moveTo(cx, cy - 12);
        ctx.lineTo(cx + 10, cy + 10);
        ctx.lineTo(cx, cy + 5);
        ctx.lineTo(cx - 10, cy + 10);
        ctx.closePath();
        ctx.fill();
      }
    });

    // Draw character
    const characterHeight = gameState.isDucking ? CHARACTER_DUCKING_HEIGHT : CHARACTER_HEIGHT;
    const characterY = gameState.isDucking 
      ? CANVAS_HEIGHT - GROUND_HEIGHT - CHARACTER_DUCKING_HEIGHT 
      : gameState.characterY;
    
    // Body
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(100, characterY, CHARACTER_WIDTH, characterHeight);
    
    // Head
    ctx.fillStyle = "#ffdbac";
    ctx.beginPath();
    ctx.arc(125, characterY + 15, 15, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyes
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(120, characterY + 12, 3, 0, Math.PI * 2);
    ctx.arc(130, characterY + 12, 3, 0, Math.PI * 2);
    ctx.fill();

    // Running legs animation
    if (isRunning && !gameState.isJumping) {
      const legOffset = Math.sin(Date.now() / 100) * 10;
      ctx.fillStyle = "#333";
      ctx.fillRect(108, characterY + characterHeight - 15, 10, 15 + legOffset);
      ctx.fillRect(132, characterY + characterHeight - 15, 10, 15 - legOffset);
    }

    // HUD
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px Arial";
    ctx.fillText(`Score: ${gameState.score}`, 20, 30);
    ctx.fillText(`Distance: ${Math.floor(gameState.distance)}m`, 20, 55);

    // Health hearts
    for (let i = 0; i < gameState.maxHealth; i++) {
      ctx.fillStyle = i < gameState.health ? "#ff4444" : "#444444";
      ctx.beginPath();
      const hx = CANVAS_WIDTH - 40 - i * 35;
      const hy = 25;
      ctx.moveTo(hx, hy + 5);
      ctx.bezierCurveTo(hx, hy, hx - 10, hy, hx - 10, hy + 10);
      ctx.bezierCurveTo(hx - 10, hy + 18, hx, hy + 25, hx, hy + 30);
      ctx.bezierCurveTo(hx, hy + 25, hx + 10, hy + 18, hx + 10, hy + 10);
      ctx.bezierCurveTo(hx + 10, hy, hx, hy, hx, hy + 5);
      ctx.fill();
    }

    // Paused overlay
    if (gameState.isPaused && !gameState.isGameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 40px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Ready to Play!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
      ctx.font = "20px Arial";
      ctx.fillText("Click START when body is detected", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
      ctx.textAlign = "left";
    }

    // Game over overlay
    if (gameState.isGameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#ff4444";
      ctx.font = "bold 50px Arial";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);
      ctx.fillStyle = "#ffffff";
      ctx.font = "30px Arial";
      ctx.fillText(`Final Score: ${gameState.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
      ctx.textAlign = "left";
    }
  }, [gameState, isRunning]);

  const handleStart = () => {
    if (!isBodyDetected) return;
    speak("Go!");
    setGameState(prev => ({
      ...prev,
      isPaused: false,
      isGameOver: false,
      score: 0,
      health: 3,
      distance: 0,
      gameSpeed: 5,
      obstacles: [],
      characterY: CANVAS_HEIGHT - GROUND_HEIGHT - CHARACTER_HEIGHT,
      characterVelocityY: 0,
      isJumping: false,
      isDucking: false,
    }));
    lastObstacleRef.current = Date.now();
  };

  const handleRestart = () => {
    handleStart();
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button 
            variant="ghost" 
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-primary">Fitness Runner</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const newState = !audioEnabled;
              setAudioEnabled(newState);
              if (!newState) window.speechSynthesis?.cancel();
            }}
            data-testid="button-audio-toggle"
          >
            {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Card className="p-4">
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="w-full rounded-lg"
                data-testid="game-canvas"
              />
              
              <div className="flex gap-2 mt-4 justify-center">
                {gameState.isPaused && !gameState.isGameOver && (
                  <Button 
                    onClick={handleStart} 
                    disabled={!isBodyDetected}
                    size="lg"
                    data-testid="button-start-game"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    Start Game
                  </Button>
                )}
                {gameState.isGameOver && (
                  <Button 
                    onClick={handleRestart}
                    size="lg"
                    data-testid="button-restart-game"
                  >
                    <Trophy className="w-5 h-5 mr-2" />
                    Play Again
                  </Button>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-2">Camera Feed</h3>
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas
                  ref={smallCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
                
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <p className="text-white text-sm">{loadingStatus}</p>
                  </div>
                )}
                
                {!isLoading && (
                  <div className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-medium ${
                    isBodyDetected ? "bg-green-500" : "bg-red-500"
                  }`}>
                    {isBodyDetected ? "Body Detected" : "Get in Frame"}
                  </div>
                )}
              </div>
              
              {error && (
                <p className="text-destructive text-sm mt-2">{error}</p>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-3">Controls</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isRunning ? "bg-green-500" : "bg-muted"}`} />
                  <span>Run (move side to side)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${poseJumping ? "bg-green-500" : "bg-muted"}`} />
                  <span>Jump (raise arms up)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${poseDucking ? "bg-green-500" : "bg-muted"}`} />
                  <span>Duck (squat down)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${posePushup ? "bg-green-500" : "bg-muted"}`} />
                  <span>Pushup (gain health)</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" />
                How to Play
              </h3>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>Jump over enemies to defeat them</li>
                <li>Duck under tunnels to pass through</li>
                <li>Collect green hearts for health</li>
                <li>Do pushups to restore health</li>
                <li>Survive as long as possible!</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
