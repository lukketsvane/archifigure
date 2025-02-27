"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface GlassContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  intensity?: "light" | "medium" | "heavy"
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "full"
  border?: boolean
}

export function GlassContainer({
  children,
  className,
  intensity = "medium",
  rounded = "md",
  border = true,
  ...props
}: GlassContainerProps) {
  const intensityClasses = {
    light: "bg-background/30 backdrop-blur-sm",
    medium: "bg-background/50 backdrop-blur-md",
    heavy: "bg-background/70 backdrop-blur-lg",
  }
  
  const roundedClasses = {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    full: "rounded-full",
  }
  
  return (
    <div
      className={cn(
        intensityClasses[intensity],
        roundedClasses[rounded],
        border && "border",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}