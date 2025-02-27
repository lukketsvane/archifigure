"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Project, ProjectModel } from "@/types/database"
import { 
  getProjects, 
  getProjectModels, 
  createProject, 
  deleteProject,
  deleteProjectModel,
  moveModelsToProject,
  renameModels,
  deleteModelsByIds
} from "@/app/actions"

export interface UseProjectsOptions {
  initialProjectId?: string | null
}

export function useProjects({
  initialProjectId = null
}: UseProjectsOptions = {}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectModels, setProjectModels] = useState<Record<string, ProjectModel[]>>({})
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Load all projects
  const loadProjects = useCallback(async () => {
    setLoading(true)
    
    try {
      const projectsList = await getProjects()
      setProjects(projectsList)
      return projectsList
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load projects"
      setError(errorMessage)
      toast.error(errorMessage)
      return []
    } finally {
      setLoading(false)
    }
  }, [])
  
  // Load models for a specific project
  const loadProjectModels = useCallback(async (projectId: string) => {
    if (!projectId) return []
    
    try {
      const models = await getProjectModels(projectId)
      setProjectModels(prev => ({ ...prev, [projectId]: models }))
      return models
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load project models"
      toast.error(errorMessage)
      return []
    }
  }, [])
  
  // Create new project
  const handleCreateProject = useCallback(async (name: string) => {
    try {
      const newProject = await createProject(name)
      
      if (newProject) {
        setProjects(prev => [newProject, ...prev])
        return newProject
      }
      
      throw new Error("Failed to create project")
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create project"
      toast.error(errorMessage)
      return null
    }
  }, [])
  
  // Delete project
  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      const success = await deleteProject(projectId)
      
      if (success) {
        setProjects(prev => prev.filter(p => p.id !== projectId))
        setProjectModels(prev => {
          const newState = { ...prev }
          delete newState[projectId]
          return newState
        })
        
        if (selectedProjectId === projectId) {
          setSelectedProjectId(null)
        }
        
        toast.success("Project deleted successfully")
        return true
      }
      
      throw new Error("Failed to delete project")
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete project"
      toast.error(errorMessage)
      return false
    }
  }, [selectedProjectId])
  
  // Delete model
  const handleDeleteModel = useCallback(async (modelId: string, projectId: string) => {
    try {
      const success = await deleteProjectModel(modelId)
      
      if (success) {
        setProjectModels(prev => ({
          ...prev,
          [projectId]: prev[projectId]?.filter(m => m.id !== modelId) || []
        }))
        
        toast.success("Model deleted successfully")
        return true
      }
      
      throw new Error("Failed to delete model")
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete model"
      toast.error(errorMessage)
      return false
    }
  }, [])
  
  // Delete multiple models
  const handleDeleteMultipleModels = useCallback(async (modelIds: string[], projectId: string) => {
    try {
      const success = await deleteModelsByIds(modelIds)
      
      if (success) {
        setProjectModels(prev => ({
          ...prev,
          [projectId]: prev[projectId]?.filter(m => !modelIds.includes(m.id)) || []
        }))
        
        toast.success(`${modelIds.length} models deleted successfully`)
        return true
      }
      
      throw new Error("Failed to delete models")
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete models"
      toast.error(errorMessage)
      return false
    }
  }, [])
  
  // Move models to a different project
  const handleMoveModels = useCallback(async (modelIds: string[], sourceProjectId: string, targetProjectId: string) => {
    try {
      const success = await moveModelsToProject(modelIds, targetProjectId)
      
      if (success) {
        // Reload both source and target project models
        await Promise.all([
          loadProjectModels(sourceProjectId),
          loadProjectModels(targetProjectId),
        ])
        
        toast.success(`${modelIds.length} models moved successfully`)
        return true
      }
      
      throw new Error("Failed to move models")
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to move models"
      toast.error(errorMessage)
      return false
    }
  }, [loadProjectModels])
  
  // Rename models
  const handleRenameModels = useCallback(async (modelIds: string[], newName: string, projectId: string) => {
    try {
      const success = await renameModels(modelIds, newName)
      
      if (success) {
        // Reload project models to get updated names
        await loadProjectModels(projectId)
        
        toast.success(`${modelIds.length > 1 ? `${modelIds.length} models` : "Model"} renamed successfully`)
        return true
      }
      
      throw new Error("Failed to rename models")
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to rename models"
      toast.error(errorMessage)
      return false
    }
  }, [loadProjectModels])
  
  // Select a project and load its models
  const selectProject = useCallback(async (projectId: string | null) => {
    setSelectedProjectId(projectId)
    
    if (projectId && !projectModels[projectId]) {
      await loadProjectModels(projectId)
    }
  }, [projectModels, loadProjectModels])
  
  // Initial load
  useEffect(() => {
    loadProjects()
    
    if (initialProjectId) {
      loadProjectModels(initialProjectId)
    }
  }, [loadProjects, loadProjectModels, initialProjectId])
  
  return {
    projects,
    projectModels,
    selectedProjectId,
    loading,
    error,
    loadProjects,
    loadProjectModels,
    createProject: handleCreateProject,
    deleteProject: handleDeleteProject,
    deleteModel: handleDeleteModel,
    deleteMultipleModels: handleDeleteMultipleModels,
    moveModels: handleMoveModels,
    renameModels: handleRenameModels,
    selectProject,
  }
}