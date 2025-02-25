"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Info } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function PromptGenerator({ onGenerateImages }) {
  const defaultPrompt = "full frame image of a single {list 1} scandinavian {list 2}, studio lighting, set stark against a solid white background";
  
  const [basePrompt, setBasePrompt] = useState(defaultPrompt);
  const [lists, setLists] = useState({});
  const [detectedLists, setDetectedLists] = useState([]);
  const [newTag, setNewTag] = useState({});
  const [generatedPrompts, setGeneratedPrompts] = useState([]);

  // Detect any {text} patterns in the prompt
  useEffect(() => {
    const regex = /\{([^}]+)\}/g;
    const matches = [...basePrompt.matchAll(regex)];
    const listIdentifiers = [...new Set(matches.map(match => match[1].trim()))];
    
    setDetectedLists(listIdentifiers);
    
    // Initialize lists object with empty arrays for new lists
    const newLists = { ...lists };
    listIdentifiers.forEach(id => {
      if (!newLists[id]) {
        newLists[id] = [];
      }
    });
    
    // Remove lists that are no longer in the prompt
    Object.keys(newLists).forEach(key => {
      if (!listIdentifiers.includes(key)) {
        delete newLists[key];
      }
    });
    
    setLists(newLists);
  }, [basePrompt]);

  // Add a new tag to a list
  const addTag = (listId) => {
    if (newTag[listId]?.trim()) {
      setLists(prev => ({
        ...prev,
        [listId]: [...(prev[listId] || []), newTag[listId].trim()]
      }));
      setNewTag(prev => ({ ...prev, [listId]: "" }));
    }
  };

  // Remove a tag from a list
  const removeTag = (listId, index) => {
    setLists(prev => ({
      ...prev,
      [listId]: prev[listId].filter((_, i) => i !== index)
    }));
  };

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
        return currentPermutations.length > 0 ? currentPermutations : [prompt];
      }
      
      const listId = remainingLists[0];
      const listTags = lists[listId];
      const newRemainingLists = remainingLists.slice(1);
      
      // For the first list, initialize permutations
      if (currentPermutations.length === 0) {
        const initialPermutations = listTags.map(tag => 
          prompt.replace(new RegExp(`\\{${listId}\\}`, 'g'), tag)
        );
        return generateAllPermutations(prompt, newRemainingLists, initialPermutations);
      }
      
      // For subsequent lists, create permutations for each existing permutation
      const newPermutations = [];
      currentPermutations.forEach(permutation => {
        listTags.forEach(tag => {
          newPermutations.push(permutation.replace(new RegExp(`\\{${listId}\\}`, 'g'), tag));
        });
      });
      
      return generateAllPermutations(prompt, newRemainingLists, newPermutations);
    }
    
    const prompts = generateAllPermutations(basePrompt, [...detectedLists]);
    setGeneratedPrompts(prompts);
    return prompts;
  }, [basePrompt, detectedLists, lists]);

  // Add example tags for the default prompt
  useEffect(() => {
    if (basePrompt === defaultPrompt && 
        Object.keys(lists).length > 0 && 
        (!lists["list 1"] || lists["list 1"].length === 0) && 
        (!lists["list 2"] || lists["list 2"].length === 0)) {
      setLists({
        "list 1": ["woman", "girl", "teenage boy", "young man", "toddler"],
        "list 2": ["idly standing", "jogging", "looking at phone", "squatting"]
      });
    }
  }, [basePrompt, lists, defaultPrompt]);

  // Handle key press in tag input
  const handleKeyPress = (e, listId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(listId);
    }
  };

  // Handle submit button click
  const handleSubmit = () => {
    const prompts = generatePermutations();
    if (prompts && prompts.length > 0 && onGenerateImages) {
      onGenerateImages(prompts);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="prompt">Base Prompt with Variable Lists</Label>
        <Textarea
          id="prompt"
          placeholder="Enter prompt with {list names} in curly braces"
          value={basePrompt}
          onChange={(e) => setBasePrompt(e.target.value)}
          className="min-h-[80px]"
        />
        <div className="flex items-center text-xs text-muted-foreground gap-1">
          <Info className="h-3 w-3" />
          <span>Use any text in curly braces like {"{people}"} or {"{poses}"} as placeholders</span>
        </div>
      </div>

      {detectedLists.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Detected Lists</h3>
          
          {detectedLists.map(listId => (
            <Card key={listId} className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">
                  {listId} 
                  <span className="ml-1 text-muted-foreground">
                    ({lists[listId]?.length || 0} items)
                  </span>
                </Label>
              </div>
              
              <div className="flex flex-wrap gap-2 min-h-[40px]">
                {lists[listId]?.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="px-2 py-1 text-xs">
                    {tag}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 ml-1 -mr-1"
                      onClick={() => removeTag(listId, index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
                
                <div className="flex items-center gap-1">
                  <Input
                    className="h-8 text-xs min-w-[120px] max-w-[180px]"
                    placeholder="Add tag..."
                    value={newTag[listId] || ""}
                    onChange={(e) => setNewTag(prev => ({ ...prev, [listId]: e.target.value }))}
                    onKeyDown={(e) => handleKeyPress(e, listId)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => addTag(listId)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {detectedLists.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label className="text-sm">
              Preview 
              <span className="ml-1 text-muted-foreground">
                ({generatedPrompts.length || "0"} permutations)
              </span>
            </Label>
            
            <Button 
              variant="default" 
              size="sm"
              disabled={!detectedLists.every(list => lists[list]?.length > 0)}
              onClick={handleSubmit}
            >
              Generate {generatedPrompts.length || detectedLists.reduce((acc, list) => acc * (lists[list]?.length || 1), 1)} Images
            </Button>
          </div>
          
          {generatedPrompts.length > 0 && (
            <div className="border rounded-md p-2 max-h-[200px] overflow-y-auto space-y-2 text-xs">
              {generatedPrompts.map((prompt, index) => (
                <div key={index} className="p-1 border-b last:border-b-0">
                  {prompt}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}