// components/predictions-grid.tsx
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Save, AlertCircle, Trash2, Eye, EyeOff, FolderOpen, Plus, Check, Move, Pencil, Download, X } from "lucide-react";
import Image from "next/image";
import type { Prediction, SavedModel } from "@/app/actions";
import { Project, ProjectModel } from "@/types/database";
import { getSavedModels, getProjects, getProjectModels, deleteProject, deleteProjectModel, moveModelsToProject, renameModels } from "@/app/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import JSZip from "jszip";
import { saveAs } from "file-saver";

type PendingSubmission = {
  id: string;
  status: string;
  input: { image: string };
  created_at: string;
  prompt: string;
};

type PredictionsGridProps = {
  onSelectModel: (meshUrl: string, inputImage?: string, resolution?: number) => void;
  showAll?: boolean;
  pendingSubmissions?: PendingSubmission[];
  currentProjectId?: string | null;
  onCreateProject?: () => void;
};

type PredictionsState = {
  predictions: Prediction[];
  savedModels: SavedModel[];
  pendingSubmissions: PendingSubmission[];
  projects: Project[];
  projectModels: Record<string, ProjectModel[]>;
  loading: boolean;
  activeTab: "replicate" | "stored" | "projects";
  error: string | null;
  consecutiveErrors: number;
  showInProgress: boolean;
  selectedProjectId: string | null;
};

