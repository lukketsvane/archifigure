"use client";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ModelViewer } from "@/components/model-viewer";
import { PredictionsGrid } from "@/components/predictions-grid";
import { Upload, Download, X, CheckCircle2, Image as ImageIcon, ChevronUp, ChevronDown, ChevronRight, Settings, FolderPlus, LayoutGrid, Github } from "lucide-react";
import Image from "next/image";
import { generateModel, uploadImage, getProjects, checkAndStoreCompletedPredictions } from "./actions";
// Password lock removed
import { toast } from "sonner";
import { ImageGeneration } from "@/components/image-generation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MobileGallery } from "@/components/mobile-gallery";
import { ProjectDialog } from "@/components/project-dialog";
import { Label } from "@/components/ui/label";
import Link from "next/link";
// Theme provider removed
import { useDropzone } from "react-dropzone";
import { Project } from "@/types/database";

function UploadZone({ onUploadComplete, onError, currentCount, maxImages }) {
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
      className={`relative flex flex-col items-center justify-center w-full h-16 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out ${
        isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"
      } hover:border-primary hover:bg-primary/5`}
    >
      <input {...getInputProps()} />
      <Upload className={`w-4 h-4 ${uploading ? "animate-pulse" : ""} text-muted-foreground`} />
      <p className="text-xs text-muted-foreground mt-1">
        {uploading ? "Uploading..." : isDragActive ? "Drop" : "Upload"}
      </p>
    </div>
  );
}

