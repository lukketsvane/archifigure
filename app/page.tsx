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
import { Upload, Download, X, CheckCircle2, Image as ImageIcon, ChevronUp, ChevronDown, ChevronRight, Settings, FolderPlus, Github, LayoutGrid } from "lucide-react";
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
import { useTheme } from "next-themes";
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
      className={`relative flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out ${
        isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"
      } hover:border-primary hover:bg-primary/5`}
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
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [modelUrl, setModelUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [autoGenerateMeshes, setAutoGenerateMeshes] = useState(false);
  const [gridExpanded, setGridExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileGalleryOpen, setMobileGalleryOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
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
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

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
  }, []);

  async function processPredictionsConcurrently(urls: string[], concurrency: number) {
    if (!currentProjectId) {
      toast.error("Please select or create a project first");
      return [];
    }
    const results: any[] = [];
    let currentIndex = 0;
    const newPendingSubmissions = urls.map((url, idx) => ({
      id: `pending-${Date.now()}-${idx}`,
      status: "starting",
      input: { image: url, octree_resolution: formData.octree_resolution },
      created_at: new Date().toISOString(),
      project_id: currentProjectId,
    }));
    setPendingSubmissions((prev) => [...newPendingSubmissions, ...prev]);
    async function worker() {
      while (currentIndex < urls.length) {
        const index = currentIndex++;
        try {
          results[index] = await generateModel({
            image: urls[index],
            ...formData,
            project_id: currentProjectId,
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

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    if (!currentProjectId) {
      toast.error("Please select or create a project first");
      setProjectDialogOpen(true);
      return;
    }
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
    if (urls.length > 0 && autoGenerateMeshes && currentProjectId) {
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
    setProjectDialogOpen(false);
    toast.success(`Project "${projectName}" created`);
  };

  const figmaColors = { purple: "#A259FF", red: "#F24E1E", blue: "#1ABCFE", green: "#0ACF83" };

  return (
    <PasswordLock>
      <div className="relative h-[100dvh] w-full overflow-hidden flex flex-col">
        <div className="border-b">
          <div className="flex h-14 items-center px-4 max-w-screen-2xl mx-auto">
            <div className="flex items-center space-x-2 font-semibold text-xl">
              <img
                src={isDarkMode ? "https://i.ibb.co/v4wcBzGK/logo-default.png" : "https://i.ibb.co/BV7rr4z2/logo-default.png"}
                alt="ArchiFigure Logo"
                className="h-8 w-auto"
              />
            </div>
            <div className="ml-auto flex items-center space-x-4">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileGalleryOpen(true)}>
                <LayoutGrid className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => setDesktopGalleryOpen(true)}>
                <LayoutGrid className="h-5 w-5" />
              </Button>
              <Link href="https://github.com/lukketsvane/archifigure/" target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Github className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
        
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
        
        {desktopGalleryOpen && (
          <div className="fixed inset-0 z-50 bg-background flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-medium">Gallery</h2>
              <Button variant="ghost" size="icon" onClick={() => setDesktopGalleryOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-4">
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
                onCreateProject={() => setProjectDialogOpen(true)}
              />
            </div>
          </div>
        )}
        
        <ProjectDialog
          open={projectDialogOpen}
          onOpenChange={setProjectDialogOpen}
          onProjectCreated={handleProjectCreated}
        />
        
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <div className="w-full lg:w-[350px] lg:min-w-[350px] p-4 overflow-y-auto border-r">
            <Card className="p-4 border">
              <Tabs defaultValue="upload">
                <TabsList className="grid grid-cols-2 mb-4">
                  <TabsTrigger value="upload">Last opp</TabsTrigger>
                  <TabsTrigger value="instructions">Instruksjonar</TabsTrigger>
                </TabsList>
                
                <TabsContent value="upload" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="project" className="text-xs">Vald prosjekt</Label>
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
                      Lag Prosjekt
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
                    
                    <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="flex w-full justify-start px-2 text-xs text-muted-foreground hover:text-foreground">
                          <Settings className="h-3.5 w-3.5 mr-2" />
                          <span>Avanserte innstillingar</span>
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
                            <span>Steg: {formData.steps}</span>
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
                            <span>Rettleiing: {formData.guidance_scale.toFixed(1)}</span>
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
                                <SelectItem value="256">256 - rask</SelectItem>
                                <SelectItem value="384">384 - Medium</SelectItem>
                                <SelectItem value="512">512 - detaljert</SelectItem>
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
                              setFormData({ ...formData, remove_background: checked as boolean })
                            }
                          />
                          <span className="text-xs">Fjern Bakgrunn</span>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="autoGenerate"
                            checked={autoGenerateMeshes}
                            onCheckedChange={(checked) => setAutoGenerateMeshes(checked as boolean)}
                          />
                          <span className="text-xs">Automatisk generer figurar</span>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    
                    <Button
                      type="submit"
                      className="w-full h-10 text-sm relative overflow-hidden"
                      style={{ 
                        background: loading || !currentProjectId 
                          ? "#666" 
                          : `linear-gradient(90deg, ${figmaColors.blue}, ${figmaColors.purple})` 
                      }}
                      disabled={loading || imageUrls.length === 0 || !currentProjectId}
                    >
                      <span className="mr-auto">
                        {loading ? (
                          <span className="flex items-center">
                            <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Snekrar modell
                          </span>
                        ) : !currentProjectId ? (
                          "Opprett eit Prosjekt fyrst"
                        ) : (
                          "Lag 3D modell"
                        )}
                      </span>
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="instructions" className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <h2 className="text-lg font-medium">Korleis bruke tenesta</h2>
                    
                    <div className="space-y-2">
                      <h3 className="font-medium">1. Lag eit prosjekt</h3>
                      <p className="text-muted-foreground text-xs">Start med å lage eit prosjekt for å organisere 3D-modellane dine.</p>
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-medium">2. Få eit bilete</h3>
                      <p className="text-muted-foreground text-xs">Last opp ditt eige bilete av ein person, eller bruk tekstgeneratoren til å lage eitt.</p>
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-medium">3. Generer 3D-modell</h3>
                      <p className="text-muted-foreground text-xs">Når du har eit bilete, klikk på "Generer 3D-modell" for å lage ein 3D-figur.</p>
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-medium">4. Sjå og last ned</h3>
                      <p className="text-muted-foreground text-xs">Når prosessen er ferdig, kan du sjå 3D-modellen og laste ned GLB-fila for bruk i arkitekturprosjekta dine.</p>
                    </div>
                    
                    <div className="bg-muted/50 p-3 rounded-md">
                      <div className="flex gap-2">
                        <div className="text-xs">
                          <p className="font-medium">Gode tips:</p>
                          <ul className="list-disc ml-4 mt-1 space-y-1 text-muted-foreground">
                            <li>Bruk bilete med enkel bakgrunn</li>
                            <li>Sjå til at heile kroppen er synleg</li>
                            <li>For arkitektur er ståande figurar best</li>
                            <li>Bruk 256 for raskare generering, 512 for meir detaljar</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-4 overflow-y-auto relative">
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
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        <p className="text-sm text-muted-foreground">Snekrar figur...</p>
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
                        <div className="mt-8 border-t pt-4 w-full">
                          <div className="flex justify-center">
                            <img 
                              src="https://i.ibb.co/qzd8ZXp/vipps.jpg" 
                              alt="vipps" 
                              className="w-64 h-64 object-contain rounded-lg" 
                            />
                          </div>
                          <div className="mt-4">
                            <p className="text-sm text-muted-foreground mb-2">
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