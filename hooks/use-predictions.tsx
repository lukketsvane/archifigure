"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { getPredictions, Prediction, getSavedModels, SavedModel } from "@/app/actions"

export interface UsePredictionsOptions {
  refreshInterval?: number
  initialShowInProgress?: boolean
}

export function usePredictions({
  refreshInterval = 10000,
  initialShowInProgress = true,
}: UsePredictionsOptions = {}) {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [savedModels, setSavedModels] = useState<SavedModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveErrors, setConsecutiveErrors] = useState(0)
  const [showInProgress, setShowInProgress] = useState(initialShowInProgress)
  
  // Reset error counter when successful
  const resetErrorCounter = useCallback(() => {
    if (consecutiveErrors > 0) {
      setConsecutiveErrors(0)
    }
  }, [consecutiveErrors])

  // Load all predictions
  const loadPredictions = useCallback(async () => {
    try {
      const fetchedPredictions = await getPredictions()
      setPredictions(fetchedPredictions)
      resetErrorCounter()
      return fetchedPredictions
    } catch (err) {
      const newCount = consecutiveErrors + 1
      setConsecutiveErrors(newCount)
      
      if (newCount === 3) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load models"
        setError(errorMessage)
        toast.error("Error loading predictions: " + errorMessage)
      }
      
      return null
    } finally {
      setLoading(false)
    }
  }, [consecutiveErrors, resetErrorCounter])

  // Load saved models
  const loadSavedModels = useCallback(async () => {
    try {
      const fetchedModels = await getSavedModels()
      setSavedModels(fetchedModels)
      resetErrorCounter()
      return fetchedModels
    } catch (err) {
      const newCount = consecutiveErrors + 1
      setConsecutiveErrors(newCount)
      
      if (newCount === 3) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load saved models"
        setError(errorMessage)
        toast.error("Error loading saved models: " + errorMessage)
      }
      
      return null
    } finally {
      setLoading(false)
    }
  }, [consecutiveErrors, resetErrorCounter])

  // Combined refresh function
  const refreshData = useCallback(async (showToast = false) => {
    setLoading(true)
    setError(null)
    
    const [newPredictions, newSavedModels] = await Promise.all([
      loadPredictions(),
      loadSavedModels()
    ])
    
    if (showToast && newPredictions && newSavedModels) {
      toast.success("Models refreshed successfully")
    }
    
    return { predictions: newPredictions, savedModels: newSavedModels }
  }, [loadPredictions, loadSavedModels])

  // Initial load and periodic refresh
  useEffect(() => {
    refreshData()
    
    if (refreshInterval > 0) {
      const timer = setInterval(() => {
        refreshData()
      }, refreshInterval)
      
      return () => clearInterval(timer)
    }
  }, [refreshData, refreshInterval])

  return {
    predictions,
    savedModels,
    loading,
    error,
    refreshData,
    showInProgress,
    setShowInProgress,
  }
}