import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import * as THREE from "three"
import { useEffect } from "react"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Utility function to convert temperature to RGB color
export function tempToColor(kelvin: number) {
  kelvin /= 100
  let red, green, blue
  if (kelvin <= 66) {
    red = 255
    green = Math.min(
      255,
      Math.max(0, 99.4708025861 * Math.log(kelvin) - 161.1195681661)
    )
    blue =
      kelvin <= 19
        ? 0
        : Math.min(
            255,
            Math.max(0, 138.5177312231 * Math.log(kelvin - 10) - 305.0447927307)
          )
  } else {
    red = Math.min(
      255,
      Math.max(0, 329.698727446 * Math.pow(kelvin - 60, -0.1332047592))
    )
    green = Math.min(
      255,
      Math.max(0, 288.1221695283 * Math.pow(kelvin - 60, -0.0755148492))
    )
    blue = 255
  }
  return `rgb(${red}, ${green}, ${blue})`
}

// Custom hook for loading 3D models
export function useModelLoader(url: string, onLoad: (model: THREE.Group) => void, onError: (error: string) => void) {
  const maxRetries = 3;
  
  useEffect(() => {
    let canceled = false;
    let retryCount = 0;
    let retryTimeout: NodeJS.Timeout;
    
    const attemptLoad = () => {
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          if (!canceled) {
            onLoad(gltf.scene);
          }
        },
        undefined,
        (err) => {
          if (canceled) return;
          
          if (retryCount < maxRetries) {
            retryCount++;
            retryTimeout = setTimeout(() => attemptLoad(), 1000 * retryCount);
          } else {
            const message = err instanceof Error ? err.message : "Failed to load model";
            onError(message);
          }
        }
      );
    };
    
    attemptLoad();
    
    return () => {
      canceled = true;
      clearTimeout(retryTimeout);
    };
  }, [url, onLoad, onError, maxRetries]);
}
