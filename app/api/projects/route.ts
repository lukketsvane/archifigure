// app/api/projects/route.ts
import { NextResponse } from "next/server";
import { getProjects, createProject } from "@/app/actions";

export async function GET() {
  try {
    const projects = await getProjects();
    return NextResponse.json(projects, { status: 200 });
  } catch (error) {
    console.error("Projects API error:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    
    if (!name) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }
    
    const project = await createProject(name);
    
    if (!project) {
      return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
    }
    
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Project creation error:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}