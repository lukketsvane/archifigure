"use client"

import { useState } from "react"
import Image from "next/image"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Eye, Trash2, Pencil, Download, Move } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ModelCardProps {
  id: string
  name?: string
  thumbnailUrl: string
  modelUrl?: string
  status?: string
  project?: string
  className?: string
  isSelected?: boolean
  isSelectable?: boolean
  onSelect?: (id: string) => void
  onView?: (id: string, modelUrl: string, thumbnailUrl: string, resolution?: number) => void
  onRename?: (id: string) => void
  onDelete?: (id: string) => void
  onMove?: (id: string) => void
  onDownload?: (modelUrl: string) => void
  resolution?: number
  selectionMode?: boolean
}

export function ModelCard({
  id,
  name,
  thumbnailUrl,
  modelUrl,
  status = "succeeded",
  project,
  className,
  isSelected = false,
  isSelectable = false,
  onSelect,
  onView,
  onRename,
  onDelete,
  onMove,
  onDownload,
  resolution,
  selectionMode = false,
}: ModelCardProps) {
  const [hover, setHover] = useState(false)
  const isComplete = status === "succeeded" && modelUrl
  const isPending = ["starting", "processing", "pending"].includes(status)
  
  const handleClick = () => {
    if (selectionMode && isSelectable && onSelect) {
      onSelect(id)
    } else if (isComplete && onView && modelUrl) {
      onView(id, modelUrl, thumbnailUrl, resolution)
    }
  }
  
  return (
    <Card
      className={cn(
        "relative overflow-hidden border hover:border-primary/50 transition-all group",
        isSelected && "ring-2 ring-primary border-primary",
        className
      )}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={handleClick}
    >
      {/* Selection indicator */}
      {isSelectable && (
        <div className={cn(
          "absolute top-2 left-2 z-10 rounded-full border w-5 h-5 flex items-center justify-center bg-background/80",
          isSelected && "bg-primary text-primary-foreground"
        )}>
          {isSelected && <CheckCircle2 className="h-4 w-4" />}
        </div>
      )}
      
      {/* Image */}
      <div className="relative aspect-square w-full overflow-hidden">
        <Image
          src={thumbnailUrl}
          alt={name || "3D Model"}
          fill
          className={cn(
            "object-cover transition-all",
            (hover || isSelected) && "scale-105",
            isPending && "opacity-50"
          )}
          unoptimized
        />
        
        {/* Status badge */}
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Badge variant="secondary" className="animate-pulse bg-background/80 backdrop-blur-sm">
              {status === "pending" ? "Waiting" : "Processing"}
            </Badge>
          </div>
        )}
        
        {/* Hover actions */}
        {isComplete && hover && !selectionMode && (
          <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 p-2">
            {onView && modelUrl && (
              <Button size="sm" onClick={(e) => {
                e.stopPropagation()
                onView(id, modelUrl, thumbnailUrl, resolution)
              }}>
                <Eye className="mr-1 h-4 w-4" />
                View
              </Button>
            )}
            
            <div className="flex gap-1">
              {onRename && (
                <Button size="icon" variant="outline" onClick={(e) => {
                  e.stopPropagation()
                  onRename(id)
                }}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              
              {onMove && (
                <Button size="icon" variant="outline" onClick={(e) => {
                  e.stopPropagation()
                  onMove(id)
                }}>
                  <Move className="h-4 w-4" />
                </Button>
              )}
              
              {onDownload && modelUrl && (
                <Button size="icon" variant="outline" onClick={(e) => {
                  e.stopPropagation()
                  onDownload(modelUrl)
                }}>
                  <Download className="h-4 w-4" />
                </Button>
              )}
              
              {onDelete && (
                <Button size="icon" variant="outline" className="hover:bg-destructive hover:text-destructive-foreground" onClick={(e) => {
                  e.stopPropagation()
                  onDelete(id)
                }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="p-2">
        <div className="text-sm font-medium truncate">
          {name || "Unnamed Model"}
        </div>
        {project && (
          <div className="text-xs text-muted-foreground truncate">
            {project}
          </div>
        )}
      </div>
    </Card>
  )
}