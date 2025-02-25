"use client";

import { useState } from "react";
import { PromptGenerator } from "./prompt-generator";
import { Button } from "@/components/ui/button";
import { Loader2, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function ImageGeneration({ onImagesGenerated }) {
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [aspectRatio, setAspectRatio] = useState("1:1");

  // Function to generate images from prompts
  const generateImages = async (prompts) => {
    if (prompts.length === 0) return;
    
    setGeneratingImages(true);
    setProgress({ current: 0, total: prompts.length });
    const images = [];

    try {
      // Process prompts sequentially
      for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        setProgress({ current: i + 1, total: prompts.length });
        
        // Call the API to generate an image
        const response = await fetch("/api/generate-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            prompt, 
            aspect_ratio: aspectRatio,
            negative_prompt: "blurry, distorted, low quality, low resolution, deformed"
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || errorData.details || "Image generation failed");
        }

        const data = await response.json();
        
        if (data.imageUrl) {
          images.push({
            url: data.imageUrl,
            prompt
          });
        }
      }

      setGeneratedImages(images);
      
      if (onImagesGenerated && images.length > 0) {
        // Pass the generated image URLs to the parent component
        onImagesGenerated(images.map(img => img.url));
      }
      
      toast.success(`Generated ${images.length} images`);
    } catch (error) {
      console.error("Error generating images:", error);
      toast.error("Error generating images: " + (error.message || "Unknown error"));
    } finally {
      setGeneratingImages(false);
    }
  };

  return (
    <div className="space-y-6">
      <PromptGenerator onGenerateImages={generateImages} />
      
      <div className="space-y-1.5">
        <Label className="text-xs">Aspect Ratio</Label>
        <Select value={aspectRatio} onValueChange={setAspectRatio}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select aspect ratio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1:1">Square (1:1)</SelectItem>
            <SelectItem value="16:9">Landscape (16:9)</SelectItem>
            <SelectItem value="9:16">Portrait (9:16)</SelectItem>
            <SelectItem value="4:3">Standard (4:3)</SelectItem>
            <SelectItem value="3:2">Photo (3:2)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {generatingImages && (
        <div className="flex items-center justify-center p-4 border rounded-md">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p className="text-sm">
              Generating image {progress.current} of {progress.total}...
            </p>
          </div>
        </div>
      )}
      
      {generatedImages.length > 0 && !generatingImages && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Generated Images</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                </div>
                <div className="p-2">
                  <p className="text-xs truncate" title={image.prompt}>
                    {image.prompt}
                  </p>
                  <div className="flex justify-end mt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 text-xs"
                      onClick={() => {
                        if (onImagesGenerated) {
                          onImagesGenerated([image.url]);
                        }
                      }}
                    >
                      <ImageIcon className="h-3 w-3 mr-1" /> Use
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}