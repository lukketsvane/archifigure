// app/actions.ts
"use server"

import Replicate from "replicate"
import { put, list, del } from "@vercel/blob"
import { createHash } from "crypto"
import { supabaseAdmin } from "@/lib/supabase"
import { Project, ProjectModel } from "@/types/database"

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

export type SavedModel = {
  id: string
  url: string
  thumbnail_url: string
  created_at: string
  input_image: string
  resolution: number
  model_hash: string
}

export type Prediction = {
  id: string
  status: string
  error?: string
  input: { image?: string; octree_resolution?: number }
  output?: { mesh?: string }
  created_at: string
  metrics?: { predict_time: number }
}

const validateUrl = async (url: string, type?: "model" | "image") => {
  try {
    const res = await fetch(url, { method: "HEAD" })
    if (!res.ok) return false
    return type
      ? type === "model"
        ? ["model/gltf-binary", "application/octet-stream"].some((t) =>
            res.headers.get("content-type")?.includes(t)
          )
        : res.headers.get("content-type")?.startsWith("image/")
      : true
  } catch {
    return false
  }
}

async function getModelsData(): Promise<{ models: SavedModel[] }> {
  try {
    const { blobs } = await list({ prefix: "models-", token: process.env.BLOB_READ_WRITE_TOKEN! })
    // Pick the latest models database blob
    const latest = blobs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0]
    return latest
      ? await fetch(latest.url)
          .then((r) => r.json())
          .catch(() => ({ models: [] }))
      : { models: [] }
  } catch {
    return { models: [] }
  }
}

async function saveModelsData({ models }: { models: SavedModel[] }) {
  if (!models?.length) return
  const blob = new Blob([JSON.stringify({ models }, null, 2)], { type: "application/json" })
  // Save updated models database as a new blob file
  const { url } = await put(`models-${Date.now()}.json`, blob, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN!,
  })
  // List all blobs with prefix and delete older ones, keeping only the latest.
  const { blobs } = await list({ prefix: "models-", token: process.env.BLOB_READ_WRITE_TOKEN! })
  await Promise.all(
    blobs
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .slice(1)
      .map((b) => del(b.url, { token: process.env.BLOB_READ_WRITE_TOKEN! }))
  )
}

