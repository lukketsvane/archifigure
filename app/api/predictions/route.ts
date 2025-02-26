// app/api/predictions/route.ts
import { getPredictions, checkAndStoreCompletedPredictions } from "@/app/actions"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const predictions = await getPredictions()
    console.log("API predictions:", predictions) // Debug log
    
    // Auto-save completed models in the background
    try {
      const unsavedCompletedModels = predictions.filter(
        p => p.status === "succeeded" && p.output?.mesh
      );
      
      if (unsavedCompletedModels.length > 0) {
        // Don't await this - let it run in the background
        checkAndStoreCompletedPredictions().catch(err => 
          console.error("Auto-save error:", err)
        );
      }
    } catch (saveError) {
      console.error("Auto-save attempt failed:", saveError);
      // Continue even if auto-save fails
    }
    
    const validPredictions = Array.isArray(predictions) ? predictions : []
    return NextResponse.json(validPredictions, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "Surrogate-Control": "no-store",
      },
      status: 200,
    })
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json([], { status: 200 })
  }
}