export default function ModelGenerator() {
  const [activeTab, setActiveTab] = useState("upload");
  const [loading, setLoading] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [modelUrl, setModelUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [autoGenerateMeshes, setAutoGenerateMeshes] = useState(false);
  const [gridExpanded, setGridExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileGalleryOpen, setMobileGalleryOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [desktopGalleryOpen, setDesktopGalleryOpen] = useState(false);
  const [formData, setFormData] = useState({
    steps: 50,
    guidance_scale: 5.5,
    seed: Math.floor(Math.random() * 10000),
    octree_resolution: 256,
    remove_background: true,
  });
  // Dark mode removed
  const isDarkMode = false;

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const projectsList = await getProjects();
        setProjects(projectsList);
      } catch (error) {
        console.error("Failed to load projects:", error);
      }
    };
    loadProjects();
    
    // Setup event listener for gallery open from navbar
    const handleGalleryOpen = () => {
      if (window.innerWidth >= 768) {
        setDesktopGalleryOpen(true);
      } else {
        setMobileGalleryOpen(true);
      }
    };
    window.addEventListener('openGallery', handleGalleryOpen);
    
    return () => {
      window.removeEventListener('openGallery', handleGalleryOpen);
    };
  }, []);

  // Auto-check for completed predictions every 30 seconds
  useEffect(() => {
    const checkCompletedTimer = setInterval(() => {
      checkAndStoreCompletedPredictions().catch(err => 
        console.error("Background save error:", err)
      );
    }, 30000);
    
    // Initial check when component mounts
    checkAndStoreCompletedPredictions().catch(err => 
      console.error("Initial background save error:", err)
    );
    
    return () => {
      clearInterval(checkCompletedTimer);
    };
  }, []);

  // Modified processPredictionsConcurrently function to make project optional
  async function processPredictionsConcurrently(urls: string[], concurrency: number) {
    const results: any[] = [];
    let currentIndex = 0;
    const newPendingSubmissions = urls.map((url, idx) => ({
      id: `pending-${Date.now()}-${idx}`,
      status: "starting",
      input: { image: url, octree_resolution: formData.octree_resolution },
      created_at: new Date().toISOString(),
      project_id: currentProjectId || undefined,
    }));
    setPendingSubmissions((prev) => [...newPendingSubmissions, ...prev]);
    async function worker() {
      while (currentIndex < urls.length) {
        const index = currentIndex++;
        try {
          results[index] = await generateModel({
            image: urls[index],
            ...formData,
            project_id: currentProjectId || undefined,
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

  // Modified handleSubmit function to make project optional
  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    if (imageUrls.length === 0) return;
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
      setImageUrls([]);
    } catch (err: any) {
      setError("Generation failed");
      toast.error("Error: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const removeImage = (url: string) => {
    setImageUrls((prev) => prev.filter((img) => img !== url));
  };

  const handleImagesGenerated = (urls: string[]) => {
    setImageUrls(urls);
    if (urls.length > 0 && autoGenerateMeshes) {
      handleSubmit();
    }
  };

  const handleImageGenerationSubmit = (submissions: any[]) => {
    if (submissions && submissions.length > 0) {
      setPendingSubmissions((prev) => [...submissions, ...prev]);
    }
  };

  const handleProjectCreated = (projectId: string, projectName: string) => {
    setCurrentProjectId(projectId);
    setProjects((prev) => [
      {
        id: projectId,
        name: projectName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    toast.success(`Project "${projectName}" created`);
  };

  const figmaColors = { purple: "#A259FF", red: "#F24E1E", blue: "#1ABCFE", green: "#0ACF83" };

  return (
      <div className="relative h-[100dvh] w-full overflow-hidden flex flex-col">
        {/* Second navbar removed */}
        
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
          onCreateProject={() => {}}
        />
        
        {desktopGalleryOpen && (
          <div className="fixed inset-0 z-50 bg-background flex flex-col">
            <div className="flex justify-between items-center p-3 border-b">
              <h2 className="text-base font-medium">Gallery</h2>
              <Button variant="ghost" size="icon" onClick={() => setDesktopGalleryOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto">
              <PredictionsGrid
                onSelectModel={(meshUrl, inputImage, resolution) => {
                  setModelUrl(meshUrl);
                  if (inputImage) setImageUrls([inputImage]);
                  if (resolution) {
                    setFormData((prev) => ({ ...prev, octree_resolution: resolution }));
                  }
                  setDesktopGalleryOpen(false);
                }}
                pendingSubmissions={pendingSubmissions}
                currentProjectId={currentProjectId}
                onCreateProject={() => {}}
              />
            </div>
          </div>
        )}
        
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <div className="w-full lg:w-[320px] lg:min-w-[320px] p-3 overflow-y-auto border-r">
            <Card className="p-3 border">
              <Tabs defaultValue="upload">
                <TabsList className="grid grid-cols-2 mb-3">
                  <TabsTrigger value="upload" className="text-xs">Last opp</TabsTrigger>
                  <TabsTrigger value="instructions" className="text-xs">Instruksjonar</TabsTrigger>
                </TabsList>
                
                <TabsContent value="upload" className="space-y-3">
                  <Select 
                    value={currentProjectId || undefined} 
                    onValueChange={setCurrentProjectId}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Velg prosjekt (valgfritt)" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map(project => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                
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
                      
                      <div className="pt-1">
                        <ImageGeneration 
                          onImagesGenerated={handleImagesGenerated} 
                          onSubmit={handleImageGenerationSubmit}
                          forcedAspectRatio="1:1"
                          useMostPermissiveSafetyLevel={true}
                          useImagen3={true}
                        />
                      </div>
                    </div>
                    
                    {/* Advanced settings removed */}
                    
                    {imageUrls.length > 0 && (
                      <Button
                        type="submit"
                        className="w-full h-9 text-sm relative overflow-hidden"
                        style={{ 
                          background: loading 
                            ? "#666" 
                            : `linear-gradient(90deg, ${figmaColors.blue}, ${figmaColors.purple})` 
                        }}
                        disabled={loading}
                      >
                        <span className="mr-auto">
                          {loading ? (
                            <span className="flex items-center">
                              <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Snekrar modell
                            </span>
                          ) : (
                            "Lag 3D modell"
                          )}
                        </span>
                      </Button>
                    )}
                  </form>
                </TabsContent>
                <TabsContent value="instructions" className="space-y-3">
                  <div className="space-y-2 text-sm">
                    <h2 className="text-base font-medium">Korleis bruke tenesta</h2>
                    
                    <div className="space-y-1">
                      <h3 className="font-medium text-sm">1. Få eit bilete</h3>
                      <p className="text-muted-foreground text-xs">Last opp ditt eige bilete av ein person, eller bruk tekstgeneratoren til å lage eitt.</p>
                    </div>
                    
                    <div className="space-y-1">
                      <h3 className="font-medium text-sm">2. Generer 3D-modell</h3>
                      <p className="text-muted-foreground text-xs">Når du har eit bilete, klikk på "Lag 3D-modell" for å lage ein 3D-figur.</p>
                    </div>
                    
                    <div className="space-y-1">
                      <h3 className="font-medium text-sm">3. Lagre i prosjekt (valfritt)</h3>
                      <p className="text-muted-foreground text-xs">Lagre modellen i eit prosjekt for betre organisering.</p>
                    </div>
                    
                    <div className="space-y-1">
                      <h3 className="font-medium text-sm">4. Last ned</h3>
                      <p className="text-muted-foreground text-xs">Last ned GLB-fila for bruk i arkitekturprosjekta dine.</p>
                    </div>
                    
                    <div className="bg-muted/50 p-2 rounded-md mt-2">
                      <p className="font-medium text-xs mb-1">Gode tips:</p>
                      <ul className="list-disc ml-4 text-xs space-y-0.5 text-muted-foreground">
                        <li>Bruk bilete med enkel bakgrunn</li>
                        <li>Sjå til at heile kroppen er synleg</li>
                        <li>For arkitektur er ståande figurar best</li>
                        <li>Bruk 256 for raskare generering, 512 for meir detaljar</li>
                      </ul>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-3 overflow-y-auto relative">
              <Card className="w-full h-full relative overflow-hidden border">
                {modelUrl ? (
                  <div className="absolute inset-0">
                    <ModelViewer
                      url={modelUrl}
                      inputImage={imageUrls[0]}
                      resolution={formData.octree_resolution}
                      currentProjectId={currentProjectId}
                      onProjectSelect={setCurrentProjectId}
                    />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/30">
                    {loading ? (
                      <div className="flex flex-col items-center space-y-2">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        <p className="text-sm text-muted-foreground">Snekrar figur...</p>
                      </div>
                    ) : imageUrls.length > 0 ? (
                      <div className="w-full h-full grid grid-cols-2 md:grid-cols-3 gap-2 p-3 overflow-auto">
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
                      <div className="flex flex-col items-center space-y-2 max-w-sm text-center p-4">
                        <div className="mt-4 border-t pt-3 w-full">
                          <div className="flex justify-center">
                            <img 
                              src="https://i.ibb.co/qzd8ZXp/vipps.jpg" 
                              alt="vipps" 
                              className="w-48 h-48 object-contain rounded-lg" 
                            />
                          </div>
                          <div className="mt-3">
                            <p className="text-xs text-muted-foreground">
                              Vær grei å vipps en kopp kaffi, det koster meg noen kroner hver gang du lager en modell
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
            <div className={`border-t transition-all duration-300 ease-in-out ${gridExpanded ? 'h-[60vh]' : 'h-10'} hidden md:block`}>
              <div className="flex items-center justify-between px-3 h-10 bg-muted/40">
                <span className="text-xs font-medium">Gallery</span>
                <Button
                  variant="ghost" 
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setGridExpanded(!gridExpanded)}
                >
                  {gridExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                </Button>
              </div>
              
              {gridExpanded && (
                <div className="h-[calc(60vh-2.5rem)] overflow-hidden">
                  <PredictionsGrid
                    onSelectModel={(meshUrl, inputImage, resolution) => {
                      setModelUrl(meshUrl);
                      if (inputImage) setImageUrls([inputImage]);
                      if (resolution)
                        setFormData((prev) => ({ ...prev, octree_resolution: resolution }));
                    }}
                    pendingSubmissions={pendingSubmissions}
                    currentProjectId={currentProjectId}
                    onCreateProject={() => {}}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}