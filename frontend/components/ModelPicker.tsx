'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useModel, FALLBACK_MODEL_ID, type ModelOption } from '@/context/ModelContext';

// Known chat families. "First free model" alone is not a safe default: the
// free list is full of experimental/specialty models (the old logic shipped
// Google's Lyria — a music-generation model — as the trip planner).
const CHAT_FAMILY = /claude|gpt-|gemini|llama|mistral|qwen|deepseek|command|instruct|chat/i;
const NON_CHAT = /lyria|imagen|veo|whisper|tts|audio|music|video|embed|guard|vision-preview/i;

function pickDefaultModel(list: ModelOption[]): string {
  const chatSafe = (m: ModelOption) => CHAT_FAMILY.test(m.id) && !NON_CHAT.test(m.id) && !NON_CHAT.test(m.name);
  const freeChat = list.find((m) => m.pricing.prompt === '0' && chatSafe(m));
  if (freeChat) return freeChat.id;
  const haiku = list.find((m) => m.id.includes('claude-3-haiku'));
  if (haiku) return haiku.id;
  const anyChat = list.find(chatSafe);
  return anyChat?.id ?? FALLBACK_MODEL_ID;
}

export default function ModelPicker() {
  const { models, setModels, selectedModel, setSelectedModel } = useModel();
  const initialized = useRef(false);

  useEffect(() => {
    api
      .getModels()
      .then((list) => {
        setModels(list);
        if (initialized.current) return;
        initialized.current = true;
        setSelectedModel(pickDefaultModel(list));
      })
      .catch(() => {
        // Leave default fallback model selected if the request fails
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = models.find((m) => m.id === selectedModel);
  const isFree = current?.pricing.prompt === '0';

  return (
    <div className="flex w-full items-center gap-2">
      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        aria-label="AI model"
        className="w-full min-w-0 truncate text-sm bg-white border border-beige-300 rounded-lg px-3 py-1.5 text-brand-black focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300 cursor-pointer"
      >
        {models.length === 0 && <option value={selectedModel}>{selectedModel}</option>}
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.pricing.prompt === '0' ? ' — Free' : ''}
          </option>
        ))}
      </select>

      {isFree && (
        <span className="shrink-0 text-xs font-medium bg-sky-100 text-sky-500 px-2 py-0.5 rounded-full">
          Free
        </span>
      )}
    </div>
  );
}
