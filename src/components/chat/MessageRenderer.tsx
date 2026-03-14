'use client';

import { useState, useEffect } from 'react';
import { ImageIcon, MoreVertical, ThumbsUp, ThumbsDown } from 'lucide-react';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface RenderChunk {
  role: 'user' | 'assistant';
  type: 'text' | 'asset';
  value: string;
}

export function MessageRenderer({ m, assets, isLoading, handleDemoAction, openMenuId, setOpenMenuId, demoFeedbackId, onBubbleComplete, onAllComplete }: any) {
  const chunks = parseChunks(m);
  const [visibleCount, setVisibleCount] = useState(1);
  const [completedIndices, setCompletedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (m.role === 'user') return;
    
    const lastVisibleIdx = visibleCount - 1;
    if (completedIndices.has(lastVisibleIdx) && visibleCount < chunks.length) {
      const timer = setTimeout(() => {
        setVisibleCount(prev => prev + 1);
      }, 150); 
      return () => clearTimeout(timer);
    }
  }, [chunks.length, visibleCount, completedIndices, m.role]);

  useEffect(() => {
    onBubbleComplete();
  }, [visibleCount, completedIndices.size, onBubbleComplete]);

  useEffect(() => {
    const isFinished = !isLoading && chunks.length > 0 && completedIndices.size === chunks.length;
    if (isFinished && onAllComplete) {
      onAllComplete();
    }
  }, [completedIndices.size, chunks.length, onAllComplete, isLoading]);

  if (m.role === 'user') {
    return (
      <div className="flex flex-row-reverse items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="max-w-[85%] p-3 px-4 rounded-[20px] text-[13px] leading-relaxed bg-black text-white rounded-tr-none shadow-lg shadow-black/5">
          <div className="whitespace-pre-wrap">{m.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {chunks.slice(0, visibleCount).map((chunk, idx) => {
        const isLastInVisible = idx === visibleCount - 1;
        const matchingAsset = chunk.type === 'asset' ? assets.find((a: any) => a.slug === chunk.value) : null;
        const bubbleId = `${m.content.slice(0, 10)}-${idx}`;

        return (
          <div key={idx} className="flex flex-row items-start gap-3 animate-in fade-in duration-500">
            {chunk.type === 'asset' ? (
              <AssistantAssetBubble 
                chunk={chunk}
                matchingAsset={matchingAsset}
                isActive={isLastInVisible && !completedIndices.has(idx)}
                onComplete={() => setCompletedIndices(prev => new Set(prev).add(idx))}
                handleDemoAction={handleDemoAction}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                demoFeedbackId={demoFeedbackId}
                bubbleId={bubbleId}
              />
            ) : (
              <AssistantTextBubble 
                chunk={chunk} 
                isActive={isLastInVisible && !completedIndices.has(idx)}
                onComplete={() => setCompletedIndices(prev => new Set(prev).add(idx))}
                isLoading={isLoading && idx === chunks.length - 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AssistantTextBubble({ chunk, isActive, onComplete, isLoading }: { chunk: RenderChunk, isActive: boolean, onComplete: () => void, isLoading: boolean }) {
  const [phase, setPhase] = useState<'waiting' | 'typing' | 'revealed'>(isActive ? 'typing' : 'revealed');

  useEffect(() => {
    if (isActive && phase === 'waiting') {
      setPhase('typing');
    }
  }, [isActive, phase]);

  useEffect(() => {
    if (phase === 'typing') {
      const timer = setTimeout(() => {
        setPhase('revealed');
        onComplete();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [phase, onComplete]);

  return (
    <div className="max-w-[85%] p-3 px-4 rounded-[20px] text-[13px] leading-relaxed bg-white/80 border border-black/5 rounded-tl-none shadow-sm backdrop-blur-sm">
      <div className="flex items-center min-h-[1.25rem]">
        {phase === 'typing' || (isLoading && !chunk.value) ? (
          <div className="flex gap-1 items-center px-1 h-5">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
        ) : (
          <div className="whitespace-pre-wrap animate-in fade-in duration-300">
            {chunk.value}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantAssetBubble({ chunk, matchingAsset, isActive, onComplete, handleDemoAction, openMenuId, setOpenMenuId, demoFeedbackId, bubbleId }: any) {
  const [isRevealed, setIsRevealed] = useState(!isActive);

  useEffect(() => {
    if (isActive && !isRevealed) {
      const timer = setTimeout(() => {
        setIsRevealed(true);
        onComplete();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isActive, isRevealed, onComplete]);

  if (!isRevealed) {
    return (
       <div className="p-4 bg-white/40 backdrop-blur-sm rounded-xl border border-black/5 flex items-center gap-2">
         <div className="typing-dot" />
         <div className="typing-dot" />
         <div className="typing-dot" />
       </div>
    );
  }

  return (
    <div className="max-w-[90%] flex flex-col gap-2 py-1 animate-in fade-in zoom-in-95 duration-500">
      <div className="rounded-xl overflow-hidden">
        {matchingAsset ? (
          <img src={matchingAsset.url} alt={matchingAsset.altText} className="w-full h-auto rounded-lg" />
        ) : (
          <div className="p-8 flex flex-col items-center gap-3 text-black/20 font-medium text-[10px] uppercase italic bg-white/40 backdrop-blur-sm rounded-xl border border-black/5">
            <ImageIcon size={24} strokeWidth={1.5} />
            DETACHED_ASSET: {chunk.value}
          </div>
        )}
      </div>
      {matchingAsset && (matchingAsset.primaryButton || matchingAsset.secondaryButton) && (
        <div className="flex gap-2 px-0.5 relative">
          {matchingAsset.primaryButton && (
            <button 
              onClick={() => handleDemoAction(bubbleId)}
              className={`flex-1 py-2.5 text-white rounded-xl font-bold text-[11px] shadow-lg shadow-black/5 hover:scale-[1.01] active:scale-[0.99] transition-all ${demoFeedbackId === bubbleId ? 'bg-black/70' : 'bg-black'}`}
            >
              {demoFeedbackId === bubbleId ? '⚠️ 데모 기능입니다' : matchingAsset.primaryButton}
            </button>
          )}
          <button 
            onClick={() => setOpenMenuId(openMenuId === bubbleId ? null : bubbleId)}
            className={`w-9 h-9 shrink-0 bg-white/60 border border-black/5 rounded-xl flex items-center justify-center transition-all shadow-sm ${openMenuId === bubbleId ? 'bg-black/5 text-black' : 'text-black/50 hover:bg-white/90 hover:text-black/80'}`}
          >
            <MoreVertical size={16} />
          </button>

          {openMenuId === bubbleId && (
            <div className="absolute top-[2.5rem] right-0 mt-1 w-[200px] bg-white/95 backdrop-blur-md border border-black/5 rounded-2xl shadow-xl shadow-black/10 z-50 overflow-hidden flex flex-col p-1 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
              {matchingAsset.secondaryButton && (
                <button 
                  onClick={() => setOpenMenuId(null)}
                  className="w-full text-left px-3 py-2.5 hover:bg-black/5 rounded-xl text-[11px] font-bold text-black/70 transition-colors"
                >
                  {matchingAsset.secondaryButton}
                </button>
              )}
              {(matchingAsset.primaryButton || matchingAsset.secondaryButton) && <div className="h-px bg-black/5 my-0.5 mx-2" />}
              <button onClick={() => setOpenMenuId(null)} className="w-full text-left px-3 py-2.5 hover:bg-blue-50/50 rounded-xl text-[11px] font-bold text-black/70 hover:text-blue-600 transition-colors flex items-center gap-2">
                <ThumbsUp size={12} />이 추천이 마음에 들어요
              </button>
              <button onClick={() => setOpenMenuId(null)} className="w-full text-left px-3 py-2.5 hover:bg-red-50/50 rounded-xl text-[11px] font-bold text-black/70 hover:text-red-600 transition-colors flex items-center gap-2">
                <ThumbsDown size={12} />이 추천이 마음에 안 들어요
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const parseChunks = (m: Message): RenderChunk[] => {
  if (m.role === 'user') return [{ role: 'user', type: 'text', value: m.content }];
  const cleanedContent = m.content.replace(/^["']|["']$/g, '');
  
  if (!cleanedContent.trim()) return [{ role: 'assistant', type: 'text', value: '' }];

  const chunks: RenderChunk[] = [];
  const assetRegex = /\{\{asset\((.*?)\)\}\}/g;
  let lastIndex = 0;
  let match;
  while ((match = assetRegex.exec(cleanedContent)) !== null) {
    if (match.index > lastIndex) {
      const text = cleanedContent.slice(lastIndex, match.index);
      chunks.push(...splitSentences(text));
    }
    chunks.push({ role: 'assistant', type: 'asset', value: match[1] });
    lastIndex = assetRegex.lastIndex;
  }
  if (lastIndex < cleanedContent.length) {
    const text = cleanedContent.slice(lastIndex);
    chunks.push(...splitSentences(text));
  }
  return chunks;
};

const splitSentences = (text: string): RenderChunk[] => {
  const regex = /[^.!?]+[.!?]*["'”’)]*/g;
  const matches = text.match(regex);
  if (!matches) return text.trim() ? [{ role: 'assistant', type: 'text', value: text.trim() }] : [];
  return matches.map(s => ({ role: 'assistant' as const, type: 'text' as const, value: s.trim() })).filter(chunk => chunk.value.length > 0);
};
