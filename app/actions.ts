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
    const latest = blobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0]
    return latest ? await fetch(latest.url).then((r) => r.json()).catch(() => ({ models: [] })) : { models: [] }
  } catch {
    return { models: [] }
  }
}

async function saveModelsData({ models }: { models: SavedModel[] }) {
  if (!models?.length) return
  const blob = new Blob([JSON.stringify({ models }, null, 2)], { type: "application/json" })
  const { url } = await put(`models-${Date.now()}.json`, blob, { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN! })
  const { blobs } = await list({ prefix: "models-", token: process.env.BLOB_READ_WRITE_TOKEN! })
  await Promise.all(
    blobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()).slice(1).map((b) => del(b.url, { token: process.env.BLOB_READ_WRITE_TOKEN! }))
  )
}

export const getPredictions = async (): Promise<Prediction[]> => {
  try {
    const { results } = await fetch(
      "https://api.replicate.com/v1/predictions?deployment=cygnus-holding/hunyuan3d-2",
      { headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` }, cache: "no-store" }
    ).then((r) => r.json())

    return (results as Prediction[])?.filter(
      (p) => p?.id && p?.status && p?.input?.image && p.status !== "canceled" && (p.status === "succeeded" ? p.output?.mesh && new URL(p.output.mesh) : !p.error && ["starting", "processing"].includes(p.status))
    ).sort((a, b) =>
      ["starting", "processing"].includes(a.status) !== ["starting", "processing"].includes(b.status)
        ? ["starting", "processing"].includes(a.status) ? -1 : 1
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ) ?? []
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
  project_id?: string
}) => {
  // Extract a filename from the image URL to use as a base for the model name
  let modelName = "3D Model";
  
  try {
    // Try to extract a name from the URL
    const url = new URL(data.image);
    const pathname = url.pathname;
    
    // Try to get a filename
    const filename = pathname.split('/').pop();
    if (filename) {
      // Remove extension and use as name
      const nameWithoutExt = filename.split('.')[0];
      if (nameWithoutExt && nameWithoutExt.length > 0) {
        modelName = nameWithoutExt;
      }
    }
  } catch (e) {
    // If URL parsing fails, use a default name with timestamp
    modelName = `Model-${new Date().toISOString().slice(0,10)}`;
  }

  try {
    const prediction = await replicate.deployments.predictions.create("cygnus-holding", "hunyuan3d-2", { input: data })
    
    // Create prediction storage entry for ALL predictions, regardless of project
    await registerPredictionForStorage(prediction.id, data.project_id || null)
    
    // Create project entry only if project_id is provided
    if (prediction.id && data.project_id) {
      try {
        await supabaseAdmin.from("project_models").insert({
          prediction_id: prediction.id,
          project_id: data.project_id,
          input_image: data.image,
          name: modelName,
          resolution: data.octree_resolution,
          status: prediction.status,
        });
      } catch (error) {
        console.error('Failed to create project model record:', error);
      }
    }
    
    return prediction
  } catch (error) {
    console.error("Generate model error:", error)
    throw new Error("Failed to start generation")
  }
}

async function registerPredictionForStorage(predictionId: string, projectId: string | null) {
  try {
    const { error } = await supabaseAdmin.from("prediction_storage").insert({ 
      prediction_id: predictionId, 
      project_id: projectId, 
      status: "pending" 
    })
    if (error) throw error
    return true
  } catch (error) {
    console.error("Error registering prediction for storage:", error)
    return false
  }
}

export async function checkModelExists(modelUrl: string, projectId: string | null): Promise<{ exists: boolean }> {
  try {
    if (projectId) {
      const { data, error } = await supabaseAdmin.from("project_models").select("id").eq("project_id", projectId).eq("model_url", modelUrl).maybeSingle()
      if (error) throw error
      return { exists: !!data }
    } else {
      const modelsData = await getModelsData()
      return { exists: modelsData.models.some((model) => model.url === modelUrl) }
    }
  } catch (error) {
    console.error("Error checking if model exists:", error)
    return { exists: false }
  }
}

export async function deleteProject(projectId: string): Promise<boolean> {
  try {
    await supabaseAdmin.from("project_models").delete().eq("project_id", projectId)
    await supabaseAdmin.from("projects").delete().eq("id", projectId)
    return true
  } catch (error) {
    console.error("Error deleting project:", error)
    return false
  }
}

export async function deleteProjectModel(modelId: string): Promise<boolean> {
  try {
    await supabaseAdmin.from("project_models").delete().eq("id", modelId)
    return true
  } catch (error) {
    console.error("Error deleting model:", error)
    return false
  }
}

export const getSavedModels = async (): Promise<SavedModel[]> => {
  const data = await getModelsData()
  // Return all valid GLB models without additional filtering
  return data.models.filter(m => 
    m.id && 
    m.url && 
    m.url.includes('.glb') && // Ensure it's a GLB file
    m.thumbnail_url && 
    m.created_at && 
    m.input_image
  )
}

export async function deleteSavedModel(id: string): Promise<void> {
  const data = await getModelsData()
  const models = data.models
  const modelToDelete = models.find((m) => m.id === id)
  if (!modelToDelete) {
    console.error(`Model with id ${id} not found`)
    return
  }
  await Promise.all([del(modelToDelete.url, { token: process.env.BLOB_READ_WRITE_TOKEN! }), del(modelToDelete.thumbnail_url, { token: process.env.BLOB_READ_WRITE_TOKEN! })])
  await saveModelsData({ models: models.filter((m) => m.id !== id) })
}

export async function moveModelsToProject(modelIds: string[], targetProjectId: string): Promise<boolean> {
  try {
    for (const id of modelIds) await supabaseAdmin.from("project_models").update({ project_id: targetProjectId }).eq("id", id)
    return true
  } catch (error) {
    console.error("Error moving models:", error)
    return false
  }
}

export async function renameModels(modelIds: string[], newName: string): Promise<boolean> {
  try {
    for (let i = 0; i < modelIds.length; i++) await supabaseAdmin.from("project_models").update({ name: modelIds.length > 1 ? `${newName}-${i + 1}` : newName }).eq("id", modelIds[i])
    return true
  } catch (error) {
    console.error("Error renaming models:", error)
    return false
  }
}

export async function deleteModelsByIds(modelIds: string[]): Promise<boolean> {
  try {
    await supabaseAdmin.from("project_models").delete().in("id", modelIds)
    return true
  } catch (error) {
    console.error("Error deleting models:", error)
    return false
  }
}

export async function getProjects(): Promise<Project[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })
    
    if (error) throw error
    return data || []
  } catch (error) {
    console.error("Error fetching projects:", error)
    return []
  }
}

export async function getProjectModels(projectId: string): Promise<ProjectModel[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("project_models")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
    
    if (error) throw error
    return data || []
  } catch (error) {
    console.error("Error fetching project models:", error)
    return []
  }
}

// Updated to merge projects with the same name
export async function createProject(name: string): Promise<Project | null> {
  try {
    // First check if a project with the same name already exists
    const { data: existingProject, error: findError } = await supabaseAdmin
      .from("projects")
      .select("*")
      .ilike("name", name) // Case-insensitive match
      .maybeSingle();
    
    if (findError) throw findError;
    
    // If project with same name exists, return it
    if (existingProject) {
      // Update the project's updated_at timestamp
      await supabaseAdmin
        .from("projects")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", existingProject.id);
        
      return existingProject;
    }
    
    // Otherwise create a new project
    const { data, error } = await supabaseAdmin
      .from("projects")
      .insert({ name })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error creating/finding project:", error);
    return null;
  }
}

// Enhanced to ensure all GLB files are saved
export async function saveModelToProject(
  projectId: string,
  modelUrl: string,
  thumbnailUrl: string,
  inputImage: string,
  resolution: number,
  name?: string
): Promise<boolean> {
  try {
    const modelHash = createHash("md5").update(modelUrl).digest("hex")
    
    const { error } = await supabaseAdmin.from("project_models").insert({
      project_id: projectId,
      model_url: modelUrl,
      thumbnail_url: thumbnailUrl,
      input_image: inputImage,
      resolution,
      name: name || `Model-${new Date().toISOString().slice(0, 10)}`,
      model_hash: modelHash
    })
    
    if (error) throw error
    
    // Also save to general storage for display in the "Stored" tab
    await saveModelToDatabase(modelUrl, inputImage, resolution)
    
    return true
  } catch (error) {
    console.error("Error saving model to project:", error)
    return false
  }
}

// Enhanced save model function to ensure all GLB files are properly stored
export async function saveModelToDatabase(
  modelUrl: string,
  inputImage: string,
  resolution: number
): Promise<boolean> {
  try {
    // Skip if not a GLB URL
    if (!modelUrl.includes('.glb')) {
      return false;
    }
    
    const modelHash = createHash("md5").update(modelUrl).digest("hex")
    const data = await getModelsData()
    
    // Check if this model already exists in storage
    if (data.models.some(m => m.model_hash === modelHash || m.url === modelUrl)) {
      return true; // Model already exists
    }
    
    const newModel: SavedModel = {
      id: modelHash,
      url: modelUrl,
      thumbnail_url: inputImage, // Using input image as thumbnail
      input_image: inputImage,
      resolution: resolution || 256,
      model_hash: modelHash,
      created_at: new Date().toISOString()
    }
    
    await saveModelsData({ models: [...data.models, newModel] })
    return true
  } catch (error) {
    console.error("Error saving model to database:", error)
    return false
  }
}

// Enhanced to automatically store GLB files to both projects and general storage
export async function checkAndStoreCompletedPredictions(): Promise<boolean> {
  try {
    // Get all pending predictions
    const { data: pendingPredictions, error } = await supabaseAdmin
      .from("prediction_storage")
      .select("*")
      .eq("status", "pending")
    
    if (error) throw error
    
    // Also fetch recent predictions from Replicate API that might not be in storage
    const replicatePredictions = await getPredictions();
    const successfulReplicatePredictions = replicatePredictions.filter(
      p => p.status === "succeeded" && 
           p.output?.mesh && 
           !pendingPredictions?.some(pp => pp.prediction_id === p.id)
    );
    
    let allSuccess = true;
    
    // Process stored predictions
    for (const prediction of pendingPredictions || []) {
      try {
        const pred = await replicate.predictions.get(prediction.prediction_id);
        
        if (pred.status === "succeeded" && pred.output?.mesh) {
          // Update model in the project if it has a project
          if (prediction.project_id) {
            await supabaseAdmin
              .from("project_models")
              .update({
                status: "succeeded",
                model_url: pred.output.mesh,
                thumbnail_url: pred.input.image || ""
              })
              .eq("prediction_id", prediction.prediction_id);
          }
          
          // Always save to general storage
          await saveModelToDatabase(
            pred.output.mesh,
            pred.input.image || "",
            pred.input.octree_resolution || 256
          );
          
          // Mark as stored
          await supabaseAdmin
            .from("prediction_storage")
            .update({ status: "stored" })
            .eq("prediction_id", prediction.prediction_id);
        } else if (pred.status === "failed" || pred.error) {
          await supabaseAdmin
            .from("prediction_storage")
            .update({ status: "failed" })
            .eq("prediction_id", prediction.prediction_id);
          
          if (prediction.project_id) {
            await supabaseAdmin
              .from("project_models")
              .update({ status: "failed" })
              .eq("prediction_id", prediction.prediction_id);
          }
        }
      } catch (err) {
        console.error(`Error processing prediction ${prediction.prediction_id}:`, err);
        allSuccess = false;
      }
    }
    
    // Process predictions from Replicate API that aren't in storage
    for (const pred of successfulReplicatePredictions) {
      try {
        if (pred.output?.mesh && pred.input?.image) {
          // Save to general storage
          await saveModelToDatabase(
            pred.output.mesh,
            pred.input.image,
            pred.input.octree_resolution || 256
          );
        }
      } catch (err) {
        console.error(`Error processing API prediction ${pred.id}:`, err);
        allSuccess = false;
      }
    }
    
    return allSuccess;
  } catch (error) {
    console.error("Error checking and storing predictions:", error);
    return false;
  }
}

export async function uploadImage(formData: FormData): Promise<{ url: string }> {
  try {
    const file = formData.get("image") as File
    if (!file) {
      throw new Error("No image file provided")
    }
    
    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = `${createHash("md5").update(buffer).digest("hex")}-${file.name}`
    
    const { url } = await put(`uploads/${filename}`, buffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN!,
      contentType: file.type,
    })
    
    return { url }
  } catch (error) {
    console.error("Error uploading image:", error)
    throw new Error("Failed to upload image")
  }
}