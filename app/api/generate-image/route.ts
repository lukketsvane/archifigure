// app/api/generate-image/route.ts
import { NextResponse } from "next/server";
import Replicate from "replicate";

export async function POST(request: Request) {
  try {
    const { prompt, aspect_ratio, negative_prompt, safety_filter_level } = await request.json();
    
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Check if API token exists
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      console.error("Missing REPLICATE_API_TOKEN environment variable");
      return NextResponse.json(
        { error: "Server configuration error: API token missing" },
        { status: 500 }
      );
    }

    const replicate = new Replicate({
      auth: apiToken,
    });

    // Use Stable Diffusion instead of Imagen-3 (which may require special access)
    const output = await replicate.run(
      "stability-ai/stable-diffusion:ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4",
      {
        input: {
          prompt,
          width: aspect_ratio === "16:9" ? 1024 : 768,
          height: aspect_ratio === "9:16" ? 1024 : 768,
          num_outputs: 1,
          negative_prompt: negative_prompt || "blurry, distorted, low quality, low resolution, deformed"
        }
      }
    );

    // Output from Stable Diffusion is an array of image URLs
    const imageUrl = Array.isArray(output) && output.length > 0 ? output[0] : null;

    if (!imageUrl) {
      throw new Error("No image was generated");
    }

    // Upload to imgbb for persistence
    try {
      const imgbbResponse = await uploadToImgbb(imageUrl);
      return NextResponse.json({ 
        imageUrl: imgbbResponse.url || imageUrl,
        originalUrl: imageUrl 
      });
    } catch (uploadError) {
      // If upload fails, still return the original image URL
      console.error("ImgBB upload failed:", uploadError);
      return NextResponse.json({ imageUrl, originalUrl: imageUrl });
    }
  } catch (error: any) {
    console.error("Error generating image:", error);
    return NextResponse.json(
      { error: "Failed to generate image", details: error.message },
      { status: 500 }
    );
  }
}

async function uploadToImgbb(imageUrl: string) {
  try {
    // Fetch the image data
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    // Create form data for imgbb
    const formData = new FormData();
    formData.append("key", process.env.IMGBB_API_KEY || "67bc9085dfd47a9a6df5409995e66874");
    formData.append("image", base64Image);

    // Upload to imgbb
    const response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error("Failed to upload image to ImgBB");
    }

    return { url: data.data.url };
  } catch (error) {
    console.error("Error uploading to ImgBB:", error);
    // Return empty object if upload fails
    return { url: "" };
  }
}