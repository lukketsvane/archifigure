import { NextResponse } from "next/server";
import { deleteSavedModel } from "@/app/actions";

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing model id" }, { status: 400 });
    }
    await deleteSavedModel(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Failed to delete model" }, { status: 500 });
  }
}
