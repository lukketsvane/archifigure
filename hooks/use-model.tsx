"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import * as THREE from "three"
import { saveModelToDatabase, saveModelToProject, getProjects, checkModelExists, createProject } from "@/app/actions"
import { toast } from "sonner"
import { Project } from "@/types/database"

interface ModelState {
  model: THREE.Group | null
  error: string | null
  loading: boolean
  saving: boolean
  saveSuccess: boolean
}

interface UseModelOptions {
  url: string
  inputImage?: string
  resolution?: number
  currentProjectId?: string | null
  onProjectSelect?: (projectId: string) => void
}

export function useModel({
  url,
  inputImage,
  resolution,
  currentProjectId,
  onProjectSelect,
}: UseModelOptions) {
  const [state, setState] = useState<ModelState>({
    model: null,
    error: null,
    loading: true,
    saving: false,
    saveSuccess: false,
  })
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(currentProjectId)
  const materials = useRef(new Map<THREE.Mesh, THREE.Material | THREE.Material[]>())
  const matteMaterial = useRef(
    new THREE.MeshStandardMaterial({
      color: 0xffffff, 
      roughness: 0.8,  
      metalness: 0.0,
    })
  )

  // Load projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const projectsList = await getProjects()
        setProjects(projectsList)
      } catch (error) {
        console.error("Error fetching projects:", error)
      }
    }
    fetchProjects()
  }, [])

  // Error handler
  const handleError = useCallback((error: string) => {
    setState(prev => ({ ...prev, error, loading: false }))
    toast.error(error)
  }, [])

  // Model loading and setup
  const handleModelLoad = useCallback((loadedScene: THREE.Group) => {
    try {
      loadedScene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          materials.current.set(obj, obj.material)
          // Use matte material by default as requested
          obj.material = matteMaterial.current
          obj.castShadow = true
          obj.receiveShadow = true
        }
      })
      const box = new THREE.Box3().setFromObject(loadedScene)
      const offsetY = -box.min.y
      loadedScene.position.y += offsetY
      setState(prev => ({ ...prev, model: loadedScene, loading: false }))
    } catch (err) {
      console.error("Model setup error:", err)
      handleError("Failed to setup model materials")
    }
  }, [handleError])

  // Toggle textures
  const toggleTextures = useCallback(() => {
    if (!state.model) return
    
    let usingMatte = false;
    // Check if at least one mesh is using matte material
    state.model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.material === matteMaterial.current) {
          usingMatte = true;
        }
      }
    });
    
    // Toggle all meshes based on current state
    state.model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        // If we're using matte, switch to original materials
        // If we're using original, switch to matte
        obj.material = usingMatte 
          ? materials.current.get(obj) || obj.material
          : matteMaterial.current;
      }
    });
  }, [state.model])

  // Project handling
  const handleProjectCreated = useCallback(async (projectId: string, projectName: string) => {
    setSelectedProjectId(projectId)
    setProjects((prev) => [
      {
        id: projectId,
        name: projectName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ...prev,
    ])
    toast.success(`Project "${projectName}" created`)

    if (onProjectSelect) {
      onProjectSelect(projectId)
    }
  }, [onProjectSelect])

  // Save model
  const saveModel = useCallback(async () => {
    if (!url || !inputImage || !resolution) return

    setState((prev) => ({ ...prev, saving: true, error: null }))

    try {
      const existsResult = await checkModelExists(url, selectedProjectId || null)

      if (existsResult.exists) {
        toast.info("This model is already saved")
        setState((prev) => ({
          ...prev,
          saving: false,
          saveSuccess: true,
        }))
        return
      }

      if (selectedProjectId) {
        const result = await saveModelToProject(
          selectedProjectId,
          url,
          inputImage,
          inputImage,
          resolution,
          `Model ${new Date().toLocaleString()}`
        )

        if (result) {
          setState((prev) => ({ ...prev, saveSuccess: true }))
          toast.success("Model saved to project successfully")

          if (onProjectSelect && selectedProjectId !== currentProjectId) {
            onProjectSelect(selectedProjectId)
          }
        } else {
          setState((prev) => ({
            ...prev,
            error: "Failed to save model to project",
          }))
          toast.error("Failed to save model to project")
        }
      } else {
        await saveModelToDatabase(url, inputImage, resolution)
        setState((prev) => ({ ...prev, saveSuccess: true }))
        toast.success("Model saved successfully")
      }
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Save failed",
      }))
      toast.error("Failed to save model")
    } finally {
      setState((prev) => ({ ...prev, saving: false }))
    }
  }, [url, inputImage, resolution, selectedProjectId, currentProjectId, onProjectSelect])

  // Cleanup
  useEffect(() => {
    return () => {
      if (state.model) {
        state.model.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            if (obj.geometry) obj.geometry.dispose()
            const material = materials.current.get(obj)
            if (Array.isArray(material)) material.forEach((m) => m.dispose())
            else if (material) material.dispose()
          }
        })
      }
    }
  }, [url, state.model])

  return {
    model: state.model,
    error: state.error,
    loading: state.loading,
    saving: state.saving,
    saveSuccess: state.saveSuccess,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    handleModelLoad,
    handleError,
    toggleTextures,
    handleProjectCreated,
    saveModel,
  }
}