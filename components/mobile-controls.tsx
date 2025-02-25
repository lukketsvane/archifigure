"use client"

import type React from "react"
import { useState } from "react"
import { ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface MobileControlsProps {
  children: React.ReactNode
  onGalleryClick: () => void
}

export function MobileControls({ children, onGalleryClick }: MobileControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-lg border-t transition-transform duration-300 ease-in-out z-50",
        !isExpanded && "translate-y-[calc(100%-2.5rem)]"
      )}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />} Controls
        </button>
        <button
          onClick={onGalleryClick}
          className="text-xs border border-black rounded px-2 py-1 text-muted-foreground"
        >
          Gallery
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-3">{children}</div>
    </div>
  )
}
  