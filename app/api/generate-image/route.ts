// app/api/generate-image/route.ts
import { NextResponse } from "next/server";
import Replicate from "replicate";

export async function POST(request: Request) {
  try {
    const { 
      prompt, 
      aspect_ratio, 
      negative_prompt, 
      safety_filter_level, 
      use_imagen3 
    } = await request.json();
    
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Sjekk om API-token finst
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      console.error("Missing REPLICATE_API_TOKEN environment variable");
      return NextResponse.json(
        { error: "Server configuration error: API token missing" },
        { status: 500 }
      );
    }

    const replicate = new Replicate({ auth: apiToken });

    let output;
    
    if (use_imagen3) {
      // Bruk Googles Imagen-3
      output = await replicate.run("google/imagen-3", {
        input: {
          prompt,
          aspect_ratio: aspect_ratio || "1:1",
          negative_prompt: negative_prompt || "",
          safety_filter_level: safety_filter_level || "block_only_high"
        }
      });
    } else {
      // Fallback til Stable Diffusion
      let width = 768;
      let height = 768;
      
      if (aspect_ratio === "16:9") {
        width = 1024;
        height = 576;
      } else if (aspect_ratio === "9:16") {
        width = 576;
        height = 1024;
      } else if (aspect_ratio === "4:3") {
        width = 912;
        height = 684;
      } else if (aspect_ratio === "3:2") {
        width = 912;
        height = 608;
      }

      output = await replicate.run(
        "stability-ai/stable-diffusion:ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4",
        {
          input: {
            prompt,
            width,
            height,
            num_outputs: 1,
            negative_prompt: negative_prompt || "blurry, distorted, low quality, low resolution, deformed",
            num_inference_steps: 50,
            guidance_scale: 7.5
          }
        }
      );
    }

    // Hent ut imageUrl for enten Imagen-3 eller Stable Diffusion
    const imageUrl = use_imagen3 
      ? output 
      : (Array.isArray(output) && output.length > 0 ? output[0] : "");

    // Bruk ei tom streng i staden for å kaste ein feil om ingen bilete vart genererte
    const finalImageUrl = imageUrl || "";

    // Last opp til imgbb for lagring
    try {
      const imgbbResponse = await uploadToImgbb(finalImageUrl);
      return NextResponse.json({ 
        imageUrl: imgbbResponse.url || finalImageUrl,
        originalUrl: finalImageUrl 
      });
    } catch (uploadError) {
      console.error("ImgBB upload failed:", uploadError);
      return NextResponse.json({ imageUrl: finalImageUrl, originalUrl: finalImageUrl });
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
    if (!imageUrl) {
      return { url: "" };
    }
    
    // Hent bildedata
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");

    // Lag formdata for imgbb
    const formData = new FormData();
    formData.append("key", process.env.IMGBB_API_KEY || "67bc9085dfd47a9a6df5409995e66874");
    formData.append("image", base64Image);

    // Last opp til imgbb
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
    return { url: "" };
  }
}
