"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Save, AlertCircle, Trash2 } from "lucide-react";
import Image from "next/image";
import type { Prediction, SavedModel } from "@/app/actions";
import { getSavedModels } from "@/app/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type PredictionsGridProps = {
  onSelectModel: (meshUrl: string, inputImage?: string, resolution?: number) => void;
  showAll?: boolean;
};

type PredictionsState = {
  predictions: Prediction[];
  savedModels: SavedModel[];
  loading: boolean;
  activeTab: "replicate" | "stored";
  error: string | null;
  consecutiveErrors: number;
};

export const PredictionsGrid = ({ onSelectModel, showAll = false }: PredictionsGridProps) => {
  const [state, setState] = useState<PredictionsState>({
    predictions: [],
    savedModels: [],
    loading: true,
    activeTab: "replicate",
    error: null,
    consecutiveErrors: 0,
  });

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

          const filteredPredictions = showAll
            ? validPredictions
            : validPredictions.filter((p) => p.status === "succeeded");

          if (mounted) {
            setState((prev) => ({
              ...prev,
              predictions: filteredPredictions,
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
  }, [state.activeTab, state.consecutiveErrors, showAll]);

  const renderPredictionCard = (prediction: Prediction) => {
    if (!prediction?.input?.image) return null;

    const isProcessing = ["starting", "processing"].includes(prediction.status);
    const hasError = !!prediction.error;
    const isClickable = prediction.status === "succeeded" && prediction.output?.mesh;

    return (
      <Card
        key={prediction.id}
        className={`flex-shrink-0 w-[160px] snap-start ${
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
      className="flex-shrink-0 w-[160px] snap-start cursor-pointer transition-transform hover:scale-105 active:scale-95 relative"
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
        {/* Container for Save and Delete icons */}
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

  const renderContent = (items: (Prediction | SavedModel)[], isStored: boolean) => {
    if (state.error && !isStored) {
      return (
        <div className="flex items-center justify-center min-h-[200px] text-sm text-destructive">
          {state.error}
        </div>
      );
    }

    if (state.loading && !items.length) {
      return (
        <div className="flex items-center justify-center min-h-[200px] text-sm text-muted-foreground">
          Loading...
        </div>
      );
    }

    if (!state.loading && !items.length) {
      return (
        <div className="flex items-center justify-center min-h-[200px] text-sm text-muted-foreground">
          {isStored ? "No saved models" : "No models found"}
        </div>
      );
    }

    return (
      <div className="flex gap-3 overflow-x-auto pb-4 px-4 -mx-4 snap-x snap-mandatory touch-pan-x min-h-[200px]">
        {items.map((item) =>
          "url" in item
            ? renderSavedModelCard(item as SavedModel)
            : renderPredictionCard(item as Prediction)
        )}
      </div>
    );
  };

  return (
    <Tabs
      defaultValue="replicate"
      className="w-full"
      value={state.activeTab}
      onValueChange={(value) =>
        setState((prev) => ({
          ...prev,
          activeTab: value as "replicate" | "stored",
        }))
      }
    >
      <div className="border-b bg-muted/40 px-4">
        <TabsList className="h-9">
          <TabsTrigger value="replicate" className="text-xs">
            Replicate ({state.predictions.length})
          </TabsTrigger>
          <TabsTrigger value="stored" className="text-xs">
            Stored ({state.savedModels.length})
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="replicate" className="mt-0">
        {renderContent(state.predictions, false)}
      </TabsContent>
      <TabsContent value="stored" className="mt-0">
        {renderContent(state.savedModels, true)}
      </TabsContent>
    </Tabs>
  );
};
