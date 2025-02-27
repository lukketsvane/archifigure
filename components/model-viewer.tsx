"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { OrbitControls, Html, useGLTF } from "@react-three/drei"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Layers, Download, Save, Expand, X, FolderPlus } from "lucide-react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ProjectDialog } from "@/components/project-dialog"
import { LoadingIndicator } from "@/components/ui/loading-indicator"
import { useModel } from "@/hooks/use-model"
import { tempToColor } from "@/lib/utils"

interface LightState {
  position: [number, number, number]
  intensity: number
  temperature: number
}

const INITIAL_LIGHT_STATE: LightState = {
  position: [2, 2, 2],
  intensity: 1,
  temperature: 6500,
}

// Scene component handling the model and lighting
function ModelScene({ url, onError }: { url: string; onError: (error: string) => void }) {
  const { model, handleModelLoad, handleError, toggleTextures } = useModel({ 
    url, 
    onError 
  });
  const { scene: threeScene } = useThree();
  const [loadingFailed, setLoadingFailed] = useState(false);
  
  // Load the model
  useEffect(() => {
    const loader = new GLTFLoader();
    
    loader.load(
      url,
      (gltf) => {
        handleModelLoad(gltf.scene);
      },
      undefined,
      (error) => {
        console.error("Error loading model:", error);
        setLoadingFailed(true);
        // Don't call handleError to avoid showing intrusive error messages
        // Just mark loading as failed but continue showing UI
      }
    );
  }, [url, handleModelLoad, handleError]);
  
  // Store toggle function in scene userData for external access
  useEffect(() => {
    if (threeScene) {
      threeScene.userData.toggleTextures = toggleTextures;
    }
  }, [threeScene, toggleTextures]);
  
  return (
    <>
      {model ? (
        <primitive object={model} scale={1} />
      ) : (
        <Html center>
          <LoadingIndicator message={loadingFailed ? "Could not load model" : "Loading model..."} />
        </Html>
      )}
      <MovableLight />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <shadowMaterial transparent opacity={0.4} />
      </mesh>
      <OrbitControls
        makeDefault
        minDistance={2}
        maxDistance={10}
        onChange={(e) => {
          if (e && threeScene) {
            threeScene.userData.controls = e.target;
          }
        }}
      />
    </>
  )
}

