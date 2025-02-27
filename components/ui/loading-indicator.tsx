"use client"

import { Loader2 } from "lucide-react"

interface LoadingIndicatorProps {
  message?: string
  error?: boolean
  size?: "small" | "default" | "large"
}

export function LoadingIndicator({ 
  message = "Loading...", 
  error = false,
  size = "default" 
}: LoadingIndicatorProps) {
  const sizeClasses = {
    small: "h-4 w-4",
    default: "h-6 w-6",
    large: "h-8 w-8"
  }
  
  return (
    <div className="flex flex-col items-center gap-2">
      <Loader2 className={`${sizeClasses[size]} ${!error && "animate-spin"} text-muted-foreground`} />
      <div className="text-sm text-muted-foreground">{message}</div>
    </div>
  )
}