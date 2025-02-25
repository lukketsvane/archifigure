
"use client";



import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ModelViewer } from "@/components/model-viewer";
import { PredictionsGrid } from "@/components/predictions-grid";
import { 
  Upload, 
  Download, 
  X, 
  CheckCircle2, 
  Image as ImageIcon, 
  ChevronUp, 
  ChevronDown,
  ChevronRight,
  Settings
} from "lucide-react";
import Image from "next/image";
import { generateModel, uploadImage } from "./actions";
import { MobileControls } from "@/components/mobile-controls";
import PasswordLock from "@/components/password-lock";
import { toast } from "sonner";
import { ImageGeneration } from "@/components/image-generation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { useDropzone } from "react-dropzone";

interface UploadZoneProps {
  onUploadComplete: (url: string) => void;
  onError: (msg: string) => void;
  currentCount: number;
  maxImages: number;
}

function UploadZone({
  onUploadComplete,
  onError,
  currentCount,
  maxImages,
}: UploadZoneProps) {
  const [uploading, setUploading] = useState(false);

  const handleDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const allowedCount = Math.min(acceptedFiles.length, maxImages - currentCount);
    if (allowedCount <= 0) {
      onError("Maximum number of images reached");
      return;
    }
    setUploading(true);
    const filesToProcess = acceptedFiles.slice(0, allowedCount);
    await Promise.all(
      filesToProcess.map(async (file) => {
        if (!file.type.startsWith("image/")) {
          onError("Invalid image");
          return;
        }
        try {
          const formData = new FormData();
          formData.append("image", file);
          const result = await uploadImage(formData);
          if (result.url) {
            onUploadComplete(result.url);
          }
        } catch (_) {
          onError("Upload failed");
        }
      })
    );
    setUploading(false);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"] },
    maxSize: 32 * 1024 * 1024,
    multiple: true,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        relative flex flex-col items-center justify-center w-full h-20
        border-2 border-dashed rounded-lg cursor-pointer
        transition-colors duration-200 ease-in-out
        ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
        hover:border-primary hover:bg-primary/5
      `}
    >
      <input {...getInputProps()} />
      <Upload className={`w-5 h-5 ${uploading ? "animate-pulse" : ""} text-muted-foreground`} />
      <p className="text-xs text-muted-foreground mt-1">
        {uploading ? "Uploading..." : isDragActive ? "Drop" : "Upload"}
      </p>
    </div>
  );
}
export default function ModelGenerator() {
  const [activeTab, setActiveTab] = useState("upload");
  const [loading, setLoading] = useState(false);
  const [imageUrls, setImageUrls] = useState([]);
  const [modelUrl, setModelUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pendingSubmissions, setPendingSubmissions] = useState([]);
  const [autoGenerateMeshes, setAutoGenerateMeshes] = useState(false);
  const [gridExpanded, setGridExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [formData, setFormData] = useState({
    steps: 50,
    guidance_scale: 5.5,
    seed: Math.floor(Math.random() * 10000),
    octree_resolution: 256,
    remove_background: true,
  });
  const [cooldown, setCooldown] = useState(0);
  const [timeoutId, setTimeoutId] = useState(null);

  // Reset cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [timeoutId]);

  // Process predictions concurrently
  async function processPredictionsConcurrently(urls, concurrency) {
    const results = [];
    let currentIndex = 0; // Changed from a0 to 0
    
    // Create pending submission cards
    const newPendingSubmissions = urls.map((url, idx) => ({
      id: `pending-${Date.now()}-${idx}`,
      status: "starting",
      input: { 
        image: url,
        octree_resolution: formData.octree_resolution
      },
      created_at: new Date().toISOString()
    }));
    
    setPendingSubmissions(prev => [...newPendingSubmissions, ...prev]);
    
    async function worker() {
      while (currentIndex < urls.length) {
        const index = currentIndex++;
        try {
          results[index] = await generateModel({ image: urls[index], ...formData });
        } catch (error) {
          results[index] = { error };
        }
      }
    }
    
    const numWorkers = Math.min(concurrency, urls.length);
    const workers = [];
    for (let i = 0; i < numWorkers; i++) {
      workers.push(worker());
    }
    
    await Promise.all(workers);
    return results;
  }
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (imageUrls.length === 0 || cooldown > 0) return;
    setLoading(true);
    setError("");
    setSuccess(false);
    
    try {
      const results = await processPredictionsConcurrently(imageUrls, 10);
      const allFailed = results.every((r) => r.error);
      
      if (allFailed) {
        setError("Generation failed");
        toast.error("3D model generation failed");
      } else {
        setSuccess(true);
        toast.success("3D model generation started!");
        setTimeout(() => setSuccess(false), 5000);
      }
      
      setCooldown(120);
      if (timeoutId) clearTimeout(timeoutId);
      const id = setTimeout(() => setCooldown(0), 120000);
      setTimeoutId(id);
      setImageUrls([]);
    } catch (err) {
      setError("Generation failed");
      toast.error("Error: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const formatCooldown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const removeImage = (url) => {
    setImageUrls((prev) => prev.filter((img) => img !== url));
  };

  const handleImagesGenerated = (urls) => {
    setImageUrls(urls);
    
    // Auto-submit for 3D generation if enabled
    if (urls.length > 0 && !cooldown && autoGenerateMeshes) {
      handleSubmit();
    }
  };
  
  const handleImageGenerationSubmit = (submissions) => {
    if (submissions && submissions.length > 0) {
      setPendingSubmissions(prev => [...submissions, ...prev]);
    }
  };

  // Color scheme inspired by Figma
  const figmaColors = {
    purple: "#A259FF",
    red: "#F24E1E",
    blue: "#1ABCFE",
    green: "#0ACF83",
  };

  return (
    <PasswordLock>
      <div className="relative h-[100dvh] w-full overflow-hidden flex flex-col">
        {/* Main content area */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left side panel */}
          <div className="w-full lg:w-[350px] lg:min-w-[350px] p-4 overflow-y-auto border-r">
            <Card className="p-4 border">
              <Tabs defaultValue="upload">
                <TabsList className="grid grid-cols-2 mb-4">
                  <TabsTrigger value="upload">Upload</TabsTrigger>
                  <TabsTrigger value="instructions">Instructions</TabsTrigger>
                </TabsList>
                
                <TabsContent value="upload" className="space-y-4">
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="space-y-2">
                      <UploadZone
                        onUploadComplete={(url) => setImageUrls((prev) => [...prev, url])}
                        onError={(msg) => {
                          setError(msg);
                          toast.error(msg);
                        }}
                        currentCount={imageUrls.length}
                        maxImages={10}
                      />
                      
                      {/* Image Generation Component */}
                      <div className="pt-2">
                        <ImageGeneration 
                          onImagesGenerated={handleImagesGenerated} 
                          onSubmit={handleImageGenerationSubmit}
                          forcedAspectRatio="1:1"
                          useMostPermissiveSafetyLevel={true}
                          useImagen3={true}
                        />
                      </div>
                    </div>
                    
                    {/* Collapsible Settings */}
                    <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="flex w-full justify-start px-2 text-xs text-muted-foreground hover:text-foreground">
                          <Settings className="h-3.5 w-3.5 mr-2" />
                          <span>Advanced Settings</span>
                          <ChevronRight className={`h-3.5 w-3.5 ml-auto transition-transform ${settingsOpen ? "rotate-90" : ""}`} />
                        </Button>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent className="pt-2 space-y-3">
                        <div className="space-y-2 pt-1">
                          <Slider
                            id="steps"
                            min={20}
                            max={50}
                            step={1}
                            value={[formData.steps]}
                            onValueChange={([steps]) => setFormData({ ...formData, steps })}
                            className="py-0.5"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Steps: {formData.steps}</span>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Slider
                            id="guidance"
                            min={1}
                            max={20}
                            step={0.1}
                            value={[formData.guidance_scale]}
                            onValueChange={([guidance_scale]) => setFormData({ ...formData, guidance_scale })}
                            className="py-0.5"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Guidance: {formData.guidance_scale.toFixed(1)}</span>
                          </div>
                        </div>
                        
                        <div className="flex justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex">
                              <input
                                type="number"
                                value={formData.seed}
                                onChange={(e) => setFormData({ ...formData, seed: Number(e.target.value) })}
                                className="h-8 w-full bg-background rounded-l-md border border-input px-3 py-2 text-xs ring-offset-background"
                              />
                              <Button 
                                type="button"
                                size="icon" 
                                variant="outline" 
                                className="h-8 w-8 rounded-l-none"
                                onClick={() => setFormData({...formData, seed: Math.floor(Math.random() * 10000)})}
                              >
                                🎲
                              </Button>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">Seed</div>
                          </div>
                          
                          <div className="flex-1">
                            <Select
                              value={formData.octree_resolution.toString()}
                              onValueChange={(value) => setFormData({ ...formData, octree_resolution: Number(value) })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="256">256 - Fast</SelectItem>
                                <SelectItem value="384">384 - Medium</SelectItem>
                                <SelectItem value="512">512 - Detailed</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="text-xs text-muted-foreground mt-1">Quality</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="background"
                            checked={formData.remove_background}
                            onCheckedChange={(checked) =>
                              setFormData({ ...formData, remove_background: checked })
                            }
                          />
                          <span className="text-xs">Remove background</span>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="autoGenerate"
                            checked={autoGenerateMeshes}
                            onCheckedChange={setAutoGenerateMeshes}
                          />
                          <span className="text-xs">Automatically generate meshes</span>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    
                    <Button
                      type="submit"
                      className="w-full h-10 text-sm relative overflow-hidden"
                      style={{ 
                        background: loading || cooldown > 0 ? "#666" : `linear-gradient(90deg, ${figmaColors.blue}, ${figmaColors.purple})` 
                      }}
                      disabled={loading || imageUrls.length === 0 || cooldown > 0}
                    >
                      <span className="mr-auto">
                        {loading ? (
                          <span className="flex items-center">
                            <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Generating...
                          </span>
                        ) : cooldown > 0 ? (
                          <>
                            Wait {formatCooldown(cooldown)}
                            <div
                              className="absolute bottom-0 left-0 h-1 bg-white/30"
                              style={{ width: `${(cooldown / 120) * 100}%`, transition: "width 1s linear" }}
                            />
                          </>
                        ) : (
                          "Generate 3D Model"
                        )}
                      </span>
                    </Button>
                  </form>
                </TabsContent>
                
                <TabsContent value="instructions" className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <h2 className="text-lg font-medium">How to use ArchiFigure.io</h2>
                    
                    <div className="space-y-2">
                      <h3 className="font-medium">1. Get an image</h3>
                      <p className="text-muted-foreground text-xs">Upload your own image of a person, or use our text-to-image generator to create one.</p>
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-medium">2. Generate 3D model</h3>
                      <p className="text-muted-foreground text-xs">Once you have an image, click "Generate 3D Model" to create a 3D figure.</p>
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-medium">3. View and download</h3>
                      <p className="text-muted-foreground text-xs">When processing is complete, view your 3D model and download the GLB file for use in your architectural projects.</p>
                    </div>
                    
                    <div className="bg-muted/50 p-3 rounded-md">
                      <div className="flex gap-2">
                        <div className="text-xs">
                          <p className="font-medium">Best practices:</p>
                          <ul className="list-disc ml-4 mt-1 space-y-1 text-muted-foreground">
                            <li>Use images with a plain background</li>
                            <li>Ensure the full body is visible</li>
                            <li>For architectural scale figures, standing poses work best</li>
                            <li>Use 256 resolution for faster generation, 512 for more detail</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>
          
          {/* Right side content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-4 overflow-y-auto relative">
              <Card className="w-full h-full relative overflow-hidden border">
                {modelUrl ? (
                  <div className="absolute inset-0">
                    <ModelViewer
                      url={modelUrl}
                      inputImage={imageUrls[0]}
                      resolution={formData.octree_resolution}
                    />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/30">
                    {loading ? (
                      <div className="flex flex-col items-center space-y-2">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        <p className="text-sm text-muted-foreground">Generating...</p>
                      </div>
                    ) : imageUrls.length > 0 ? (
                      <div className="w-full h-full grid grid-cols-2 md:grid-cols-3 gap-3 p-4 overflow-auto">
                        {imageUrls.map((url) => (
                          <div key={url} className="relative border rounded aspect-square overflow-hidden">
                            <Image
                              src={url || "/placeholder.svg"}
                              alt="Input"
                              fill
                              className="object-cover"
                              unoptimized
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/70 hover:bg-background/90"
                              onClick={() => removeImage(url)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-3 max-w-sm text-center p-6">
                        <div className="h-16 w-16 rounded-full bg-muted/60 flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
                        </div>
                        <h3 className="text-lg font-medium">No Model Selected</h3>
                        <p className="text-sm text-muted-foreground">
                          Upload an image or use the generator to create a 3D figure
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
            
            {/* Collapsible predictions grid */}
            <div className={`border-t transition-all duration-300 ease-in-out ${gridExpanded ? 'h-[70vh]' : 'h-12'}`}>
              <div className="flex items-center justify-between px-4 h-12 bg-muted/40">
                <span className="text-sm font-medium">Gallery</span>
                <Button
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setGridExpanded(!gridExpanded)}
                >
                  {gridExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </Button>
              </div>
              
              {gridExpanded && (
                <div className="h-[calc(70vh-3rem)] overflow-hidden">
                  <PredictionsGrid
                    onSelectModel={(meshUrl, inputImage, resolution) => {
                      setModelUrl(meshUrl);
                      if (inputImage) setImageUrls([inputImage]);
                      if (resolution)
                        setFormData((prev) => ({ ...prev, octree_resolution: resolution }));
                    }}
                    pendingSubmissions={pendingSubmissions}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PasswordLock>
  );
}