// Movable light component
function MovableLight() {
  const [lightState, setLightState] = useState<LightState>(INITIAL_LIGHT_STATE)
  const { gl, scene } = useThree()
  const theme = "light"
  
  // Light interaction handler
  useEffect(() => {
    let isDragging = false;
    let isAdjusting = false;
    let prevPos = { x: 0, y: 0 };
    
    const handleMouseDown = (e: MouseEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      
      isDragging = !e.altKey;
      isAdjusting = e.altKey;
      prevPos = { x: e.clientX, y: e.clientY };
      
      if (scene.userData.controls) scene.userData.controls.enabled = false;
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging && !isAdjusting) return;
      
      const dx = e.clientX - prevPos.x;
      const dy = e.clientY - prevPos.y;
      const scaledDx = dx * 0.05;
      const scaledDy = dy * 0.05;
      
      setLightState((prev) => {
        if (isAdjusting) {
          const newTemp = Math.max(2000, Math.min(10000, prev.temperature + scaledDx * 100));
          const newInt = Math.max(0, Math.min(6, prev.intensity - scaledDy));
          return { ...prev, intensity: newInt, temperature: newTemp };
        } else {
          return {
            ...prev,
            position: [
              prev.position[0] + scaledDx,
              prev.position[1] - scaledDy,
              prev.position[2],
            ],
          };
        }
      });
      
      prevPos = { x: e.clientX, y: e.clientY };
    };
    
    const handleMouseUp = () => {
      isDragging = false;
      isAdjusting = false;
      if (scene.userData.controls) scene.userData.controls.enabled = true;
    };
    
    gl.domElement.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    
    return () => {
      gl.domElement.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [gl, scene]);
  
  const color = tempToColor(lightState.temperature);
  
  return (
    <>
      <directionalLight
        position={lightState.position}
        intensity={lightState.intensity}
        color={color}
        castShadow
      />
      <group position={lightState.position}>
        <mesh>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <line>
          <bufferGeometry>
            <float32BufferAttribute
              attach="attributes-position"
              array={new Float32Array([
                0, 0, 0,
                -lightState.position[0],
                -lightState.position[1],
                -lightState.position[2],
              ])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#000" />
        </line>
        <Html position={[0.3, 0.3, 0]} center>
          <div className="px-2 py-1 text-[10px] bg-background/80 backdrop-blur-sm rounded border">
            {lightState.intensity.toFixed(1)}x • {(lightState.temperature / 1000).toFixed(1)}K
          </div>
        </Html>
      </group>
    </>
  );
}

// Main component
export function ModelViewer({
  url,
  inputImage,
  resolution,
  currentProjectId,
  onProjectSelect,
}: {
  url: string
  inputImage?: string
  resolution?: number
  currentProjectId?: string | null
  onProjectSelect?: (projectId: string) => void
}) {
  const theme = "light";
  const [isMobile, setIsMobile] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  
  const {
    error,
    saving,
    saveSuccess,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    handleError,
    handleProjectCreated,
    saveModel
  } = useModel({
    url,
    inputImage,
    resolution,
    currentProjectId,
    onProjectSelect
  });
  
  // Check mobile device and set fullscreen for mobile
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = window.innerWidth < 768;
      setIsMobile(isMobileDevice);
      if (isMobileDevice) setIsFullscreen(true); // Auto fullscreen on mobile
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  // Handle texture toggle
  const handleToggleTextures = useCallback(() => {
    const canvas = document.querySelector("canvas") as any;
    canvas?.__r3f?.scene?.userData.toggleTextures?.();
  }, []);
  
  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);
  
  // Download model
  const downloadModel = useCallback(() => {
    const link = document.createElement("a");
    link.href = url;
    link.download = "model.glb";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [url]);
  
  const bg = "#fff";
  
  // Container classes for responsive design
  const containerClasses = isFullscreen
    ? "fixed inset-0 z-40 bg-background mt-14" // Added mt-14 to leave space for navbar
    : isMobile
    ? "h-screen w-full"
    : "h-full w-full";

  return (
    <div className={containerClasses}>
      {/* Fullscreen toggle button - moved to corner */}
      {isFullscreen && (
        <div className="absolute top-2 right-2 z-10">
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="bg-background/80 backdrop-blur-sm">
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Project dialog */}
      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        onProjectCreated={handleProjectCreated}
      />

      {/* 3D canvas */}
      <div className={`${isMobile ? "min-h-[350px] h-[70vh]" : "h-full w-full"}`}>
        <Canvas shadows camera={{ position: [0, 0, 5] }} style={{ background: bg }}>
          <color attach="background" args={[bg]} />
          <Suspense fallback={null}>
            <ModelScene url={url} onError={handleError} />
          </Suspense>
        </Canvas>
      </div>

      {/* Mobile fullscreen button - removed as mobile is always fullscreen now */}

      {/* Control panel */}
      <div className={`${isFullscreen ? "absolute bottom-4" : "absolute bottom-2"} left-0 right-0 flex justify-center gap-1 z-10 px-2`}>
        <div className="flex gap-1 overflow-x-auto pb-1 max-w-full bg-background/40 backdrop-blur-sm rounded-lg p-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 bg-background/50 backdrop-blur-sm"
            onClick={handleToggleTextures}
            title="Toggle Textures"
          >
            <Layers className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 bg-background/50 backdrop-blur-sm"
            onClick={downloadModel}
            title="Download"
          >
            <Download className="h-4 w-4" />
          </Button>

          {/* Project selection (only show if input data available) */}
          {inputImage && resolution && (
            <div className="flex gap-1">
              <Select
                value={selectedProjectId || undefined}
                onValueChange={(value) => setSelectedProjectId(value)}
              >
                <SelectTrigger className="h-7 text-xs bg-background/50 backdrop-blur-sm w-28">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 bg-background/50 backdrop-blur-sm"
                onClick={() => setProjectDialogOpen(true)}
                title="Create New Project"
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <Alert variant="destructive" className="absolute top-4 left-4 right-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}