export const getPredictions = async (): Promise<Prediction[]> => {
  try {
    // @ts-ignore: ignoring type checking for API response
    const { results } = await fetch(
      "https://api.replicate.com/v1/predictions?deployment=cygnus-holding/hunyuan3d-2",
      {
        headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` },
        cache: "no-store",
      }
    ).then((r) => r.json())

    return (
      (results as Prediction[])
        ?.filter(
          (p: Prediction) =>
            p?.id &&
            p?.status &&
            p?.input?.image &&
            p.status !== "canceled" &&
            (p.status === "succeeded"
              ? p.output?.mesh && new URL(p.output.mesh)
              : !p.error && ["starting", "processing"].includes(p.status))
        )
        .sort((a, b) =>
          ["starting", "processing"].includes(a.status) !==
          ["starting", "processing"].includes(b.status)
            ? ["starting", "processing"].includes(a.status)
              ? -1
              : 1
            : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ) ?? []
    )
  } catch {
    return []
  }
}

export const generateModel = async (data: {
  image: string
  steps: number
  guidance_scale: number
  seed: number
  octree_resolution: number
  remove_background: boolean
  project_id: string
}) => {
  try {
    // Start the prediction with Replicate
    const prediction = await replicate.deployments.predictions.create(
      "cygnus-holding",
      "hunyuan3d-2",
      { input: data }
    )
    
    // Auto-register the prediction for storage when complete
    await registerPredictionForStorage(prediction.id, data.project_id)
    
    return { 
      success: true, 
      debug: { 
        predictionId: prediction.id, 
        status: prediction.status,
        projectId: data.project_id
      } 
    }
  } catch (error) {
    console.error("Generate model error:", error)
    return { success: false, error: "Failed to start generation" }
  }
}

// Register a prediction to be auto-stored when complete
async function registerPredictionForStorage(predictionId: string, projectId: string) {
  try {
    // Create a record in the prediction_storage table to track this prediction
    const { error } = await supabaseAdmin
      .from('prediction_storage')
      .insert({
        prediction_id: predictionId,
        project_id: projectId,
        status: 'pending'
      })
      
    if (error) throw error
    return true
  } catch (error) {
    console.error('Error registering prediction for storage:', error)
    return false
  }
}

// Check and store completed predictions - this would be run by a cron job
export async function checkAndStoreCompletedPredictions() {
  try {
    // Get pending storage predictions
    const { data: pendingPredictions, error } = await supabaseAdmin
      .from('prediction_storage')
      .select('*')
      .eq('status', 'pending')
    
    if (error) throw error
    
    // For each pending prediction, check if it's complete
    for (const pending of pendingPredictions) {
      try {
        const prediction = await replicate.predictions.get(pending.prediction_id)
        
        // If the prediction is complete, store it
        if (prediction.status === 'succeeded' && prediction.output?.mesh) {
          // Save the model to the project
          await saveModelToProject(
            pending.project_id,
            prediction.output.mesh,
            prediction.input.image,
            prediction.input.image,
            prediction.input.octree_resolution || 256,
            `Auto-saved model ${new Date().toLocaleDateString()}`
          )
          
          // Update the prediction storage record
          await supabaseAdmin
            .from('prediction_storage')
            .update({ status: 'completed' })
            .eq('prediction_id', pending.prediction_id)
        } 
        // If the prediction failed, mark it as failed
        else if (prediction.status === 'failed' || prediction.error) {
          await supabaseAdmin
            .from('prediction_storage')
            .update({ status: 'failed' })
            .eq('prediction_id', pending.prediction_id)
        }
      } catch (predictionError) {
        console.error(`Error processing prediction ${pending.prediction_id}:`, predictionError)
      }
    }
    
    return true
  } catch (error) {
    console.error('Error checking completed predictions:', error)
    return false
  }
}

export const uploadImage = async (formData: FormData) => {
  try {
    const image = formData.get("image")
    if (!image) return { success: false, error: "No image provided" }
    const imgbbForm = new FormData()
    imgbbForm.append("image", image)
    imgbbForm.append("key", "67bc9085dfd47a9a6df5409995e66874")
    const { success, data } = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: imgbbForm,
    }).then((r) => r.json())
    return success ? { success: true, url: data.url } : { success: false, error: "Upload failed" }
  } catch {
    return { success: false, error: "Upload failed" }
  }
}

// Create a new project
export async function createProject(name: string): Promise<Project | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({ name })
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating project:', error);
    return null;
  }
}

// Get all projects
export async function getProjects(): Promise<Project[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}

// Get a specific project by ID
export async function getProject(id: string): Promise<Project | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching project:', error);
    return null;
  }
}

// Get models for a specific project
export async function getProjectModels(projectId: string): Promise<ProjectModel[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('project_models')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching project models:', error);
    return [];
  }
}

// Save a model to a project with optional name
export async function saveModelToProject(
  projectId: string,
  modelUrl: string,
  thumbnailUrl: string,
  inputImage: string,
  resolution: number,
  name?: string
): Promise<ProjectModel | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('project_models')
      .insert({
        project_id: projectId,
        model_url: modelUrl,
        thumbnail_url: thumbnailUrl,
        input_image: inputImage,
        resolution: resolution,
        name: name || `Model ${new Date().toLocaleString()}`
      })
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving model to project:', error);
    return null;
  }
}

// Delete a project and all its models
export async function deleteProject(projectId: string): Promise<boolean> {
  try {
    // First, delete all models in the project
    const { error: modelsError } = await supabaseAdmin
      .from('project_models')
      .delete()
      .eq('project_id', projectId);
      
    if (modelsError) throw modelsError;
    
    // Then delete the project
    const { error: projectError } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', projectId);
      
    if (projectError) throw projectError;
    
    return true;
  } catch (error) {
    console.error('Error deleting project:', error);
    return false;
  }
}

// Delete a specific model
export async function deleteProjectModel(modelId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('project_models')
      .delete()
      .eq('id', modelId);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting model:', error);
    return false;
  }
}

export const getSavedModels = async (): Promise<SavedModel[]> =>
  (await getModelsData()).models.filter(
    (m: SavedModel) =>
      m.id && m.url && m.thumbnail_url && m.created_at && m.input_image && m.resolution && m.model_hash
  )

export const saveModelToDatabase = async (
  modelUrl: string,
  inputImage: string,
  resolution: number
): Promise<SavedModel | null> => {
  try {
    if (
      !modelUrl ||
      !inputImage ||
      !resolution ||
      resolution < 256 ||
      resolution > 512 ||
      !Number.isInteger(resolution)
    )
      throw new Error("Invalid input")

    const [modelValid, imageValid] = await Promise.all([
      validateUrl(modelUrl, "model"),
      validateUrl(inputImage, "image"),
    ])
    if (!modelValid || !imageValid) throw new Error("Invalid URLs")

    const data = await getModelsData()
    const buffer = await fetch(modelUrl).then((r) => r.arrayBuffer())
    const hash = createHash("sha256").update(Buffer.from(buffer)).digest("hex")

    const existing = data.models.find((m: SavedModel) => m.model_hash === hash)
    if (existing && (await validateUrl(existing.url)) && (await validateUrl(existing.thumbnail_url)))
      return existing

    const [modelBlob, imageBlob] = await Promise.all([
      fetch(modelUrl).then((r) => r.blob()),
      fetch(inputImage).then((r) => r.blob()),
    ])
    if (!modelBlob.size || !imageBlob.size) throw new Error("Invalid files")

    const filename = `model-${Date.now()}-${hash.slice(0, 8)}`
    const [modelUpload, thumbnailUpload] = await Promise.all([
      put(`${filename}.glb`, modelBlob, { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN! }),
      put(`${filename}-thumb.jpg`, imageBlob, { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN! }),
    ])

    const newModel: SavedModel = {
      id: filename,
      url: modelUpload.url,
      thumbnail_url: thumbnailUpload.url,
      created_at: new Date().toISOString(),
      input_image: inputImage,
      resolution,
      model_hash: hash,
    }

    data.models.unshift(newModel)
    await saveModelsData(data)
    return (await getModelsData()).models.find((m: SavedModel) => m.id === newModel.id) ?? null
  } catch (error) {
    console.error("Save error:", error)
    return null
  }
}

/**
 * Deletes a saved model:
 * 1. Retrieves the current models data.
 * 2. Finds the model record with the given id.
 * 3. Deletes the associated blob files for the model and its thumbnail.
 * 4. Updates the models database by removing the record.
 */
export async function deleteSavedModel(id: string): Promise<void> {
  // Retrieve current saved models data
  const data = await getModelsData()
  const models = data.models
  const modelToDelete = models.find((m) => m.id === id)
  if (!modelToDelete) {
    console.error(`Model with id ${id} not found`)
    return
  }
  // Delete the model blob and thumbnail blob from storage
  await Promise.all([
    del(modelToDelete.url, { token: process.env.BLOB_READ_WRITE_TOKEN! }),
    del(modelToDelete.thumbnail_url, { token: process.env.BLOB_READ_WRITE_TOKEN! }),
  ])
  // Filter out the deleted model and update the database
  const updatedModels = models.filter((m) => m.id !== id)
  await saveModelsData({ models: updatedModels })
}

// Move models to a different project
export async function moveModelsToProject(
  modelIds: string[],
  targetProjectId: string
): Promise<boolean> {
  try {
    // For each model ID, update its project_id in the database
    for (const id of modelIds) {
      const { error } = await supabaseAdmin
        .from('project_models')
        .update({ project_id: targetProjectId })
        .eq('id', id);
      
      if (error) throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error moving models:', error);
    return false;
  }
}

// Rename models (single or batch)
export async function renameModels(
  modelIds: string[],
  newName: string
): Promise<boolean> {
  try {
    // If multiple models, add numeric suffix
    if (modelIds.length > 1) {
      for (let i = 0; i < modelIds.length; i++) {
        const { error } = await supabaseAdmin
          .from('project_models')
          .update({ name: `${newName}-${i + 1}` })
          .eq('id', modelIds[i]);
        
        if (error) throw error;
      }
    } else if (modelIds.length === 1) {
      // Single model rename
      const { error } = await supabaseAdmin
        .from('project_models')
        .update({ name: newName })
        .eq('id', modelIds[0]);
      
      if (error) throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error renaming models:', error);
    return false;
  }
}

// Bulk delete models by IDs
export async function deleteModelsByIds(
  modelIds: string[]
): Promise<boolean> {
  try {
    // Delete multiple models
    const { error } = await supabaseAdmin
      .from('project_models')
      .delete()
      .in('id', modelIds);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting models:', error);
    return false;
  }
}