export const PredictionsGrid = ({ 
  onSelectModel, 
  showAll = false, 
  pendingSubmissions = [],
  currentProjectId,
  onCreateProject
}: PredictionsGridProps) => {
  const [state, setState] = useState<PredictionsState>({
    predictions: [],
    savedModels: [],
    pendingSubmissions: [],
    projects: [],
    projectModels: {},
    loading: true,
    activeTab: currentProjectId ? "projects" : "replicate",
    error: null,
    consecutiveErrors: 0,
    showInProgress: true,
    selectedProjectId: currentProjectId || null,
  });

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{startX: number, startY: number, endX: number, endY: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, DOMRect>>(new Map());
  
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);
  const [newNameBase, setNewNameBase] = useState("");

  useEffect(() => {
    if (pendingSubmissions.length > 0) {
      setState(prev => ({
        ...prev,
        pendingSubmissions: [...pendingSubmissions, ...prev.pendingSubmissions]
      }));
    }
  }, [pendingSubmissions]);

  useEffect(() => {
    if (currentProjectId) {
      setState(prev => ({
        ...prev,
        selectedProjectId: currentProjectId,
        activeTab: "projects"
      }));
    }
  }, [currentProjectId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setSelectionMode(true);
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setSelectionMode(false);
    };
    
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    setSelectedItems(new Set());
  }, [state.activeTab]);

  useEffect(() => {
    let mounted = true;
    let pollInterval: NodeJS.Timeout;

    const fetchData = async () => {
      try {
        if (!mounted) return;

        if (state.activeTab === "replicate") {
          const res = await fetch(`/api/predictions?t=${Date.now()}`, {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
          });

          if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);

          const data = await res.json();

          if (!Array.isArray(data)) {
            throw new Error("Invalid API response format");
          }

          const validPredictions = data.filter((p: any): p is Prediction => {
            try {
              return (
                p &&
                typeof p === "object" &&
                typeof p.id === "string" &&
                typeof p.status === "string" &&
                (!p.error || typeof p.error === "string") &&
                p.input &&
                typeof p.input === "object" &&
                (!p.output || typeof p.output === "object") &&
                typeof p.created_at === "string" &&
                (!p.metrics || typeof p.metrics === "object")
              );
            } catch {
              return false;
            }
          });

          const filteredPredictions = showAll || state.showInProgress
            ? validPredictions
            : validPredictions.filter((p) => p.status === "succeeded");

          const apiIds = validPredictions.map(p => p.id);
          const updatedPendingSubmissions = state.pendingSubmissions.filter(
            ps => !ps.id.includes("pending-") || !apiIds.includes(ps.id)
          );

          if (mounted) {
            setState((prev) => ({
              ...prev,
              predictions: filteredPredictions,
              pendingSubmissions: updatedPendingSubmissions,
              consecutiveErrors: 0,
              error: null,
            }));
          }
        }

        try {
          const models = await getSavedModels();
          if (mounted) {
            setState((prev) => ({
              ...prev,
              savedModels: models,
              loading: false,
            }));
          }
        } catch (err) {
          console.error("Failed to fetch saved models:", err);
          if (mounted) {
            setState((prev) => ({
              ...prev,
              error: "Failed to load saved models",
              loading: false,
            }));
          }
        }

        if (state.activeTab === "projects") {
          try {
            const projects = await getProjects();
            
            if (state.selectedProjectId || projects.length > 0) {
              const projectId = state.selectedProjectId || projects[0]?.id;
              
              if (projectId) {
                const projectModels = await getProjectModels(projectId);
                
                if (mounted) {
                  setState((prev) => ({
                    ...prev,
                    projects,
                    projectModels: {
                      ...prev.projectModels,
                      [projectId]: projectModels
                    },
                    selectedProjectId: projectId,
                    loading: false,
                  }));
                }
              } else {
                if (mounted) {
                  setState((prev) => ({
                    ...prev,
                    projects,
                    loading: false,
                  }));
                }
              }
            } else {
              if (mounted) {
                setState((prev) => ({
                  ...prev,
                  projects,
                  loading: false,
                }));
              }
            }
          } catch (err) {
            console.error("Failed to fetch projects:", err);
            if (mounted) {
              setState((prev) => ({
                ...prev,
                error: "Failed to load projects",
                loading: false,
              }));
            }
          }
        }
      } catch (err) {
        console.error("Fetch error:", err);
        if (mounted) {
          setState((prev) => {
            const newErrors = prev.consecutiveErrors + 1;
            if (newErrors >= 3) {
              toast.error("Failed to load predictions");
            }
            return {
              ...prev,
              error: "Failed to load predictions",
              consecutiveErrors: newErrors,
              loading: false,
            };
          });
        }
      }
    };

    fetchData();

    if (state.activeTab === "replicate") {
      const interval = Math.min(5000 * Math.pow(2, state.consecutiveErrors), 30000);
      pollInterval = setInterval(fetchData, interval);
    }

    return () => {
      mounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [state.activeTab, state.consecutiveErrors, state.showInProgress, showAll, state.pendingSubmissions, state.selectedProjectId]);

  const inProgressCount = state.predictions.filter(p => 
    ["starting", "processing"].includes(p.status)
  ).length + state.pendingSubmissions.length;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectionMode || !gridRef.current) return;
    
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
    setIsDragging(true);
  }, [selectionMode]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !selectionBox || !gridRef.current) return;
    
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setSelectionBox(prev => ({
      ...prev!,
      endX: x,
      endY: y
    }));
  }, [isDragging, selectionBox]);
  
  const handleMouseUp = useCallback(() => {
    if (!isDragging || !selectionBox || !gridRef.current) return;
    
    const left = Math.min(selectionBox.startX, selectionBox.endX);
    const right = Math.max(selectionBox.startX, selectionBox.endX);
    const top = Math.min(selectionBox.startY, selectionBox.endY);
    const bottom = Math.max(selectionBox.startY, selectionBox.endY);
    
    const newSelectedItems = new Set(selectedItems);
    
    itemRefs.current.forEach((itemRect, id) => {
      const intersects = !(
        itemRect.right < left ||
        itemRect.left > right ||
        itemRect.bottom < top ||
        itemRect.top > bottom
      );
      
      if (intersects) {
        newSelectedItems.add(id);
      }
    });
    
    setSelectedItems(newSelectedItems);
    setIsDragging(false);
    setSelectionBox(null);
  }, [isDragging, selectionBox, selectedItems]);

  const registerItemRef = useCallback((id: string, element: HTMLElement | null) => {
    if (element) {
      const rect = element.getBoundingClientRect();
      itemRefs.current.set(id, rect);
    }
  }, []);

  const toggleItemSelection = useCallback((id: string, event: React.MouseEvent) => {
    if (!selectionMode) return;
    
    event.stopPropagation();
    event.preventDefault();
    
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, [selectionMode]);

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  const handleDownloadZip = async () => {
    if (selectedItems.size === 0) return;
    
    try {
      toast.loading("Preparing ZIP file...");
      
      let modelUrls: string[] = [];
      
      if (state.activeTab === "replicate") {
        modelUrls = state.predictions
          .filter(p => selectedItems.has(p.id) && p.status === "succeeded" && p.output?.mesh)
          .map(p => p.output!.mesh!);
      } else if (state.activeTab === "stored") {
        modelUrls = state.savedModels
          .filter(m => selectedItems.has(m.id))
          .map(m => m.url);
      } else if (state.activeTab === "projects" && state.selectedProjectId) {
        const selectedProjectModels = state.projectModels[state.selectedProjectId] || [];
        modelUrls = selectedProjectModels
          .filter(m => selectedItems.has(m.id))
          .map(m => m.model_url);
      }
      
      if (modelUrls.length === 0) {
        toast.error("No valid models selected for download");
        return;
      }
      
      const zip = new JSZip();
      
      for (let i = 0; i < modelUrls.length; i++) {
        try {
          const url = modelUrls[i];
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Failed to fetch ${url}`);
          
          const blob = await response.blob();
          const filename = `model-${i + 1}.glb`;
          zip.file(filename, blob);
        } catch (error) {
          console.error(`Error adding file to ZIP:`, error);
        }
      }
      
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, "archifigure-models.zip");
      
      toast.success(`${modelUrls.length} models downloaded as ZIP`);
    } catch (error) {
      console.error("ZIP download error:", error);
      toast.error("Failed to create ZIP file");
    }
  };

  const handleMoveModels = async () => {
    if (selectedItems.size === 0 || !targetProjectId) return;
    setMoveDialogOpen(false);
    
    try {
      toast.loading(`Moving ${selectedItems.size} models...`);
      
      if (state.activeTab !== "projects" || !state.selectedProjectId) {
        toast.error("Only project models can be moved");
        return;
      }
      
      const selectedProjectModels = state.projectModels[state.selectedProjectId] || [];
      const modelIds = selectedProjectModels
        .filter(m => selectedItems.has(m.id))
        .map(m => m.id);
      
      if (modelIds.length === 0) {
        toast.error("No valid models selected for moving");
        return;
      }
      
      const success = await moveModelsToProject(modelIds, targetProjectId);
      
      if (success) {
        toast.success(`${modelIds.length} models moved successfully`);
        clearSelection();
        
        const projectModels = await getProjectModels(state.selectedProjectId);
        setState(prev => ({
          ...prev,
          projectModels: {
            ...prev.projectModels,
            [state.selectedProjectId]: projectModels
          }
        }));
      } else {
        toast.error("Failed to move models");
      }
    } catch (error) {
      console.error("Move error:", error);
      toast.error("Failed to move models");
    }
  };

  const handleRenameModels = async () => {
    if (selectedItems.size === 0 || !newNameBase.trim()) return;
    setRenameDialogOpen(false);
    
    try {
      toast.loading(`Renaming ${selectedItems.size} models...`);
      
      if (state.activeTab !== "projects" || !state.selectedProjectId) {
        toast.error("Only project models can be renamed");
        return;
      }
      
      const selectedProjectModels = state.projectModels[state.selectedProjectId] || [];
      const modelIds = selectedProjectModels
        .filter(m => selectedItems.has(m.id))
        .map(m => m.id);
      
      if (modelIds.length === 0) {
        toast.error("No valid models selected for renaming");
        return;
      }
      
      const success = await renameModels(modelIds, newNameBase);
      
      if (success) {
        toast.success(`${modelIds.length} models renamed successfully`);
        clearSelection();
        
        const projectModels = await getProjectModels(state.selectedProjectId);
        setState(prev => ({
          ...prev,
          projectModels: {
            ...prev.projectModels,
            [state.selectedProjectId]: projectModels
          }
        }));
      } else {
        toast.error("Failed to rename models");
      }
    } catch (error) {
      console.error("Rename error:", error);
      toast.error("Failed to rename models");
    }
  };

  const handleDeleteModels = async () => {
    if (selectedItems.size === 0) return;
    setDeleteDialogOpen(false);
    
    try {
      toast.loading(`Deleting ${selectedItems.size} models...`);
      
      if (state.activeTab === "stored") {
        const modelIds = state.savedModels
          .filter(m => selectedItems.has(m.id))
          .map(m => m.id);
        
        if (modelIds.length === 0) {
          toast.error("No valid models selected for deletion");
          return;
        }
        
        let success = true;
        for (const id of modelIds) {
          try {
            await fetch("/api/delete-model", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id }),
            });
          } catch (error) {
            console.error(`Error deleting model ${id}:`, error);
            success = false;
          }
        }
        
        if (success) {
          toast.success(`${modelIds.length} models deleted successfully`);
          clearSelection();
          
          setState(prev => ({
            ...prev,
            savedModels: prev.savedModels.filter(m => !selectedItems.has(m.id))
          }));
        } else {
          toast.error("Failed to delete some models");
        }
      } else if (state.activeTab === "projects" && state.selectedProjectId) {
        const selectedProjectModels = state.projectModels[state.selectedProjectId] || [];
        const modelIds = selectedProjectModels
          .filter(m => selectedItems.has(m.id))
          .map(m => m.id);
        
        if (modelIds.length === 0) {
          toast.error("No valid models selected for deletion");
          return;
        }
        
        let success = true;
        for (const id of modelIds) {
          try {
            await deleteProjectModel(id);
          } catch (error) {
            console.error(`Error deleting model ${id}:`, error);
            success = false;
          }
        }
        
        if (success) {
          toast.success(`${modelIds.length} models deleted successfully`);
          clearSelection();
          
          const projectModels = await getProjectModels(state.selectedProjectId);
          setState(prev => ({
            ...prev,
            projectModels: {
              ...prev.projectModels,
              [state.selectedProjectId]: projectModels
            }
          }));
        } else {
          toast.error("Failed to delete some models");
        }
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete models");
    }
  };

  const loadProjectModels = async (projectId: string) => {
    try {
      setState(prev => ({ ...prev, loading: true, selectedProjectId: projectId }));
      
      const projectModels = await getProjectModels(projectId);
      
      setState(prev => ({
        ...prev,
        projectModels: {
          ...prev.projectModels,
          [projectId]: projectModels
        },
        loading: false
      }));
    } catch (error) {
      console.error("Error loading project models:", error);
      toast.error("Failed to load project models");
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const handleCreateProject = () => {
    if (onCreateProject) {
      onCreateProject();
    }
  };

  const renderPendingSubmissionCard = (submission: PendingSubmission) => {
    return (
      <Card
        key={submission.id}
        className="w-full h-full aspect-square opacity-75"
      >
        <div className="relative aspect-square bg-muted/60">
          {submission.input.image ? (
            <Image
              src={submission.input.image}
              alt="Pending submission"
              fill
              className="object-cover rounded-t-lg opacity-50"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">Pending</span>
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          </div>
        </div>
        <div className="p-2 text-xs text-muted-foreground flex items-center justify-between">
          <span>Pending</span>
          <span>Processing...</span>
        </div>
      </Card>
    );
  };

  const renderPredictionCard = (prediction: Prediction) => {
    if (!prediction?.input?.image) return null;

    const isProcessing = ["starting", "processing"].includes(prediction.status);
    const hasError = !!prediction.error;
    const isClickable = prediction.status === "succeeded" && prediction.output?.mesh;

    return (
      <Card
        key={prediction.id}
        ref={element => registerItemRef(prediction.id, element)}
        className={`w-full h-full aspect-square ${
          selectedItems.has(prediction.id) ? "ring-2 ring-primary" : ""
        } ${
          isClickable ? "cursor-pointer transition-transform hover:scale-105 active:scale-95" : "opacity-75"
        }`}
        onClick={(e) => {
          if (selectionMode) {
            toggleItemSelection(prediction.id, e);
          } else if (isClickable && prediction.output?.mesh) {
            onSelectModel(prediction.output.mesh, prediction.input.image, prediction.input.octree_resolution);
          }
        }}
      >
        <div className="relative aspect-square">
          <Image
            src={prediction.input.image || "/placeholder.svg"}
            alt="Model preview"
            fill
            className="object-cover rounded-t-lg"
            unoptimized
          />
          <div className="absolute top-2 right-2 flex gap-1">
            {selectedItems.has(prediction.id) && (
              <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center bg-primary">
                <Check className="w-3 h-3" />
              </Badge>
            )}
            <Badge
              variant={hasError ? "destructive" : prediction.status === "succeeded" ? "default" : "secondary"}
              className="h-5 w-5 p-0 flex items-center justify-center"
            >
              {hasError ? (
                <AlertCircle className="w-3 h-3" />
              ) : prediction.status === "succeeded" ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <Circle className={`w-3 h-3 ${isProcessing ? "animate-pulse" : ""}`} />
              )}
            </Badge>
          </div>
        </div>
        <div className="p-2 text-xs text-muted-foreground flex items-center justify-between">
          <span>{prediction.input.octree_resolution || "256"}</span>
          <span>
            {hasError
              ? "Failed"
              : isProcessing
              ? "Processing..."
              : prediction.metrics?.predict_time
              ? `${prediction.metrics.predict_time.toFixed(0)}s`
              : "Ready"}
          </span>
        </div>
      </Card>
    );
  };

  const renderSavedModelCard = (model: SavedModel) => (
    <Card
      key={model.id}
      ref={element => registerItemRef(model.id, element)}
      className={`w-full h-full aspect-square cursor-pointer transition-transform hover:scale-105 active:scale-95 relative
        ${selectedItems.has(model.id) ? "ring-2 ring-primary" : ""}`}
      onClick={(e) => {
        if (selectionMode) {
          toggleItemSelection(model.id, e);
        } else {
          onSelectModel(model.url, model.input_image, model.resolution);
        }
      }}
    >
      <div className="relative aspect-square">
        <Image
          src={model.thumbnail_url || "/placeholder.svg"}
          alt="Saved model"
          fill
          className="object-cover rounded-t-lg"
          unoptimized
        />
        <div className="absolute top-2 right-2 flex gap-1">
          {selectedItems.has(model.id) && (
            <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center bg-primary">
              <Check className="w-3 h-3" />
            </Badge>
          )}
          <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center">
            <Save className="w-3 h-3" />
          </Badge>
          <Badge
            variant="destructive"
            className="h-5 w-5 p-0 flex items-center justify-center cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (selectionMode) return;
              
              fetch("/api/delete-model", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: model.id }),
              }).then(res => {
                if (res.ok) {
                  setState((prev) => ({
                    ...prev,
                    savedModels: prev.savedModels.filter((m) => m.id !== model.id),
                  }));
                  toast.success("Model deleted successfully");
                } else {
                  toast.error("Failed to delete model");
                }
              }).catch(err => {
                toast.error("Error deleting model");
              });
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Badge>
        </div>
      </div>
      <div className="p-2 text-xs text-muted-foreground flex items-center justify-between">
        <span>{model.resolution}</span>
        <span>Saved</span>
      </div>
    </Card>
  );

  const renderProjectModelCard = (model: ProjectModel) => (
    <Card
      key={model.id}
      ref={element => registerItemRef(model.id, element)}
      className={`w-full h-full aspect-square cursor-pointer transition-transform hover:scale-105 active:scale-95 relative
        ${selectedItems.has(model.id) ? "ring-2 ring-primary" : ""}`}
      onClick={(e) => {
        if (selectionMode) {
          toggleItemSelection(model.id, e);
        } else {
          onSelectModel(model.model_url, model.input_image, model.resolution);
        }
      }}
    >
      <div className="relative aspect-square">
        <Image
          src={model.thumbnail_url || "/placeholder.svg"}
          alt="Project model"
          fill
          className="object-cover rounded-t-lg"
          unoptimized
        />
        <div className="absolute top-2 right-2 flex gap-1">
          {selectedItems.has(model.id) && (
            <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center bg-primary">
              <Check className="w-3 h-3" />
            </Badge>
          )}
          <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center">
            <FolderOpen className="w-3 h-3" />
          </Badge>
          <Badge
            variant="destructive"
            className="h-5 w-5 p-0 flex items-center justify-center cursor-pointer"
            onClick={async (e) => {
              e.stopPropagation();
              if (selectionMode) return;
              
              try {
                const success = await deleteProjectModel(model.id);
                if (success) {
                  setState((prev) => {
                    const projectModels = prev.projectModels[model.project_id] || [];
                    return {
                      ...prev,
                      projectModels: {
                        ...prev.projectModels,
                        [model.project_id]: projectModels.filter(m => m.id !== model.id)
                      }
                    };
                  });
                  toast.success("Model deleted successfully");
                } else {
                  toast.error("Failed to delete model");
                }
              } catch (err) {
                toast.error("Error deleting model");
              }
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Badge>
        </div>
      </div>
      <div className="p-2 text-xs text-muted-foreground flex items-center justify-between">
        <span>{model.resolution}</span>
        <span>{model.name || "Project"}</span>
      </div>
    </Card>
  );

  const renderProjectCard = (project: Project) => (
    <Card
      key={project.id}
      className={`w-full h-full aspect-square cursor-pointer transition-transform hover:scale-105 active:scale-95 relative ${
        state.selectedProjectId === project.id ? "ring-2 ring-primary" : ""
      }`}
      onClick={() => loadProjectModels(project.id)}
    >
      <div className="relative aspect-square bg-muted flex items-center justify-center">
        <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
        <div className="absolute top-2 right-2 flex gap-1">
          <Badge
            variant="destructive"
            className="h-5 w-5 p-0 flex items-center justify-center cursor-pointer"
            onClick={async (e) => {
              e.stopPropagation();
              
              if (confirm(`Are you sure you want to delete the project "${project.name}" and all its models?`)) {
                try {
                  const success = await deleteProject(project.id);
                  if (success) {
                    setState((prev) => {
                      const newState = {
                        ...prev,
                        projects: prev.projects.filter(p => p.id !== project.id),
                      };
                      
                      const { [project.id]: _, ...remainingProjectModels } = prev.projectModels;
                      newState.projectModels = remainingProjectModels;
                      
                      if (prev.selectedProjectId === project.id) {
                        newState.selectedProjectId = prev.projects.length > 1 
                          ? prev.projects.find(p => p.id !== project.id)?.id || null
                          : null;
                      }
                      
                      return newState;
                    });
                    toast.success("Project deleted successfully");
                  } else {
                    toast.error("Failed to delete project");
                  }
                } catch (err) {
                  toast.error("Error deleting project");
                }
              }
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Badge>
        </div>
      </div>
      <div className="p-2 text-xs flex flex-col gap-1">
        <div className="font-medium truncate" title={project.name}>
          {project.name}
        </div>
        <div className="text-muted-foreground">
          {new Date(project.created_at).toLocaleDateString()}
        </div>
      </div>
    </Card>
  );

  const renderContent = (contentType: "replicate" | "stored" | "projects") => {
    if (contentType === "projects") {
      if (state.loading && state.projects.length === 0) {
        return (
          <div className="flex items-center justify-center min-h-[200px] text-sm text-muted-foreground">
            Loading projects...
          </div>
        );
      }

      if (!state.loading && state.projects.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
            <p className="text-sm text-muted-foreground">No projects yet</p>
            <Button onClick={handleCreateProject} size="sm">
              <Plus className="h-4 w-4 mr-2" /> Create Project
            </Button>
          </div>
        );
      }

      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-4">
            <h3 className="text-sm font-medium">Projects</h3>
            <Button onClick={handleCreateProject} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" /> New Project
            </Button>
          </div>
          
          <div 
            ref={gridRef}
            className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 relative"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {state.projects.map(renderProjectCard)}
            
            {isDragging && selectionBox && (
              <div
                className="absolute bg-primary/20 border border-primary/50 pointer-events-none z-10"
                style={{
                  left: Math.min(selectionBox.startX, selectionBox.endX),
                  top: Math.min(selectionBox.startY, selectionBox.endY),
                  width: Math.abs(selectionBox.endX - selectionBox.startX),
                  height: Math.abs(selectionBox.endY - selectionBox.startY),
                }}
              />
            )}
          </div>
          
          {state.selectedProjectId && (
            <div className="space-y-2 px-4">
              <h3 className="text-sm font-medium">
                {state.projects.find(p => p.id === state.selectedProjectId)?.name || "Project"} Models
              </h3>
              
              {state.loading ? (
                <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                  Loading models...
                </div>
              ) : state.projectModels[state.selectedProjectId]?.length > 0 ? (
                <div 
                  ref={gridRef}
                  className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 relative"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {state.projectModels[state.selectedProjectId].map(renderProjectModelCard)}
                  
                  {isDragging && selectionBox && (
                    <div
                      className="absolute bg-primary/20 border border-primary/50 pointer-events-none z-10"
                      style={{
                        left: Math.min(selectionBox.startX, selectionBox.endX),
                        top: Math.min(selectionBox.startY, selectionBox.endY),
                        width: Math.abs(selectionBox.endX - selectionBox.startX),
                        height: Math.abs(selectionBox.endY - selectionBox.startY),
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                  No models in this project yet
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    if (state.error && contentType === "replicate") {
      return (
        <div className="flex items-center justify-center min-h-[200px] text-sm text-destructive">
          {state.error}
        </div>
      );
    }

    const items = contentType === "replicate" 
      ? state.predictions 
      : contentType === "stored" 
        ? state.savedModels 
        : [];

    if (state.loading && items.length === 0) {
      return (
        <div className="flex items-center justify-center min-h-[200px] text-sm text-muted-foreground">
          Loading...
        </div>
      );
    }

    if (!state.loading && items.length === 0 && state.pendingSubmissions.length === 0) {
      return (
        <div className="flex items-center justify-center min-h-[200px] text-sm text-muted-foreground">
          {contentType === "stored" ? "No saved models" : "No models found"}
        </div>
      );
    }

    return (
      <div 
        ref={gridRef}
        className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {contentType === "replicate" && state.pendingSubmissions.map(renderPendingSubmissionCard)}
        
        {items.map(item => {
          if (contentType === "stored") {
            return renderSavedModelCard(item as SavedModel);
          } else {
            return renderPredictionCard(item as Prediction);
          }
        })}
        
        {isDragging && selectionBox && (
          <div
            className="absolute bg-primary/20 border border-primary/50 pointer-events-none z-10"
            style={{
              left: Math.min(selectionBox.startX, selectionBox.endX),
              top: Math.min(selectionBox.startY, selectionBox.endY),
              width: Math.abs(selectionBox.endX - selectionBox.startX),
              height: Math.abs(selectionBox.endY - selectionBox.startY),
            }}
          />
        )}
      </div>
    );
  };

  return (
    <>
      <Tabs
        defaultValue={state.activeTab}
        className="w-full"
        value={state.activeTab}
        onValueChange={(value) =>
          setState((prev) => ({
            ...prev,
            activeTab: value as "replicate" | "stored" | "projects",
            selectedProjectId: value === "projects" ? prev.selectedProjectId || (prev.projects[0]?.id || null) : null
          }))
        }
      >
        <div className="border-b bg-muted/40 px-4">
          <div className="flex items-center justify-between">
            <TabsList className="h-9">
              <TabsTrigger value="replicate" className="text-xs">
                Recent ({state.predictions.length + state.pendingSubmissions.length})
              </TabsTrigger>
              <TabsTrigger value="stored" className="text-xs">
                Stored ({state.savedModels.length})
              </TabsTrigger>
              <TabsTrigger value="projects" className="text-xs">
                Projects ({state.projects.length})
              </TabsTrigger>
            </TabsList>
            
            {state.activeTab === "replicate" && inProgressCount > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    showInProgress: !prev.showInProgress,
                  }))
                }
                title={state.showInProgress ? "Hide in-progress models" : "Show in-progress models"}
              >
                {state.showInProgress ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
        <TabsContent value="replicate" className="mt-0">
          {renderContent("replicate")}
        </TabsContent>
        <TabsContent value="stored" className="mt-0">
          {renderContent("stored")}
        </TabsContent>
        <TabsContent value="projects" className="mt-0">
          {renderContent("projects")}
        </TabsContent>
      </Tabs>
      
      {selectedItems.size > 0 && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 
                      bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg 
                      px-4 py-2 flex items-center space-x-2">
          <span className="text-sm font-medium">{selectedItems.size} selected</span>
          
          <div className="h-4 border-r mx-2"></div>
          
          <Button variant="ghost" size="sm" onClick={handleDownloadZip} title="Download as ZIP">
            <Download className="h-4 w-4" />
          </Button>
          
          {state.activeTab === "projects" && (
            <Button variant="ghost" size="sm" onClick={() => setMoveDialogOpen(true)} title="Move to project">
              <Move className="h-4 w-4" />
            </Button>
          )}
          
          {state.activeTab === "projects" && (
            <Button variant="ghost" size="sm" onClick={() => setRenameDialogOpen(true)} title="Rename">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          
          <Button variant="ghost" size="sm" onClick={() => setDeleteDialogOpen(true)} title="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
          
          <div className="h-4 border-r mx-2"></div>
          
          <Button variant="ghost" size="sm" onClick={clearSelection} title="Clear selection">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectedItems.size} models to project</DialogTitle>
            <DialogDescription>
              Select the project where you want to move the selected models.
            </DialogDescription>
          </DialogHeader>
          
          <Select 
            value={targetProjectId || undefined} 
            onValueChange={(value) => setTargetProjectId(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {state.projects
                .filter(project => project.id !== state.selectedProjectId)
                .map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))
              }
            </SelectContent>
          </Select>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleMoveModels} disabled={!targetProjectId}>
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {selectedItems.size > 1 ? `${selectedItems.size} models` : "model"}</DialogTitle>
            <DialogDescription>
              {selectedItems.size > 1 
                ? "Enter a new base name. The models will be named with a number suffix."
                : "Enter a new name for the selected model."}
            </DialogDescription>
          </DialogHeader>
          
          <Input 
            value={newNameBase} 
            onChange={(e) => setNewNameBase(e.target.value)} 
            placeholder="New name" 
          />
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRenameModels} disabled={!newNameBase.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedItems.size} models?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The selected models will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteModels}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};