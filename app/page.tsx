"use client"

import PasswordLock from "@/components/password-lock"
import type React from "react"
import { useCallback, useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Download, X, Upload, ChevronLeft } from "lucide-react"
import { useDropzone } from "react-dropzone"
import Image from "next/image"
import { generateModel, uploadImage } from "./actions"
import { ModelViewer } from "@/components/model-viewer"
import { PredictionsGrid } from "@/components/predictions-grid"
import { CheckCircle2 } from "lucide-react"
import { MobileControls } from "@/components/mobile-controls"

function UploadZone({
  onUploadComplete,
  onError,
  currentCount,
  maxImages,
}: {
  onUploadComplete: (url: string) => void
  onError: (_: string) => void
  currentCount: number
  maxImages: number
}) {
  const [uploading, setUploading] = useState(false)
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return
      const allowedCount = Math.min(acceptedFiles.length, maxImages - currentCount)
      if (allowedCount <= 0) {
        onError("Maximum number of images reached")
        return
      }
      setUploading(true)
      const filesToProcess = acceptedFiles.slice(0, allowedCount)
      await Promise.all(
        filesToProcess.map(async (file) => {
          if (!file.type.startsWith("image/")) {
            onError("Invalid image")
            return
          }
          try {
            const formData = new FormData()
            formData.append("image", file)
            const result = await uploadImage(formData)
            if (result.url) {
              onUploadComplete(result.url)
            }
          } catch (_) {
            onError("Upload failed")
          }
        })
      )
      setUploading(false)
    },
    [onUploadComplete, onError, currentCount, maxImages]
  )
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"] },
    maxSize: 32 * 1024 * 1024,
    multiple: true,
  })
  return (
    <div
      {...getRootProps()}
      className={`
        relative flex flex-col items-center justify-center w-full h-20
        border-2 border-dashed rounded-lg cursor-pointer
        transition-colors duration-200 ease-in-out
        ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
        hover:border-primary hover:bg-primary/5
      `}
    >
      <input {...getInputProps()} />
      <Upload className={`w-5 h-5 ${uploading ? "animate-pulse" : ""} text-muted-foreground`} />
      <p className="text-xs text-muted-foreground mt-1">
        {uploading ? "Uploading..." : isDragActive ? "Drop" : "Upload"}
      </p>
    </div>
  )
}

