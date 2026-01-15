import { useRef, useState, useCallback, useEffect } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";

export type ExerciseType = "pushups" | "squats";

interface UsePoseDetectionResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isLoading: boolean;
  loadingStatus: string;
  error: string | null;
  isBodyDetected: boolean;
  repCount: number;
  isCountingEnabled: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  enableCounting: () => void;
  disableCounting: () => void;
  resetReps: () => void;
}

export function usePoseDetection(exerciseType: ExerciseType): UsePoseDetectionResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Initializing...");
  const [error, setError] = useState<string | null>(null);
  const [isBodyDetected, setIsBodyDetected] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [isCountingEnabled, setIsCountingEnabled] = useState(false);
  
  // Exercise state tracking
  const exercisePhaseRef = useRef<"up" | "down">("up");
  const countingEnabledRef = useRef(false);

  // Calculate angle between 3 points
  const calculateAngle = (
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number }
  ): number => {
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs((radians * 180) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  // Process pose for rep counting
  const processPose = useCallback((keypoints: poseDetection.Keypoint[]) => {
    if (!countingEnabledRef.current) return;
    
    const getPoint = (name: string) => keypoints.find(k => k.name === name);
    const isValid = (p: poseDetection.Keypoint | undefined) => p && (p.score ?? 0) > 0.3;
    
    let currentAngle = 180;
    
    if (exerciseType === "pushups") {
      // Use elbow angle for pushups
      const shoulder = getPoint("left_shoulder") || getPoint("right_shoulder");
      const elbow = getPoint("left_elbow") || getPoint("right_elbow");
      const wrist = getPoint("left_wrist") || getPoint("right_wrist");
      
      if (isValid(shoulder) && isValid(elbow) && isValid(wrist)) {
        currentAngle = calculateAngle(shoulder!, elbow!, wrist!);
      }
      
      // Pushup: down when elbow < 90, up when > 150
      if (currentAngle < 90 && exercisePhaseRef.current === "up") {
        exercisePhaseRef.current = "down";
      } else if (currentAngle > 150 && exercisePhaseRef.current === "down") {
        exercisePhaseRef.current = "up";
        setRepCount(prev => prev + 1);
      }
    } else {
      // Use knee angle for squats
      const hip = getPoint("left_hip") || getPoint("right_hip");
      const knee = getPoint("left_knee") || getPoint("right_knee");
      const ankle = getPoint("left_ankle") || getPoint("right_ankle");
      
      if (isValid(hip) && isValid(knee) && isValid(ankle)) {
        currentAngle = calculateAngle(hip!, knee!, ankle!);
      }
      
      // Squat: down when knee < 100, up when > 150
      if (currentAngle < 100 && exercisePhaseRef.current === "up") {
        exercisePhaseRef.current = "down";
      } else if (currentAngle > 150 && exercisePhaseRef.current === "down") {
        exercisePhaseRef.current = "up";
        setRepCount(prev => prev + 1);
      }
    }
  }, [exerciseType]);

  // Draw skeleton on canvas
  const drawSkeleton = useCallback((keypoints: poseDetection.Keypoint[], canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Connections to draw
    const connections = [
      ["left_shoulder", "right_shoulder"],
      ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
      ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
      ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
      ["left_hip", "right_hip"],
      ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
      ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
    ];
    
    const getPoint = (name: string) => keypoints.find(k => k.name === name);
    
    // Draw lines
    ctx.strokeStyle = "#ff3333";
    ctx.lineWidth = 3;
    
    connections.forEach(([a, b]) => {
      const p1 = getPoint(a);
      const p2 = getPoint(b);
      if (p1 && p2 && (p1.score ?? 0) > 0.3 && (p2.score ?? 0) > 0.3) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    });
    
    // Draw points
    keypoints.forEach(kp => {
      if ((kp.score ?? 0) > 0.3) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#ff3333";
        ctx.lineWidth = 2;
        ctx.stroke();
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
          const keypoints = poses[0].keypoints;
          const validPoints = keypoints.filter(k => (k.score ?? 0) > 0.3);
          
          setIsBodyDetected(validPoints.length >= 10);
          drawSkeleton(keypoints, canvasRef.current!, video);
          processPose(keypoints);
        } else {
          setIsBodyDetected(false);
        }
      } catch (e) {
        console.error("Detection error:", e);
      }
    }
    
    animationFrameRef.current = requestAnimationFrame(runDetection);
  }, [drawSkeleton, processPose]);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Step 1: Initialize TensorFlow
      setLoadingStatus("Setting up TensorFlow...");
      await tf.ready();
      await tf.setBackend("webgl");
      
      // Step 2: Get camera
      setLoadingStatus("Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;
          video.onloadedmetadata = () => {
            video.play().then(resolve).catch(reject);
          };
          video.onerror = () => reject(new Error("Video failed to load"));
        });
      }
      
      // Step 3: Load pose detection model
      setLoadingStatus("Loading AI model (may take 10-20 seconds)...");
      
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        }
      );
      
      detectorRef.current = detector;
      
      // Step 4: Start detection
      setLoadingStatus("Starting detection...");
      isRunningRef.current = true;
      runDetection();
      
      setIsLoading(false);
      setLoadingStatus("");
      
    } catch (err: any) {
      console.error("Setup error:", err);
      
      let message = "Failed to start camera.";
      if (err.name === "NotAllowedError") {
        message = "Camera access was denied. Please allow camera access and reload the page.";
      } else if (err.name === "NotFoundError") {
        message = "No camera found. Please connect a camera.";
      } else if (err.name === "NotReadableError") {
        message = "Camera is being used by another app. Close other apps and try again.";
      } else if (err.message) {
        message = err.message;
      }
      
      setError(message);
      setIsLoading(false);
    }
  }, [runDetection]);

  const stopCamera = useCallback(() => {
    isRunningRef.current = false;
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (detectorRef.current) {
      detectorRef.current.dispose();
      detectorRef.current = null;
    }
  }, []);

  const enableCounting = useCallback(() => {
    countingEnabledRef.current = true;
    exercisePhaseRef.current = "up";
    setIsCountingEnabled(true);
  }, []);

  const disableCounting = useCallback(() => {
    countingEnabledRef.current = false;
    setIsCountingEnabled(false);
  }, []);

  const resetReps = useCallback(() => {
    setRepCount(0);
    exercisePhaseRef.current = "up";
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    canvasRef,
    isLoading,
    loadingStatus,
    error,
    isBodyDetected,
    repCount,
    isCountingEnabled,
    startCamera,
    stopCamera,
    enableCounting,
    disableCounting,
    resetReps,
  };
}
