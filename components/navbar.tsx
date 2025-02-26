"use client";

import { Github, LayoutGrid } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface NavbarProps {
  onOpenGallery?: () => void;
}

export function Navbar({ onOpenGallery }: NavbarProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // After mounting, we can safely show the logo based on the theme
  useEffect(() => {
    setMounted(true);
  }, []);

  const logoSrc = mounted && resolvedTheme === "dark" 
    ? "https://i.ibb.co/v4wcBzGK/logo-darkmode.png" 
    : "https://i.ibb.co/BV7rr4z2/logo-default.png";

  return (
    <div className="border-b">
      <div className="flex h-14 items-center px-4 max-w-screen-2xl mx-auto">
        <div className="flex items-center space-x-3">
          {mounted && (
            <div className="h-8 w-8 relative">
              <Image 
                src={logoSrc} 
                alt="ArchiFigure Logo" 
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          )}
          <div className="flex items-center space-x-2 font-semibold text-xl">
            <span className="bg-gradient-to-r from-blue-500 to-purple-600 text-transparent bg-clip-text">ArchiFigure.io</span>
            <span className="text-sm text-muted-foreground hidden md:inline-block">• 3D figures for architectural models</span>
          </div>
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