// components/navbar.tsx
"use client";

import { Github, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface NavbarProps {
  onOpenGallery?: () => void;
}

export function Navbar({ onOpenGallery }: NavbarProps) {
  return (
    <div className="border-b">
      <div className="flex h-14 items-center px-4 max-w-screen-2xl mx-auto">
        <div className="flex items-center space-x-2 font-semibold text-xl">
          <span className="bg-gradient-to-r from-blue-500 to-purple-600 text-transparent bg-clip-text">ArchiFigure.io</span>
          <span className="text-sm text-muted-foreground hidden md:inline-block">• 3D figures for architectural models</span>
        </div>
        <div className="ml-auto flex items-center space-x-4">
          {onOpenGallery && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onOpenGallery}
            >
              <LayoutGrid className="h-5 w-5" />
            </Button>
          )}
          <Link
            href="https://github.com/your-username/your-repo"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}