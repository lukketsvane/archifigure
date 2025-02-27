// components/mobile-gallery.tsx
"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PredictionsGrid } from "./predictions-grid";
import { Navbar } from "./navbar";

interface MobileGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectModel: (meshUrl: string, inputImage?: string, resolution?: number) => void;
  pendingSubmissions?: any[];
  currentProjectId?: string | null;
  onCreateProject?: () => void;
}

export function MobileGallery({ 
  isOpen, 
  onClose, 
  onSelectModel,
  pendingSubmissions = [],
  currentProjectId,
  onCreateProject
}: MobileGalleryProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <Navbar />
      <div className="flex-1 overflow-y-auto">
        <PredictionsGrid
          onSelectModel={(meshUrl, inputImage, resolution) => {
            onSelectModel(meshUrl, inputImage, resolution);
            onClose();
          }}
          showAll={true}
          pendingSubmissions={pendingSubmissions}
          currentProjectId={currentProjectId}
          onCreateProject={onCreateProject}
        />
      </div>
    </div>
  );
}