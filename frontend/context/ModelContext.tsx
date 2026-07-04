'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export interface ModelOption {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

export const FALLBACK_MODEL_ID = 'anthropic/claude-3-haiku';

interface ModelContextValue {
  models: ModelOption[];
  setModels: (models: ModelOption[]) => void;
  selectedModel: string;
  setSelectedModel: (id: string) => void;
}

const ModelContext = createContext<ModelContextValue | undefined>(undefined);

export function ModelProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(FALLBACK_MODEL_ID);

  return (
    <ModelContext.Provider value={{ models, setModels, selectedModel, setSelectedModel }}>
      {children}
    </ModelContext.Provider>
  );
}

export function useModel(): ModelContextValue {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error('useModel must be used within a ModelProvider');
  return ctx;
}
