"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Info, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

export function PromptGenerator({ onGenerateImages }) {
  // Changed default prompt
  const defaultPrompt = "full frame image of a single {person} scandinavian {pose}";
  // Updated suffix
  const promptSuffix = ", full standing body, head to toe view, studio lighting, set stark against a solid white background";
  
  const [basePrompt, setBasePrompt] = useState(defaultPrompt);
  const [lists, setLists] = useState({});
  const [detectedLists, setDetectedLists] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [activeListId, setActiveListId] = useState(null);
  const [editingTag, setEditingTag] = useState({ listId: null, index: null, value: "" });
  const [generatedPrompts, setGeneratedPrompts] = useState([]);
  const editInputRef = useRef(null);

  // Detect any {text} patterns in the prompt
  useEffect(() => {
    const regex = /\{([^}]+)\}/g;
    const matches = [...basePrompt.matchAll(regex)];
    const listIdentifiers = [...new Set(matches.map(match => match[1].trim()))];
    
    setDetectedLists(listIdentifiers);
    
    // Initialize lists object
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

  // Add example tags when component loads with default prompt
  useEffect(() => {
    if (basePrompt === defaultPrompt && 
        detectedLists.includes("person") && 
        detectedLists.includes("pose") &&
        (!lists["person"] || lists["person"].length === 0) && 
        (!lists["pose"] || lists["pose"].length === 0)) {
      // Reduced to 2 elements per list
      setLists({
        "person": ["woman", "man"],
        "pose": ["standing", "walking"]
      });
    }
  }, [basePrompt, lists, defaultPrompt, detectedLists]);

  // Focus on edit input when editing starts
  useEffect(() => {
    if (editingTag.listId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingTag]);

  // Process tag with multiplier syntax (tag*n)
  const processTagWithMultiplier = (tag) => {
    const multiplierMatch = tag.match(/^(.+)\*(\d+)$/);
    if (multiplierMatch) {
      const baseTag = multiplierMatch[1].trim();
      const count = parseInt(multiplierMatch[2], 10);
      return Array(count).fill(baseTag);
    }
    return [tag];
  };

  // Add a new tag to a list
  const addTag = (listId, tagText) => {
    if (!tagText?.trim()) return;
    
    const processedTags = processTagWithMultiplier(tagText.trim());
    
    setLists(prev => ({
      ...prev,
      [listId]: [...(prev[listId] || []), ...processedTags]
    }));
  };

  // Remove a tag from a list
  const removeTag = (listId, index) => {
    setLists(prev => ({
      ...prev,
      [listId]: prev[listId].filter((_, i) => i !== index)
    }));
  };

  // Start editing a tag
  const startEditTag = (listId, index, value) => {
    setEditingTag({ listId, index, value });
  };

  // Complete tag editing
  const completeTagEdit = () => {
    if (editingTag.listId && editingTag.value.trim()) {
      setLists(prev => {
        const newList = [...prev[editingTag.listId]];
        newList[editingTag.index] = editingTag.value.trim();
        return { ...prev, [editingTag.listId]: newList };
      });
    }
    setEditingTag({ listId: null, index: null, value: "" });
  };

  // Handle key press in tag editing
  const handleEditKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      completeTagEdit();
    } else if (e.key === 'Escape') {
      setEditingTag({ listId: null, index: null, value: "" });
    }
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
                Bruk {"{person}"}, {"{pose}"} som plasshaldarar. For fleire variantar, 
                bruk {"{person*3}"}-syntaksen for å gjenta ein tag 3 gongar.
              </p>
            </TooltipContent>

            </Tooltip>
          </TooltipProvider>
        </div>
        <Textarea
          id="prompt"
          placeholder="Enter prompt with {placeholders} in curly braces"
          value={basePrompt}
          onChange={(e) => setBasePrompt(e.target.value)}
          className="min-h-[80px]"
        />
      </div>

      {detectedLists.length > 0 && (
        <div className="space-y-3">
          {detectedLists.map(listId => (
            <Card key={listId} className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{listId} ({lists[listId]?.length || 0})</span>
              </div>
              
              <div className="flex flex-wrap gap-2 min-h-[40px] items-center">
                {lists[listId]?.map((tag, index) => (
                  <div key={index} className="relative">
                    {editingTag.listId === listId && editingTag.index === index ? (
                      <div className="flex items-center">
                        <input
                          ref={editInputRef}
                          type="text"
                          className="h-7 px-2 py-0 text-xs border rounded-full focus:outline-none focus:ring-1 focus:ring-primary w-[120px]"
                          value={editingTag.value}
                          onChange={(e) => setEditingTag({...editingTag, value: e.target.value})}
                          onKeyDown={handleEditKeyPress}
                          onBlur={completeTagEdit}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 ml-1"
                          onClick={completeTagEdit}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Badge 
                        className={`px-3 py-1 text-xs rounded-full ${getTagColor(listId, index)} cursor-pointer group`}
                        onClick={() => startEditTag(listId, index, tag)}
                      >
                        <span className="group-hover:underline">{tag}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 ml-1 -mr-1 text-white/90 hover:text-white hover:bg-transparent opacity-70 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTag(listId, index);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        <span className="sr-only">Edit</span>
                      </Badge>
                    )}
                  </div>
                ))}
                
                <Badge 
                  className="bg-muted text-muted-foreground hover:bg-muted/80 px-2 py-1 rounded-full cursor-pointer h-6 w-6 flex items-center justify-center"
                  onClick={() => setActiveListId(listId)}
                >
                  <Plus className="h-3 w-3" />
                </Badge>
                
                {activeListId === listId && (
                  <div className="flex items-center">
                    <input
                      autoFocus
                      type="text"
                      className="h-7 px-2 py-0 text-xs border rounded-full focus:outline-none focus:ring-1 focus:ring-primary w-[120px]"
                      placeholder="Add tag or tag*n..."
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag(listId, newTag);
                          setNewTag("");
                        } else if (e.key === 'Escape') {
                          setActiveListId(null);
                          setNewTag("");
                        }
                      }}
                      onBlur={() => {
                        if (newTag.trim()) {
                          addTag(listId, newTag);
                        }
                        setActiveListId(null);
                        setNewTag("");
                      }}
                    />
                  </div>
                )}
              </div>
            </Card>
          ))}
          
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