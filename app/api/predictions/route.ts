import { getPredictions } from "@/app/actions"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const predictions = await getPredictions()
    console.log("API predictions:", predictions) // Debug log
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