export default function ModelGenerator() {
  const [loading, setLoading] = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [modelUrl, setModelUrl] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  // For mobile: if modelUrl is empty, show gallery
  const [showPredictions, setShowPredictions] = useState(false)
  const [formData, setFormData] = useState({
    steps: 50,
    guidance_scale: 5.5,
    seed: 1234,
    octree_resolution: 512, // default resolution updated to 512
    remove_background: true,
  })
  const [cooldown, setCooldown] = useState(0)
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout>()
  const [showAllPredictions, setShowAllPredictions] = useState(false)

  useEffect(() => {
    if (cooldown > 0) {
      const id = setInterval(() => setCooldown((prev) => Math.max(0, prev - 1)), 1000)
      return () => clearInterval(id)
    }
  }, [cooldown])

  // Process predictions concurrently (limit 10)
  async function processPredictionsConcurrently(urls: string[], concurrency: number): Promise<any[]> {
    const results: any[] = []
    let currentIndex = 0
    async function worker() {
      while (currentIndex < urls.length) {
        const index = currentIndex++
        try {
          results[index] = await generateModel({ image: urls[index], ...formData })
        } catch (error) {
          results[index] = { error }
        }
      }
    }
    const numWorkers = Math.min(concurrency, urls.length)
    const workers = []
    for (let i = 0; i < numWorkers; i++) {
      workers.push(worker())
    }
    await Promise.all(workers)
    return results
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (imageUrls.length === 0 || cooldown > 0) return
    setLoading(true)
    setError("")
    setSuccess(false)
    try {
      const results = await processPredictionsConcurrently(imageUrls, 10)
      const allFailed = results.every((r) => r.error)
      if (allFailed) {
        setError("Generation failed")
      } else {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 5000)
      }
      setCooldown(120)
      if (timeoutId) clearTimeout(timeoutId)
      const id = setTimeout(() => setCooldown(0), 120000)
      setTimeoutId(id)
      setImageUrls([])
    } catch (_) {
      setError("Generation failed")
    } finally {
      setLoading(false)
    }
  }

  const formatCooldown = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const removeImage = (url: string) => {
    setImageUrls((prev) => prev.filter((img) => img !== url))
  }

  const Controls = () => (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          {imageUrls.length === 0 ? (
            <>
              <UploadZone
                onUploadComplete={(url) => setImageUrls((prev) => [...prev, url])}
                onError={setError}
                currentCount={imageUrls.length}
                maxImages={10}
              />
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">OR</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Input
                type="url"
                placeholder="Image URL"
                onBlur={(e) => {
                  const url = e.target.value.trim()
                  if (url && !imageUrls.includes(url)) {
                    setImageUrls((prev) => (prev.length < 10 ? [...prev, url] : prev))
                    e.target.value = ""
                  }
                }}
                className="h-9"
              />
            </>
          ) : (
            <div className="relative rounded-lg border overflow-hidden">
              <div className="grid grid-cols-2 gap-2 p-2 h-40 w-full overflow-auto">
                {imageUrls.map((url) => (
                  <div key={url} className="relative border rounded">
                    <div className="relative aspect-square">
                      <Image
                        src={url || "/placeholder.svg"}
                        alt="Input"
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-4 w-4 bg-background/50 hover:bg-background/75"
                      onClick={() => removeImage(url)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              {imageUrls.length < 10 && (
                <div className="mt-2">
                  <UploadZone
                    onUploadComplete={(url) => setImageUrls((prev) => [...prev, url])}
                    onError={setError}
                    currentCount={imageUrls.length}
                    maxImages={10}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="steps" className="text-xs">Steps</Label>
            <span className="text-xs text-muted-foreground">{formData.steps}</span>
          </div>
          <Slider
            id="steps"
            min={20}
            max={50}
            step={1}
            value={[formData.steps]}
            onValueChange={([steps]) => setFormData({ ...formData, steps })}
            className="py-0.5"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="guidance" className="text-xs">Guidance</Label>
            <span className="text-xs text-muted-foreground">{formData.guidance_scale}</span>
          </div>
          <Slider
            id="guidance"
            min={1}
            max={20}
            step={0.1}
            value={[formData.guidance_scale]}
            onValueChange={([guidance_scale]) => setFormData({ ...formData, guidance_scale })}
            className="py-0.5"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="seed" className="text-xs">Seed</Label>
            <Input
              id="seed"
              type="number"
              value={formData.seed}
              onChange={(e) => setFormData({ ...formData, seed: Number(e.target.value) })}
              className="h-8"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resolution" className="text-xs">Resolution</Label>
            <Select
              value={formData.octree_resolution.toString()}
              onValueChange={(value) => setFormData({ ...formData, octree_resolution: Number(value) })}
            >
              <SelectTrigger id="resolution" className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="256">256</SelectItem>
                <SelectItem value="384">384</SelectItem>
                <SelectItem value="512">512</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="background"
            checked={formData.remove_background}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, remove_background: checked as boolean })
            }
          />
          <Label htmlFor="background" className="text-xs">Remove background</Label>
        </div>
        <Button
          type="submit"
          className="w-full h-8 text-sm relative overflow-hidden"
          disabled={loading || imageUrls.length === 0 || cooldown > 0}
        >
          {loading ? (
            "Generating..."
          ) : cooldown > 0 ? (
            <>
              Wait {formatCooldown(cooldown)}
              <div
                className="absolute bottom-0 left-0 h-1 bg-primary/20"
                style={{ width: `${(cooldown / 120) * 100}%`, transition: "width 1s linear" }}
              />
            </>
          ) : (
            "Generate"
          )}
        </Button>
      </form>
      {error && (
        <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive text-center">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-500/10 p-2 text-xs text-green-600 text-center flex items-center justify-center gap-1.5">
          <CheckCircle2 className="w-3 h-3" />
          Generation started! Check back in a few minutes
        </div>
      )}
    </div>
  )

  return (
    <PasswordLock>
      <div className="relative h-[100dvh] w-full overflow-hidden">
        {/* Mobile View */}
        <div className="lg:hidden flex flex-col h-full">
          {modelUrl === "" ? (
            // No model selected: show gallery grid by default
            <div className="flex-1 overflow-y-auto">
              <PredictionsGrid
                onSelectModel={(meshUrl, inputImage, resolution) => {
                  setModelUrl(meshUrl)
                  if (inputImage) setImageUrls([inputImage])
                  if (resolution)
                    setFormData((prev) => ({ ...prev, octree_resolution: resolution }))
                }}
              />
            </div>
          ) : (
            <>
              <div className="absolute inset-0">
                <ModelViewer
                  url={modelUrl}
                  inputImage={imageUrls[0]}
                  resolution={formData.octree_resolution}
                />
              </div>
              <MobileControls onGalleryClick={() => setModelUrl("")}>
                <Controls />
              </MobileControls>
              <div className="absolute top-3 right-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 bg-background/50 backdrop-blur-sm hover:bg-background/75"
                  onClick={() => setModelUrl("")}
                >
                  Gallery
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 bg-background/50 backdrop-blur-sm hover:bg-background/75 px-2"
                  onClick={() => {
                    const link = document.createElement("a")
                    link.href = modelUrl
                    link.download = "model.glb"
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                  }}
                >
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            </>
          )}
        </div>
        {/* Desktop View */}
        <div className="hidden lg:flex flex-col h-full">
          <div className="flex-1 grid lg:grid-cols-[300px,1fr] gap-3 p-3">
            <div className="space-y-3">
              <Controls />
            </div>
            <Card className="relative">
              {modelUrl ? (
                <div className="absolute inset-0">
                  <ModelViewer
                    url={modelUrl}
                    inputImage={imageUrls[0]}
                    resolution={formData.octree_resolution}
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  {loading && (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  )}
                </div>
              )}
            </Card>
          </div>
          <div className="border-t bg-muted/40">
            <div className="flex items-center gap-2 py-2 px-4"></div>
            <PredictionsGrid
              onSelectModel={(meshUrl, inputImage, resolution) => {
                setModelUrl(meshUrl)
                if (inputImage) setImageUrls([inputImage])
                if (resolution)
                  setFormData((prev) => ({ ...prev, octree_resolution: resolution }))
              }}
            />
          </div>
        </div>
      </div>
    </PasswordLock>
  )
}
