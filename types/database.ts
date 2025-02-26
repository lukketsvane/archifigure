// types/database.ts
export interface Project {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
  }
  
  export interface ProjectModel {
    id: string;
    project_id: string;
    model_url: string;
    thumbnail_url: string;
    input_image: string;
    resolution: number;
    created_at: string;
  }