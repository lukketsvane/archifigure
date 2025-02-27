"use client";

import { Github, LayoutGrid } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useCallback } from "react";
import { UserAuthNav } from "@/components/user-auth-nav";

export function Navbar() {
  // Using a single logo (no dark mode)
  const logoSrc = "https://i.ibb.co/r2WtjVsM/logo-nav.png";
  
  // Trigger gallery event that page.tsx listens for
  const handleOpenGallery = useCallback(() => {
    window.dispatchEvent(new CustomEvent('openGallery'));
  }, []);

  return (
    <div className="border-b bg-white z-50 relative">
      <div className="flex h-14 items-center px-4 max-w-screen-2xl mx-auto">
        <Link href="/" className="flex items-center space-x-3">
          <div className="h-10 w-10 relative">
            <Image
              src={logoSrc}
              alt="ArchiFigure Logo"
              fill
              className="object-contain"
              unoptimized
            />
          </div>
          <div className="flex items-center space-x-2 font-semibold text-xl">
            <span className="text-sm text-muted-foreground hidden md:inline-block">
              • 3D figures for architectural models
            </span>
          </div>
        </Link>
        <div className="ml-auto flex items-center space-x-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:flex"
            onClick={handleOpenGallery}
          >
            <LayoutGrid className="h-5 w-5" />
          </Button>
          <Link
            href="https://github.com/lukketsvane/archifigure/"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="h-5 w-5" />
          </Link>
          <UserAuthNav />
        </div>
      </div>
    </div>
  );
}
