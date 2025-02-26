"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, Circle, Save, AlertCircle, Trash2, Eye, EyeOff, FolderOpen, Plus, 
  Check, Move, Pencil, Download, X, Search, MoreHorizontal, Grid, List, Calendar
} from "lucide-react";
import Image from "next/image";
import { Prediction, SavedModel } from "@/app/actions";
import { Project, ProjectModel } from "@/types/database";
import { getSavedModels, getProjects, getProjectModels, deleteProject, deleteProjectModel, moveModelsToProject, renameModels } from "@/app/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import JSZip from "jszip";
import { saveAs } from "file-saver";

type PendingSubmission = {
  id: string;
  status: string;
  input: { image: string };
  created_at: string;
  prompt?: string;
  project_id?: string;
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
  activeTab: "stored" | "projects";
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
    activeTab: currentProjectId ? "projects" : "stored",
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  
  const filterItemsBySearch = (items: any[], query: string) => {
    if (!query.trim()) return items;
    return items.filter(item => {
      if ('name' in item && item.name) {
        return item.name.toLowerCase().includes(query.toLowerCase());
      }
      return item.id?.toLowerCase().includes(query.toLowerCase());
    });
  };

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

    const fetchData = async () => {
      try {
        if (!mounted) return;

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

    return () => {
      mounted = false;
    };
  }, [state.activeTab, state.consecutiveErrors, state.showInProgress, showAll, state.pendingSubmissions, state.selectedProjectId]);

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
      
      if (state.activeTab === "stored") {
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

  const renderPendingSubmissionCard = (submission: PendingSubmission) => (
    <Card key={submission.id} className="w-full h-full aspect-square opacity-75">
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
          <Popover>
            <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="outline" size="icon" className="h-6 w-6 bg-background/80">
                <MoreHorizontal className="w-3 h-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-0">
              <Command>
                <CommandList>
                  <CommandItem onSelect={() => {
                    const link = document.createElement("a");
                    link.href = model.url;
                    link.download = `${model.id}.glb`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </CommandItem>
                  <CommandItem 
                    onSelect={async () => {
                      if (confirm('Are you sure you want to delete this model?')) {
                        await fetch("/api/delete-model", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: model.id }),
                        });
                        setState((prev) => ({
                          ...prev,
                          savedModels: prev.savedModels.filter((m) => m.id !== model.id),
                        }));
                        toast.success("Model deleted successfully");
                      }
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </CommandItem>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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
          <Popover>
            <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="outline" size="icon" className="h-6 w-6 bg-background/80">
                <MoreHorizontal className="w-3 h-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-0">
              <Command>
                <CommandList>
                  <CommandItem onSelect={() => {
                    setSelectedItems(new Set([model.id]));
                    setMoveDialogOpen(true);
                  }}>
                    <Move className="mr-2 h-4 w-4" />
                    Move to project
                  </CommandItem>
                  <CommandItem onSelect={() => {
                    setSelectedItems(new Set([model.id]));
                    setNewNameBase(model.name || "");
                    setRenameDialogOpen(true);
                  }}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </CommandItem>
                  <CommandItem 
                    onSelect={async () => {
                      if (confirm('Are you sure you want to delete this model?')) {
                        await deleteProjectModel(model.id);
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
                      }
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </CommandItem>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="p-2 text-xs text-muted-foreground flex items-center justify-between">
        <span>{model.resolution}</span>
        <span>{model.name || "Model"}</span>
      </div>
    </Card>
  );

  const renderProjectCard = (project: Project) => {
    const projectModels = state.projectModels[project.id] || [];
    const thumbnailUrl = projectModels.length > 0 ? projectModels[0].thumbnail_url : null;
    
    return (
      <Card
        key={project.id}
        className={`w-full h-full aspect-square cursor-pointer transition-transform hover:scale-105 active:scale-95 relative ${
          state.selectedProjectId === project.id ? "ring-2 ring-primary" : ""
        }`}
        onClick={() => loadProjectModels(project.id)}
      >
        <div className="relative aspect-square bg-muted flex items-center justify-center">
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt={project.name}
              fill
              className="object-cover rounded-t-lg opacity-70"
              unoptimized
            />
          ) : (
            <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
          )}
          <div className="absolute top-2 right-2">
            <Popover>
              <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="outline" size="icon" className="h-7 w-7 bg-background/80">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-0">
                <Command>
                  <CommandList>
                    <CommandItem
                      onSelect={async () => {
                        if (confirm(`Are you sure you want to delete the project "${project.name}" and all its models?`)) {
                          const success = await deleteProject(project.id);
                          if (success) {
                            setState((prev) => ({
                              ...prev,
                              projects: prev.projects.filter(p => p.id !== project.id),
                              projectModels: Object.fromEntries(
                                Object.entries(prev.projectModels).filter(([key]) => key !== project.id)
                              ),
                              selectedProjectId: prev.selectedProjectId === project.id 
                                ? (prev.projects.find(p => p.id !== project.id)?.id || null)
                                : prev.selectedProjectId
                            }));
                            toast.success("Project deleted successfully");
                          }
                        }
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Project
                    </CommandItem>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm p-2">
            <div className="font-medium truncate" title={project.name}>
              {project.name}
            </div>
            <div className="text-xs text-muted-foreground">
              {projectModels.length} models
            </div>
          </div>
        </div>
      </Card>
    );
  };

  const renderProjectsList = (projects: Project[]) => (
    <div className="divide-y">
      {projects.map(project => {
        const projectModels = state.projectModels[project.id] || [];
        const thumbnailUrl = projectModels.length > 0 ? projectModels[0].thumbnail_url : null;
        
        return (
          <div 
            key={project.id}
            className={`p-3 cursor-pointer hover:bg-accent ${
              state.selectedProjectId === project.id ? "bg-accent" : ""
            }`}
            onClick={() => loadProjectModels(project.id)}
          >
            <div className="flex items-center">
              <div className="mr-3 h-10 w-10 relative rounded overflow-hidden">
                {thumbnailUrl ? (
                  <Image
                    src={thumbnailUrl}
                    alt={project.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-muted">
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium">{project.name}</div>
                <div className="text-xs text-muted-foreground flex items-center">
                  <span className="mr-2">{projectModels.length} models</span>
                  <Calendar className="h-3 w-3 mr-1" />
                  {new Date(project.created_at).toLocaleDateString()}
                </div>
              </div>
              <div>
                <Popover>
                  <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-0">
                    <Command>
                      <CommandList>
                        <CommandItem
                          onSelect={async () => {
                            if (confirm(`Are you sure you want to delete the project "${project.name}" and all its models?`)) {
                              const success = await deleteProject(project.id);
                              if (success) {
                                setState((prev) => ({
                                  ...prev,
                                  projects: prev.projects.filter(p => p.id !== project.id),
                                  selectedProjectId: prev.selectedProjectId === project.id 
                                    ? (prev.projects.find(p => p.id !== project.id)?.id || null)
                                    : prev.selectedProjectId
                                }));
                                toast.success("Project deleted successfully");
                              }
                            }
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Project
                        </CommandItem>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

// Fix for the TabsList error in PredictionsGrid component
const renderControls = () => (
  <div className="border-b bg-muted/40 px-4 py-2">
    <div className="flex items-center justify-between mb-3">
      <div className="relative flex-1 mr-2">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search..."
          className="h-9 pl-8 pr-3"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="flex items-center space-x-2">
        <Button
          variant={viewMode === 'grid' ? 'default' : 'outline'}
          size="icon"
          className="h-9 w-9"
          onClick={() => setViewMode('grid')}
        >
          <Grid className="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === 'list' ? 'default' : 'outline'}
          size="icon"
          className="h-9 w-9"
          onClick={() => setViewMode('list')}
        >
          <List className="h-4 w-4" />
        </Button>
      </div>
    </div>
    {/* Wrap TabsList within Tabs component */}
    <Tabs 
      value={state.activeTab} 
      onValueChange={(value) => setState(prev => ({
        ...prev,
        activeTab: value as "stored" | "projects"
      }))}
    >
      <TabsList className="h-9 w-full grid-cols-2">
        <TabsTrigger value="stored" className="text-xs">
          Stored ({state.savedModels.length})
        </TabsTrigger>
        <TabsTrigger value="projects" className="text-xs">
          Projects ({state.projects.length})
        </TabsTrigger>
      </TabsList>
    </Tabs>
  </div>
);
  return (
    <>
      {renderControls()}
      <Tabs
        defaultValue={state.activeTab}
        className="w-full"
        value={state.activeTab}
        onValueChange={(value) =>
          setState((prev) => ({
            ...prev,
            activeTab: value as "stored" | "projects",
            selectedProjectId: value === "projects" ? prev.selectedProjectId || (prev.projects[0]?.id || null) : null
          }))
        }
      >
        <TabsContent value="stored" className="mt-0">
          {state.loading ? (
            <div className="flex items-center justify-center min-h-[200px] text-sm text-muted-foreground">
              Loading stored models...
            </div>
          ) : (
            <div 
              ref={gridRef}
              className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 relative" : ""}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {filterItemsBySearch(state.savedModels, searchQuery).map(renderSavedModelCard)}
              
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
          )}
        </TabsContent>
        
        <TabsContent value="projects" className="mt-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4 pt-3">
              <h3 className="text-sm font-medium">Projects</h3>
              <Button onClick={handleCreateProject} size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-2" /> New Project
              </Button>
            </div>
            
            {state.loading && state.projects.length === 0 ? (
              <div className="flex items-center justify-center min-h-[200px] text-sm text-muted-foreground">
                Loading projects...
              </div>
            ) : !state.loading && state.projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
                <p className="text-sm text-muted-foreground">No projects yet</p>
                <Button onClick={handleCreateProject} size="sm">
                  <Plus className="h-4 w-4 mr-2" /> Create Project
                </Button>
              </div>
            ) : viewMode === 'grid' ? (
              <div 
                ref={gridRef}
                className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 relative"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {filterItemsBySearch(state.projects, searchQuery).map(renderProjectCard)}
                
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
              renderProjectsList(filterItemsBySearch(state.projects, searchQuery))
            )}
            
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
                    {filterItemsBySearch(state.projectModels[state.selectedProjectId], searchQuery).map(renderProjectModelCard)}
                    
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