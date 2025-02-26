// components/image-generation.tsx
"use client";

import { useState } from "react";
import { PromptGenerator } from "./prompt-generator";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export function ImageGeneration({ 
  onImagesGenerated, 
  onSubmit, 
  forcedAspectRatio = "1:1",
  useMostPermissiveSafetyLevel = true,
  useImagen3 = true
}) {
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  // Comprehensive negative prompt for clean isolated subjects
  const negativePrompt = "blurry, distorted, low quality, low resolution, deformed, disfigured, " +
    "out of frame, cropped, missing limbs, partial body, head only, close-up, " +
    "watermark, signature, text, environment, props, objects, " + 
    "cluttered background, distracting details, multiple people, group, crowd, trees, outdoors, " +
    "furniture, buildings, landscape, room interior";

  // Function to generate images from prompts
  const generateImages = async (prompts) => {
    if (prompts.length === 0) return;
    
    setGeneratingImages(true);
    setProgress({ current: 0, total: prompts.length });
    const images = [];
    const pendingSubmissions = [];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      setProgress({ current: i + 1, total: prompts.length });
      
      // Create a pending submission card
      const pendingId = `pending-${Date.now()}-${i}`;
      const pendingSubmission = {
        id: pendingId,
        status: "starting",
        input: { image: "" },
        created_at: new Date().toISOString(),
        prompt: prompt.replace(/, full standing body, head to toe view, studio lighting, set stark against a solid white background/g, "")
      };
      pendingSubmissions.push(pendingSubmission);
      
      try {
        // Call the API to generate an image
        const response = await fetch("/api/generate-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            prompt, 
            aspect_ratio: forcedAspectRatio,
            negative_prompt: negativePrompt,
            safety_filter_level: useMostPermissiveSafetyLevel ? "block_only_high" : "block_medium_and_above",
            use_imagen3: useImagen3
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(`Feil for prompt "${prompt}": ${errorData.error || errorData.details || "Image generation failed"}`);
          continue; // Hopp over denne prompten
        }

        const data = await response.json();
        
        if (data.imageUrl) {
          images.push({
            url: data.imageUrl,
            prompt,
            pendingId
          });
          pendingSubmission.input.image = data.imageUrl;
        } else {
          toast.error(`Ingen bilete generert for prompt: "${prompt}"`);
        }
      } catch (err) {
        console.error("Error generating image for prompt:", prompt, err);
        toast.error(`Feil under generering for prompt: "${prompt}"`);
        continue;
      }
    }

    // Notify parent about new submissions
    if (onSubmit && pendingSubmissions.length > 0) {
      onSubmit(pendingSubmissions);
    }

    setGeneratedImages(images);
    
    if (onImagesGenerated && images.length > 0) {
      onImagesGenerated(images.map(img => img.url));
    }
    
    toast.success(`Generated ${images.length} images`);
    setGeneratingImages(false);
  };

  // Remove an image from the generated images
  const removeImage = (index) => {
    const newImages = [...generatedImages];
    newImages.splice(index, 1);
    setGeneratedImages(newImages);
    
    if (onImagesGenerated) {
      onImagesGenerated(newImages.map(img => img.url));
    }
  };

  return (
    <div className="space-y-3">
      <PromptGenerator onGenerateImages={generateImages} />
      
      {generatingImages && (
        <div className="flex items-center justify-center p-3 border rounded-md">
          <div className="text-center">
            <Loader2 className="h-7 w-7 animate-spin mx-auto mb-1" />
            <p className="text-xs">
              Generating image {progress.current} of {progress.total}...
            </p>
          </div>
        </div>
      )}
      
      {generatedImages.length > 0 && !generatingImages && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {generatedImages.map((image, index) => (
              <Card key={index} className="overflow-hidden">
                <div className="relative aspect-square">
                  <Image
                    src={image.url}
                    alt={`Generated image ${index + 1}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/70"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
