// components/predictions-grid.tsx
"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Save, AlertCircle, Trash2, Eye, EyeOff, FolderOpen, Plus } from "lucide-react";
import Image from "next/image";
import type { Prediction, SavedModel } from "@/app/actions";
import { Project, ProjectModel } from "@/types/database";
import { getSavedModels, getProjects, getProjectModels, deleteProject, deleteProjectModel } from "@/app/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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

  // Update pending submissions when prop changes
  useEffect(() => {
    if (pendingSubmissions.length > 0) {
      setState(prev => ({
        ...prev,
        pendingSubmissions: [...pendingSubmissions, ...prev.pendingSubmissions]
      }));
    }
  }, [pendingSubmissions]);

  // Update current project ID when prop changes
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
    let mounted = true;
    let pollInterval: NodeJS.Timeout;

    const fetchData = async () => {
      try {
        if (!mounted) return;

        // Fetch replicate models
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

          // Apply filtering based on showInProgress state
          const filteredPredictions = showAll || state.showInProgress
            ? validPredictions
            : validPredictions.filter((p) => p.status === "succeeded");

          // Remove pending submissions that now appear in the validPredictions
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

        // Fetch saved models
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

        // Fetch projects
        if (state.activeTab === "projects") {
          try {
            const projects = await getProjects();
            
            // If there's a selected project or if we just fetched projects
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

  // Count of in-progress items
  const inProgressCount = state.predictions.filter(p => 
    ["starting", "processing"].includes(p.status)
  ).length + state.pendingSubmissions.length;

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
        className="w-full h-full aspect-square"
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
        className={`w-full h-full aspect-square ${
          isClickable ? "cursor-pointer transition-transform hover:scale-105 active:scale-95" : "opacity-75"
        }`}
        onClick={() => {
          if (isClickable && prediction.output?.mesh) {
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
          <Badge
            variant={hasError ? "destructive" : prediction.status === "succeeded" ? "default" : "secondary"}
            className="absolute top-2 right-2 h-5 w-5 p-0 flex items-center justify-center"
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
      className="w-full h-full aspect-square cursor-pointer transition-transform hover:scale-105 active:scale-95 relative"
      onClick={() => onSelectModel(model.url, model.input_image, model.resolution)}
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
          <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center">
            <Save className="w-3 h-3" />
          </Badge>
          <Badge
            variant="destructive"
            className="h-5 w-5 p-0 flex items-center justify-center cursor-pointer"
            onClick={async (e) => {
              e.stopPropagation(); // Prevent model selection
              try {
                const res = await fetch("/api/delete-model", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: model.id }),
                });
                if (res.ok) {
                  setState((prev) => ({
                    ...prev,
                    savedModels: prev.savedModels.filter((m) => m.id !== model.id),
                  }));
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
        <span>Saved</span>
      </div>
    </Card>
  );

  const renderProjectModelCard = (model: ProjectModel) => (
    <Card
      key={model.id}
      className="w-full h-full aspect-square cursor-pointer transition-transform hover:scale-105 active:scale-95 relative"
      onClick={() => onSelectModel(model.model_url, model.input_image, model.resolution)}
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
          <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center">
            <FolderOpen className="w-3 h-3" />
          </Badge>
          <Badge
            variant="destructive"
            className="h-5 w-5 p-0 flex items-center justify-center cursor-pointer"
            onClick={async (e) => {
              e.stopPropagation(); // Prevent model selection
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
        <span>Project</span>
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
              e.stopPropagation(); // Prevent selection
              
              if (confirm(`Are you sure you want to delete the project "${project.name}" and all its models?`)) {
                try {
                  const success = await deleteProject(project.id);
                  if (success) {
                    setState((prev) => {
                      const newState = {
                        ...prev,
                        projects: prev.projects.filter(p => p.id !== project.id),
                      };
                      
                      // Clear the project models cache
                      const { [project.id]: _, ...remainingProjectModels } = prev.projectModels;
                      newState.projectModels = remainingProjectModels;
                      
                      // If this was the selected project, select another one or clear selection
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
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
            {state.projects.map(renderProjectCard)}
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
                  {state.projectModels[state.selectedProjectId].map(renderProjectModelCard)}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
        {/* Always show pending submissions first for replicate tab */}
        {contentType === "replicate" && state.pendingSubmissions.map(renderPendingSubmissionCard)}
        
        {/* Then show regular items */}
        {items.map(item => {
          if (contentType === "stored") {
            return renderSavedModelCard(item as SavedModel);
          } else {
            return renderPredictionCard(item as Prediction);
          }
        })}
      </div>
    );
  };

  return (
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
              Replicate ({state.predictions.length + state.pendingSubmissions.length})
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
  );
};