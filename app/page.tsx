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
  Settings,
  FolderPlus,
  Github,
  LayoutGrid
} from "lucide-react";
import Image from "next/image";
import { generateModel, uploadImage, getProjects } from "./actions";
import PasswordLock from "@/components/password-lock";
import { toast } from "sonner";
import { ImageGeneration } from "@/components/image-generation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MobileGallery } from "@/components/mobile-gallery";
import { ProjectDialog } from "@/components/project-dialog";
import { Label } from "@/components/ui/label";
import Link from "next/link";

import { useDropzone } from "react-dropzone";
import { Project } from "@/types/database";

function UploadZone({
  onUploadComplete,
  onError,
  currentCount,
  maxImages,
}) {
  const [uploading, setUploading] = useState(false);

  const handleDrop = async (acceptedFiles) => {
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
  // State variables
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
  const [mobileGalleryOpen, setMobileGalleryOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [cooldown, setCooldown] = useState(0);
  const [timeoutId, setTimeoutId] = useState(null);
  
  const [formData, setFormData] = useState({
    steps: 50,
    guidance_scale: 5.5,
    seed: Math.floor(Math.random() * 10000),
    octree_resolution: 256,
    remove_background: true,
  });

  // Load projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const projectsList = await getProjects();
        setProjects(projectsList);
        
        // If there's at least one project, select the first one
        if (projectsList.length > 0 && !currentProjectId) {
          setCurrentProjectId(projectsList[0].id);
        }
      } catch (error) {
        console.error("Failed to load projects:", error);
      }
    };
    
    loadProjects();
  }, [currentProjectId]);

  // Reset cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [timeoutId]);

  // Process predictions concurrently
  async function processPredictionsConcurrently(urls, concurrency) {
    if (!currentProjectId) {
      toast.error("Please select or create a project first");
      return [];
    }
    
    const results = [];
    let currentIndex = 0;
    
    // Create pending submission cards
    const newPendingSubmissions = urls.map((url, idx) => ({
      id: `pending-${Date.now()}-${idx}`,
      status: "starting",
      input: { 
        image: url,
        octree_resolution: formData.octree_resolution
      },
      created_at: new Date().toISOString(),
      project_id: currentProjectId
    }));
    
    setPendingSubmissions(prev => [...newPendingSubmissions, ...prev]);
    
    async function worker() {
      while (currentIndex < urls.length) {
        const index = currentIndex++;
        try {
          results[index] = await generateModel({ 
            image: urls[index], 
            ...formData,
            project_id: currentProjectId
          });
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
    
    if (!currentProjectId) {
      toast.error("Please select or create a project first");
      setProjectDialogOpen(true);
      return;
    }
    
    if (imageUrls.length === 0 || cooldown > 0) return;
    
    setLoading(true);
    setError("");
    setSuccess(false);
    
    try {
      const results = await processPredictionsConcurrently(imageUrls, 10);
      
      if (!results.length) {
        setError("Generation failed");
        return;
      }
      
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
    if (urls.length > 0 && !cooldown && autoGenerateMeshes && currentProjectId) {
      handleSubmit();
    }
  };
  
  const handleImageGenerationSubmit = (submissions) => {
    if (submissions && submissions.length > 0) {
      setPendingSubmissions(prev => [...submissions, ...prev]);
    }
  };

  const handleProjectCreated = (projectId, projectName) => {
    setCurrentProjectId(projectId);
    setProjects(prev => [{ 
      id: projectId, 
      name: projectName, 
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, ...prev]);
    setProjectDialogOpen(false);
    toast.success(`Project "${projectName}" created`);
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
        {/* Navbar */}
        <div className="border-b">
          <div className="flex h-14 items-center px-4 max-w-screen-2xl mx-auto">
            <div className="flex items-center space-x-2 font-semibold text-xl">
              <span className="bg-gradient-to-r from-blue-500 to-purple-600 text-transparent bg-clip-text">ArchiFigure.io</span>
              <span className="text-sm text-muted-foreground hidden md:inline-block">• 3D figures for architectural models</span>
            </div>
            <div className="ml-auto flex items-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileGalleryOpen(true)}
              >
                <LayoutGrid className="h-5 w-5" />
              </Button>
              <Link
                href="https://github.com/your-username/your-repo"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
        
        {/* Mobile Gallery Component */}
        <MobileGallery
          isOpen={mobileGalleryOpen}
          onClose={() => setMobileGalleryOpen(false)}
          onSelectModel={(meshUrl, inputImage, resolution) => {
            setModelUrl(meshUrl);
            if (inputImage) setImageUrls([inputImage]);
            if (resolution) {
              setFormData((prev) => ({ ...prev, octree_resolution: resolution }));
            }
          }}
          pendingSubmissions={pendingSubmissions}
          currentProjectId={currentProjectId}
          onCreateProject={() => setProjectDialogOpen(true)}
        />
        
        {/* Project Dialog */}
        <ProjectDialog
          open={projectDialogOpen}
          onOpenChange={setProjectDialogOpen}
          onProjectCreated={handleProjectCreated}
        />
        
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
                  {/* Project selection */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="project" className="text-xs">Current Project</Label>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => setProjectDialogOpen(true)}
                    >
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {currentProjectId ? (
                    <div className="text-sm px-2 py-1 bg-muted rounded-md">
                      {projects?.find(p => p.id === currentProjectId)?.name || "Loading project..."}
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="w-full justify-center text-muted-foreground"
                      onClick={() => setProjectDialogOpen(true)}
                    >
                      <FolderPlus className="h-4 w-4 mr-2" />
                      Create Project
                    </Button>
                  )}
                
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
                        background: loading || cooldown > 0 || !currentProjectId 
                          ? "#666" 
                          : `linear-gradient(90deg, ${figmaColors.blue}, ${figmaColors.purple})` 
                      }}
                      disabled={loading || imageUrls.length === 0 || cooldown > 0 || !currentProjectId}
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
                        ) : !currentProjectId ? (
                          "Create a Project First"
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
                      <h3 className="font-medium">1. Create a project</h3>
                      <p className="text-muted-foreground text-xs">Start by creating a project to organize your 3D models.</p>
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-medium">2. Get an image</h3>
                      <p className="text-muted-foreground text-xs">Upload your own image of a person, or use our text-to-image generator to create one.</p>
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-medium">3. Generate 3D model</h3>
                      <p className="text-muted-foreground text-xs">Once you have an image, click "Generate 3D Model" to create a 3D figure.</p>
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-medium">4. View and download</h3>
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
                    {/* For mobile, we apply the aspect-square class to ensure 1:1 ratio */}
                    <div className="w-full h-full md:h-full aspect-square md:aspect-auto">
                      <ModelViewer
                        url={modelUrl}
                        inputImage={imageUrls[0]}
                        resolution={formData.octree_resolution}
                        currentProjectId={currentProjectId}
                        onProjectSelect={setCurrentProjectId}
                      />
                    </div>
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
                          First create a project, then upload an image or use the generator to create a 3D figure
                        </p>
                        {!currentProjectId && (
                          <Button onClick={() => setProjectDialogOpen(true)}>
                            <FolderPlus className="h-4 w-4 mr-2" />
                            Create Project
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
            
            {/* Collapsible predictions grid - hidden on mobile */}
            <div className={`border-t transition-all duration-300 ease-in-out ${gridExpanded ? 'h-[70vh]' : 'h-12'} hidden md:block`}>
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
                    currentProjectId={currentProjectId}
                    onCreateProject={() => setProjectDialogOpen(true)}
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