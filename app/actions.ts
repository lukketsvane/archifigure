// /app/actions.ts
"use server"

import Replicate from "replicate"
import { put, list, del } from "@vercel/blob"
import { createHash } from "crypto"

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
}) => {
  try {
    const prediction = await replicate.deployments.predictions.create(
      "cygnus-holding",
      "hunyuan3d-2",
      { input: data }
    )
    return { success: true, debug: { predictionId: prediction.id, status: prediction.status } }
  } catch {
    return { success: false, error: "Failed to start generation" }
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
