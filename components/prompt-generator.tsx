"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Info, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PromptGenerator({ onGenerateImages }) {
  // Changed default prompt to include comma-separated values directly in the brackets without type labels
  const defaultPrompt = "full frame image of a {woman, man} scandinavian {standing, walking}";
  // Updated suffix
  const promptSuffix = ", head to toe view, studio lighting, set stark against a solid white background";
  
  const [basePrompt, setBasePrompt] = useState(defaultPrompt);
  const [lists, setLists] = useState({});
  const [detectedLists, setDetectedLists] = useState([]);
  const [generatedPrompts, setGeneratedPrompts] = useState([]);

  // Detect any bracket patterns and extract comma-separated values
  useEffect(() => {
    // Simplified regex to detect any curly brace patterns
    const regex = /\{([^{}]*)\}/g;
    const matches = [...basePrompt.matchAll(regex)];
    
    // Create a unique ID for each bracket position
    const bracketPositions = matches.map((match, index) => `bracket_${index}`);
    setDetectedLists(bracketPositions);
    
    // Initialize lists object with comma-separated values from brackets
    const newLists = { ...lists };
    
    // Process each bracket
    matches.forEach((match, index) => {
      const bracketId = `bracket_${index}`;
      const content = match[1];
      
      // Extract comma-separated values
      const values = content.split(',')
        .map(val => val.trim())
        .filter(Boolean);
      
      // Store values in the lists
      newLists[bracketId] = values;
    });
    
    // Remove lists that are no longer in the prompt
    Object.keys(newLists).forEach(key => {
      if (!key.startsWith('bracket_') || !bracketPositions.includes(key)) {
        delete newLists[key];
      }
    });
    
    setLists(newLists);
  }, [basePrompt]);

  // We don't need to add examples anymore as we're using comma-separated values in brackets
  // The effect above will handle parsing values from the prompt

  // We're now handling all tag editing directly in the prompt text
  // No need for separate editing functions

  // Generate all prompt permutations
  const generatePermutations = useCallback(() => {
    // Check if all detected lists have at least one tag
    const allListsHaveTags = detectedLists.every(list => lists[list] && lists[list].length > 0);
    
    if (!allListsHaveTags) {
      toast.error("All detected lists must have at least one tag");
      return [];
    }
    
    // Function to create all permutations
    function generateAllPermutations(prompt, remainingLists, currentPermutations = []) {
      if (remainingLists.length === 0) {
        // Add the suffix to all final prompts
        return currentPermutations.length > 0 
          ? currentPermutations.map(p => p + promptSuffix) 
          : [prompt + promptSuffix];
      }
      
      const listId = remainingLists[0];
      const listTags = lists[listId];
      const newRemainingLists = remainingLists.slice(1);
      
      // For the first list, initialize permutations
      if (currentPermutations.length === 0) {
        const initialPermutations = listTags.map(tag => 
          prompt.replace(new RegExp(`\\{${listId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\}`, 'g'), tag)
        );
        return generateAllPermutations(prompt, newRemainingLists, initialPermutations);
      }
      
      // For subsequent lists, create permutations for each existing permutation
      const newPermutations = [];
      currentPermutations.forEach(permutation => {
        listTags.forEach(tag => {
          newPermutations.push(
            permutation.replace(new RegExp(`\\{${listId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\}`, 'g'), tag)
          );
        });
      });
      
      return generateAllPermutations(prompt, newRemainingLists, newPermutations);
    }
    
    const prompts = generateAllPermutations(basePrompt, [...detectedLists]);
    setGeneratedPrompts(prompts);
    return prompts;
  }, [basePrompt, detectedLists, lists, promptSuffix]);

  // Handle submit button click
  const handleSubmit = () => {
    const prompts = generatePermutations();
    if (prompts && prompts.length > 0 && onGenerateImages) {
      onGenerateImages(prompts);
    }
  };

  // Get colorful Figma-inspired badge styles
  const getTagColor = (listId, index) => {
    const colors = [
      "bg-[#A259FF] text-white", // Purple
      "bg-[#F24E1E] text-white", // Red
      "bg-[#1ABCFE] text-white", // Blue
      "bg-[#0ACF83] text-white", // Green
      "bg-[#FF7262] text-white", // Coral
      "bg-[#FF8A00] text-white", // Orange
    ];
    
    // Deterministic color assignment based on listId and index
    const colorIndex = (listId.charCodeAt(0) + index) % colors.length;
    return colors[colorIndex];
  };

  // Create a styled input component that highlights {...} sections
  const InlinePromptInput = () => {
    const textAreaRef = useRef(null);
    
    // Split the prompt into parts that are inside and outside curly braces
    const renderStyledPrompt = () => {
      const regex = /(\{[^{}]*\})/g;
      const parts = basePrompt.split(regex);
      
      // Count brackets to alternate colors
      let bracketCount = 0;
      
      // Define Figma colors for different bracket sets
      const bracketColors = [
        ["bg-[#A259FF] text-white", "bg-[#F24E1E] text-white"], // Purple, Red for first bracket
        ["bg-[#1ABCFE] text-white", "bg-[#0ACF83] text-white"]  // Blue, Green for second bracket
      ];
      
      return (
        <div 
          className="min-h-[80px] relative border rounded-md p-2 bg-background"
          onClick={() => textAreaRef.current?.focus()}
        >
          <div className="absolute inset-0 pointer-events-none overflow-hidden p-2">
            {parts.map((part, i) => {
              if (part.startsWith('{') && part.endsWith('}')) {
                // This is a placeholder - extract content without braces
                const content = part.substring(1, part.length - 1);
                
                // Increment bracket counter to alternate colors
                const colorSet = bracketColors[bracketCount % bracketColors.length];
                bracketCount++;
                
                // Check if there are comma-separated values
                if (content.includes(',')) {
                  // Split comma-separated values
                  const values = content.split(',').map(v => v.trim());
                  
                  return (
                    <span key={i} className="inline-flex items-center flex-wrap">
                      <span className="text-muted-foreground mx-0.5">{`{`}</span>
                      {values.map((value, idx) => (
                        <span key={`${i}-${idx}`} className="inline-flex items-center">
                          <span 
                            className={cn(
                              "px-1 py-0.5 mx-0.5 text-xs rounded-md inline", 
                              colorSet[idx % colorSet.length]
                            )}
                          >
                            {value}
                          </span>
                          {idx < values.length - 1 && (
                            <span className="text-muted-foreground">,</span>
                          )}
                        </span>
                      ))}
                      <span className="text-muted-foreground mx-0.5">{`}`}</span>
                    </span>
                  );
                } else {
                  // Single value - use the current bracket's color set
                  return (
                    <span 
                      key={i}
                      className={cn("px-1 py-0.5 mx-0.5 text-xs rounded-md inline", 
                        colorSet[0])}
                    >
                      {part}
                    </span>
                  );
                }
              }
              // Regular text
              return <span key={i}>{part}</span>;
            })}
          </div>
          
          <textarea
            ref={textAreaRef}
            className="absolute inset-0 w-full h-full opacity-0 cursor-text resize-none p-2"
            value={basePrompt}
            onChange={(e) => setBasePrompt(e.target.value)}
          />
        </div>
      );
    };
    
    return renderStyledPrompt();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center">
          <Label htmlFor="prompt" className="text-xs">Leietekst</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
              <p className="text-xs max-w-[200px]">
                Skriv tekst med {"{person}"}, {"{pose}"} som blir erstatta med tags.
                Bruk komma til å skilje tags inni klammane.
              </p>
            </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        {/* Use the styled input component instead of regular textarea */}
        <InlinePromptInput />
      </div>

      {detectedLists.length > 0 && (
        <div className="space-y-3">
          <Button 
            variant="default" 
            size="sm"
            className="w-full justify-start h-8"
            disabled={!detectedLists.every(list => lists[list]?.length > 0)}
            onClick={handleSubmit}
          >
            <span className="mr-auto">
              Generate {generatedPrompts.length || detectedLists.reduce((acc, list) => acc * (lists[list]?.length || 1), 1)} Images
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}