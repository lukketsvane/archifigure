// components/mobile-gallery.tsx
"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PredictionsGrid } from "./predictions-grid";

interface MobileGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectModel: (meshUrl: string, inputImage?: string, resolution?: number) => void;
  pendingSubmissions?: any[];
}

export function MobileGallery({ 
  isOpen, 
  onClose, 
  onSelectModel,
  pendingSubmissions = []
}: MobileGalleryProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-medium">Gallery</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <PredictionsGrid
          onSelectModel={(meshUrl, inputImage, resolution) => {
            onSelectModel(meshUrl, inputImage, resolution);
            onClose();
          }}
          showAll={true}
          pendingSubmissions={pendingSubmissions}
        />
      </div>
    </div>
  );
}