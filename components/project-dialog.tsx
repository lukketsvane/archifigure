// components/project-dialog.tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createProject } from "@/app/actions";
import { toast } from "sonner";

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: (projectId: string, projectName: string) => void;
}

export function ProjectDialog({ open, onOpenChange, onProjectCreated }: ProjectDialogProps) {
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!projectName.trim()) {
      toast.error("Please enter a project name");
      return;
    }
    
    setLoading(true);
    
    try {
      const project = await createProject(projectName);
      
      if (project && project.id) {
        toast.success("Project created successfully");
        onProjectCreated(project.id, project.name);
        setProjectName("");
        onOpenChange(false);
      } else {
        toast.error("Failed to create project");
      }
    } catch (error) {
      console.error("Project creation error:", error);
      toast.error("An error occurred while creating the project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Lag nytt prosjekt</DialogTitle>
          <DialogDescription>
            skriv inn eitt namn for prosjektet
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="project-name" className="text-right">
                Namn
              </Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="col-span-3"
                placeholder="My awesome project"
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !projectName.trim()}>
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}