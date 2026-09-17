import React, { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import p5 from 'p5';
import { HandTracker } from './lib/hand_tracker';
import { LeafSystem, AppState, ColorConfig } from './lib/leaf_system';
import { analyzeTreeImage, BranchPoint } from './lib/gemini_service';
import { Camera, Type, RefreshCcw, Check, Loader2, Palette, Plus, Trash2, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [inputText, setInputText] = useState('❤️');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [skeleton, setSkeleton] = useState<BranchPoint[][]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [colorConfigs, setColorConfigs] = useState<ColorConfig[]>([
    { color: '#ffffff', percent: 70 },
    { color: '#ffff00', percent: 10 },
    { color: '#ff00ff', percent: 20 }
  ]);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const webcamRef = useRef<Webcam>(null);
  const p5ContainerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);
  
  const handTrackerRef = useRef<HandTracker | null>(null);
  const leafSystemRef = useRef<LeafSystem | null>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [videoDims, setVideoDims] = useState({ width: 1920, height: 1080 });

  // Helper to map normalized coordinates (0-1) to screen coordinates accounting for object-cover
  const mapCoords = useCallback((nx: number, ny: number) => {
    const videoAspect = videoDims.width / videoDims.height;
    const containerAspect = dimensions.width / dimensions.height;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (videoAspect > containerAspect) {
      // Video is wider than container (cropped sides)
      drawHeight = dimensions.height;
      drawWidth = dimensions.height * videoAspect;
      offsetX = (dimensions.width - drawWidth) / 2;
      offsetY = 0;
    } else {
      // Video is taller than container (cropped top/bottom)
      drawWidth = dimensions.width;
      drawHeight = dimensions.width / videoAspect;
      offsetX = 0;
      offsetY = (dimensions.height - drawHeight) / 2;
    }

    return {
      x: nx * drawWidth + offsetX,
      y: ny * drawHeight + offsetY
    };
  }, [dimensions, videoDims]);

  // Initialize systems
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
      leafSystemRef.current?.updateDimensions(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', updateDimensions);

    leafSystemRef.current = new LeafSystem(window.innerWidth, window.innerHeight);
    handTrackerRef.current = new HandTracker((results) => {
      // Check for fist opening gesture to grow leaves
      // This ensures it only triggers when the user explicitly opens their fist
      if (handTrackerRef.current?.isFistOpening() && (leafSystemRef.current?.getState() === AppState.CONFIRMING || leafSystemRef.current?.getState() === AppState.READY)) {
        leafSystemRef.current.triggerGrow();
        setAppState(AppState.GROWING);
      }
    });

    return () => {
      window.removeEventListener('resize', updateDimensions);
      handTrackerRef.current?.close();
      p5InstanceRef.current?.remove();
    };
  }, []);

  // p5.js Sketch
  useEffect(() => {
    if (!p5ContainerRef.current) return;

    const sketch = (p: p5) => {
      p.setup = () => {
        p.createCanvas(dimensions.width, dimensions.height).parent(p5ContainerRef.current!);
        p.pixelDensity(1);
        p.textFont('"Pixelify Sans", sans-serif');
        p.textAlign(p.CENTER, p.CENTER);
        leafSystemRef.current?.loadImages(p);
      };

      p.draw = () => {
        p.clear();
        if (!leafSystemRef.current || !handTrackerRef.current) return;

        const results = handTrackerRef.current.getResults();

        // Draw Skeleton Lines (during analysis and confirmation) - Cyberpunk Neon
        if (skeleton.length > 0 && (appState === AppState.ANALYZING || (appState === AppState.CONFIRMING && capturedImage))) {
          p.stroke(0, 255, 255, 150); // Neon Cyan
          p.strokeWeight(3);
          p.noFill();
          // Add glow effect
          if (p.drawingContext) {
            (p.drawingContext as any).shadowBlur = 10;
            (p.drawingContext as any).shadowColor = 'rgba(0, 255, 255, 0.8)';
          }
          
          for (const branch of skeleton) {
            p.beginShape();
            for (const pt of branch) {
              const mapped = mapCoords(pt.x, pt.y);
              p.vertex(mapped.x, mapped.y);
            }
            p.endShape();
          }
          if (p.drawingContext) {
            (p.drawingContext as any).shadowBlur = 0;
          }
        }

        // Get index finger tip position
        let fingerPos: p5.Vector | null = null;
        if (results?.multiHandLandmarks?.[0]) {
          const landmarks = results.multiHandLandmarks[0];
          const tip = mapCoords(landmarks[8].x, landmarks[8].y);
          fingerPos = p.createVector(tip.x, tip.y);
        }

        leafSystemRef.current.update(p, fingerPos);
        leafSystemRef.current.draw(p);
      };
    };

    p5InstanceRef.current = new p5(sketch);
    return () => p5InstanceRef.current?.remove();
  }, [dimensions, skeleton, appState, mapCoords]);

  const [error, setError] = useState<string | null>(null);

  // Global error handler
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      if (event.message.includes('Failed to fetch')) {
        setError("Network error: Failed to load system assets. Please check your connection.");
      }
    };
    window.addEventListener('error', handleGlobalError);
    return () => window.removeEventListener('error', handleGlobalError);
  }, []);

  // Main processing loop
  useEffect(() => {
    // Only process if camera is ready
    if (!cameraReady) return;

    let animationFrameId: number;
    const process = async () => {
      if (webcamRef.current?.video && !handTrackerRef.current?.isClosedState()) {
        const video = webcamRef.current.video;
        if (video.videoWidth > 0 && (video.videoWidth !== videoDims.width || video.videoHeight !== videoDims.height)) {
          setVideoDims({ width: video.videoWidth, height: video.videoHeight });
        }
        await handTrackerRef.current?.send(video);
      }
      animationFrameId = requestAnimationFrame(process);
    };

    process();
    return () => cancelAnimationFrame(animationFrameId);
  }, [cameraReady, videoDims]);

  // Sync AppState to LeafSystem
  useEffect(() => {
    if (leafSystemRef.current) {
      leafSystemRef.current.setState(appState);
    }
  }, [appState]);

  // Sync Colors to LeafSystem
  useEffect(() => {
    if (leafSystemRef.current) {
      leafSystemRef.current.updateColors(colorConfigs);
    }
  }, [colorConfigs]);

  const handleCapture = async () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setError(null);
    setCapturedImage(imageSrc);
    setAppState(AppState.ANALYZING);
    setIsAnalyzing(true);

    try {
      const result = await analyzeTreeImage(imageSrc);
      if (!result || !result.branches) {
        throw new Error("Invalid response received from Gemini.");
      }

      const branches = (result.branches || []).map(b => b.points || []).filter(pts => pts.length > 0);
      
      if (branches.length === 0) {
        throw new Error("No branches were detected. Position the camera closer to the tree branches in good lighting, then scan again.");
      }

      setSkeleton(branches);
      
      // Map branches for leaf system
      const mappedBranches = branches.map(branch => 
        branch.map(p => {
          const mapped = mapCoords(p.x, p.y);
          return { x: mapped.x, y: mapped.y };
        })
      );

      leafSystemRef.current?.syncWithSkeleton(mappedBranches, inputText);
      setAppState(AppState.CONFIRMING);
    } catch (err: any) {
      console.error("Analysis failed:", err);
      const message = err?.message || "Failed to analyze branch structure.";
      setError(message);
      setAppState(AppState.IDLE);
      setCapturedImage(null);
      setSkeleton([]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirm = () => {
    setCapturedImage(null);
    setAppState(AppState.READY);
  };

  const handleRetake = () => {
    setError(null);
    setCapturedImage(null);
    setSkeleton([]);
    setAppState(AppState.IDLE);
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white">
      <div className="absolute inset-0 z-0">
        <Webcam
          ref={webcamRef}
          audio={false}
          className={`w-full h-full object-cover ${capturedImage ? 'opacity-0' : 'opacity-100'}`}
          onUserMedia={() => setCameraReady(true)}
          onUserMediaError={(err) => console.error(err)}
          videoConstraints={{ facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }}
          screenshotFormat="image/jpeg"
          mirrored={false}
          screenshotQuality={0.92}
          imageSmoothing={true}
          forceScreenshotSourceSize={false}
          disablePictureInPicture={true}
        />
        {capturedImage && (
          <img src={capturedImage} className="absolute inset-0 w-full h-full object-cover" alt="Captured tree" />
        )}
      </div>

      {error && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-[90%] bg-zinc-950/95 backdrop-blur-md px-4 py-3 border border-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.3)] text-red-100 text-xs font-mono flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-300 mb-0.5">Gemini Analysis Notice</p>
            <p className="text-zinc-300 leading-relaxed">{error}</p>
          </div>
          <button 
            onClick={() => setError(null)} 
            className="text-zinc-400 hover:text-white p-0.5 transition-colors"
            title="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div ref={p5ContainerRef} className="absolute inset-0 z-10 pointer-events-none" />

      <div className="absolute top-0 left-0 w-full p-6 z-20 flex flex-col items-start pointer-events-none">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2 pointer-events-auto">
          <div className="bg-black/60 backdrop-blur-xl p-4 rounded-none border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <div className="flex items-center gap-2 bg-cyan-950/50 rounded-none px-3 py-2 border border-cyan-500/20">
              <Type className="w-4 h-4 text-cyan-400/60" />
              <input
                type="text"
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  leafSystemRef.current?.updateText(e.target.value);
                }}
                placeholder="Enter text..."
                className="bg-transparent border-none outline-none text-sm w-48 placeholder:text-cyan-900 text-cyan-100 font-mono text-center"
              />
              <button 
                onClick={() => setShowColorPicker(!showColorPicker)}
                className={`p-1 rounded-none transition-colors ${showColorPicker ? 'bg-cyan-500 text-black' : 'text-cyan-400 hover:bg-cyan-500/20'}`}
              >
                <Palette className="w-4 h-4" />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {showColorPicker && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-black/80 backdrop-blur-xl p-4 border border-cyan-500/30 overflow-hidden"
              >
                <div className="flex flex-col gap-3">
                  {colorConfigs.map((config, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={config.color}
                        onChange={(e) => {
                          const newConfigs = [...colorConfigs];
                          newConfigs[idx].color = e.target.value;
                          setColorConfigs(newConfigs);
                        }}
                        className="w-6 h-6 bg-transparent border-none cursor-pointer"
                      />
                      <input 
                        type="number" 
                        value={config.percent}
                        onChange={(e) => {
                          const newConfigs = [...colorConfigs];
                          newConfigs[idx].percent = parseInt(e.target.value) || 0;
                          setColorConfigs(newConfigs);
                        }}
                        className="bg-cyan-950/50 border border-cyan-500/20 text-cyan-100 text-xs w-12 px-1 py-1 font-mono"
                      />
                      <span className="text-[10px] text-cyan-500/60 font-mono">%</span>
                      {colorConfigs.length > 1 && (
                        <button 
                          onClick={() => setColorConfigs(colorConfigs.filter((_, i) => i !== idx))}
                          className="text-red-500/60 hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {colorConfigs.length < 3 && (
                    <button 
                      onClick={() => setColorConfigs([...colorConfigs, { color: '#ffffff', percent: 0 }])}
                      className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors font-mono mt-1"
                    >
                      <Plus className="w-3 h-3" /> Add Color
                    </button>
                  )}
                  <div className="text-[10px] text-zinc-500 font-mono mt-1">
                    Total: {colorConfigs.reduce((acc, c) => acc + c.percent, 0)}%
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Action Buttons */}
      <div className="absolute bottom-10 left-0 w-full flex justify-center z-30 px-6">
        <AnimatePresence mode="wait">
          {appState === AppState.IDLE && cameraReady && (
            <motion.button
              key="capture"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onClick={handleCapture}
              className="flex items-center gap-3 px-8 py-4 bg-cyan-500 text-black rounded-none font-bold shadow-[0_0_20px_rgba(6,182,212,0.5)] hover:scale-105 active:scale-95 transition-all uppercase tracking-widest border-r-4 border-b-4 border-cyan-700"
            >
              <Camera className="w-6 h-6" />
              Scan Structure
            </motion.button>
          )}

          {appState === AppState.ANALYZING && (
            <motion.div
              key="analyzing"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex items-center gap-3 px-8 py-4 bg-zinc-900/90 text-cyan-400 rounded-none font-bold border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)] uppercase tracking-widest"
            >
              <Loader2 className="w-6 h-6 animate-spin" />
              Processing...
            </motion.div>
          )}

          {appState === AppState.CONFIRMING && capturedImage && (
            <motion.div
              key="confirm"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="flex gap-4"
            >
              <button
                onClick={handleRetake}
                className="flex items-center gap-2 px-6 py-4 bg-zinc-800 text-zinc-400 rounded-none font-bold border border-zinc-700 hover:bg-zinc-700 transition-all uppercase tracking-widest"
              >
                <RefreshCcw className="w-5 h-5" />
                Abort
              </button>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-2 px-8 py-4 bg-pink-500 text-white rounded-none font-bold shadow-[0_0_20px_rgba(236,72,153,0.5)] hover:bg-pink-600 transition-all uppercase tracking-widest border-r-4 border-b-4 border-pink-700"
              >
                <Check className="w-6 h-6" />
                Initialize
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
