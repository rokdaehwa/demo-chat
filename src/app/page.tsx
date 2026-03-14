'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SendHorizonal, AlertCircle, Settings, X, Copy, RotateCcw, Check, ImageIcon, MessageCircle, User, MessageSquareQuote, Trash2 } from 'lucide-react';
import { parseSSEStream } from '@/lib/sse';
import { CHARACTER_CONFIG } from '@/config/character';
import { MessageRenderer, parseChunks, Message } from '@/components/chat/MessageRenderer';
import { GlassSection, GlassInputBox, GlassTextarea } from '@/components/chat/GlassComponents';

interface Asset {
  id: string;
  slug: string;
  altText: string;
  fileName: string;
  url: string;
  primaryButton?: string;
  secondaryButton?: string;
}

export default function ChatPage() {
  // Config State
  const [initialMessage, setInitialMessage] = useState(CHARACTER_CONFIG.initialMessage);
  const [initialSuggestions, setInitialSuggestions] = useState<string[]>(CHARACTER_CONFIG.initialSuggestions);
  const [persona, setPersona] = useState(CHARACTER_CONFIG.persona);
  const [character, setCharacter] = useState(CHARACTER_CONFIG.character);
  const [systemPrompt, setSystemPrompt] = useState(CHARACTER_CONFIG.systemPrompt);
  const [assets, setAssets] = useState<Asset[]>([]);

  // Initialize Assets safely on client
  useEffect(() => {
    setAssets(
      CHARACTER_CONFIG.assets.map((a, i) => ({
        id: `static-${i}`,
        slug: a.slug,
        altText: a.altText,
        fileName: a.path.split('/').pop() || 'Static',
        url: a.path,
        primaryButton: (a as any).primaryButton,
        secondaryButton: (a as any).secondaryButton
      }))
    );
  }, []);

  // Chat/Session State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [activeSuggestions, setActiveSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState('gemini-2.5-flash');
  const [isCopied, setIsCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [demoFeedbackId, setDemoFeedbackId] = useState<string | null>(null);
  const [triggerScroll, setTriggerScroll] = useState(0);
  const [isLastMessageFullyVisible, setIsLastMessageFullyVisible] = useState(false);
  
  const handleBubbleComplete = useCallback(() => {
    setTriggerScroll(prev => prev + 1);
  }, []);

  const handleAllComplete = useCallback(() => {
    setIsLastMessageFullyVisible(true);
  }, []);

  const handleDemoAction = (id: string) => {
    setDemoFeedbackId(id);
    setTimeout(() => setDemoFeedbackId(null), 2000);
  };
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Session
  useEffect(() => {
    async function init() {
      try {
        const sessionRes = await fetch('/api/chat/sessions', { method: 'POST' });
        const sessionData = await sessionRes.json();
        if (sessionData.id) {
          setSessionId(sessionData.id);
        } else {
          setError('SESSION_ERROR');
        }

        const modelsRes = await fetch('/api/chat/models');
        const modelsData = await modelsRes.json();
        if (modelsData.models && modelsData.models.length > 0) {
          const available = modelsData.models.map((m: any) => m.id);
          if (!available.includes(model)) setModel(available[0]);
        }
      } catch (err) {
        setError('CONNECTION_FAILED');
      }
    }
    init();
    resetChat();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isLoading, triggerScroll]);

  const resetChat = () => {
    setMessages([{ role: 'assistant', content: initialMessage }]);
    setActiveSuggestions(initialSuggestions);
    setInput('');
    setError(null);
    setIsLastMessageFullyVisible(false);
  };

  const handleSend = async (text: string = input) => {
    if ((!text.trim() && !input.trim()) || isLoading || !sessionId) return;

    const userMessage = text.trim() || input.trim();
    setInput('');
    setActiveSuggestions([]);
    setIsLoading(true);
    setIsLastMessageFullyVisible(false);
    setError(null);

    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);

    try {
      const response = await fetch('/api/chat/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          model: model,
          context: {
            messages: newMessages.map(m => ({
              role: m.role,
              content: m.content,
              createdAt: new Date().toISOString()
            })),
            persona, character, systemPrompt,
            assets: assets.length > 0 ? assets.map(a => ({ slug: a.slug, altText: a.altText })) : undefined
          }
        }),
      });

      if (!response.ok) throw new Error(await response.text());

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Stream error');

      let assistantText = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      for await (const event of parseSSEStream(reader)) {
        if (event.type === 'text-delta') {
          assistantText += event.delta || event.textDelta || '';
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1].content = assistantText;
            return updated;
          });
        } else if (event.type === 'tool-output-available') {
          if (event.output?.suggestions) setActiveSuggestions(event.output.suggestions);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Asset Handlers
  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAssets: Asset[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      slug: Math.random().toString(36).substring(2, 7),
      fileName: file.name,
      altText: file.name.split('.')[0],
      url: URL.createObjectURL(file)
    }));
    setAssets(prev => [...prev, ...newAssets]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateAsset = (id: string, updates: Partial<Asset>) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const copyConfig = () => {
    const config = JSON.stringify({ 
      initialMessage, initialSuggestions, persona, character, systemPrompt, 
      assets: assets.map(a => ({ slug: a.slug, altText: a.altText })) 
    }, null, 2);
    navigator.clipboard.writeText(config);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="app-container">
      {/* 1. Chat Section */}
      <div className={`chat-section transition-all duration-500 ease-in-out ${showSettings ? 'max-w-[700px]' : 'max-w-[800px] mx-auto'}`}>
        <header className="absolute top-2.5 right-2.5 z-20 flex items-center gap-2">
          <button 
            onClick={() => setShowSettings(!showSettings)} 
            className="p-1.5 rounded-lg bg-white/40 backdrop-blur-md border border-white/40 shadow-sm text-black/10 hover:text-black/40 transition-colors"
            title="Toggle Protocol"
          >
            <Settings size={14} />
          </button>
          <div className="px-1.5 py-1 rounded-lg bg-white/40 backdrop-blur-md border border-white/40 shadow-sm flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[8px] font-black tracking-widest text-black/30 uppercase">Live</span>
          </div>
        </header>

        {error && (
          <div className="mx-4 my-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 font-semibold text-xs flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 pb-28 no-scrollbar">
          {messages.map((m, msgIdx) => (
            <MessageRenderer 
              key={msgIdx} 
              m={m} 
              assets={assets}
              isLoading={isLoading && msgIdx === messages.length - 1}
              handleDemoAction={handleDemoAction}
              openMenuId={openMenuId}
              setOpenMenuId={setOpenMenuId}
              demoFeedbackId={demoFeedbackId}
              onBubbleComplete={handleBubbleComplete}
              onAllComplete={msgIdx === messages.length - 1 ? handleAllComplete : undefined}
            />
          ))}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 pt-6 bg-gradient-to-t from-white via-white/80 to-transparent">
          <div className="flex flex-col gap-3">
            {activeSuggestions.length > 0 && !isLoading && isLastMessageFullyVisible && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {activeSuggestions.filter(s => s.trim()).map((s, i) => (
                  <button key={i} onClick={() => handleSend(s)} className="whitespace-nowrap px-3 py-1.5 bg-white border border-black/5 rounded-full font-bold text-[10px] shadow-sm hover:translate-y-[-1px] transition-all">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="relative flex items-center bg-white border border-black/10 rounded-[20px] p-1 pr-1 pl-4 shadow-xl shadow-black/5 overflow-hidden">
              <input 
                type="text" 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
                placeholder="Message Sam Altman..." 
                className="flex-1 bg-transparent py-2 font-medium text-xs placeholder:text-black/30 outline-none" 
                disabled={isLoading} 
              />
              <button 
                onClick={() => handleSend()} 
                className="w-10 h-10 rounded-full bg-black text-white hover:scale-105 active:scale-95 transition-all flex items-center justify-center disabled:opacity-20" 
                disabled={isLoading || !input.trim()}
              >
                <SendHorizonal size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Settings Section */}
      {showSettings && (
        <div className="settings-section no-scrollbar animate-in slide-in-from-right duration-500 relative">
          <div className="flex flex-col gap-4 mb-6 pb-4 border-b border-black/5 sticky top-0 z-10 bg-[rgba(255,255,255,0.85)] backdrop-blur-xl -mx-5 px-5 pt-5 -mt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-md border border-black/5">
                <Settings size={20} className="text-black/70" />
              </div>
              <div>
                <h2 className="font-bold text-base gradient-text">Character Lab</h2>
                <p className="text-[9px] font-bold text-black/30 uppercase tracking-widest leading-none">Protocol config</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={resetChat} 
                className="flex-1 py-2.5 bg-black text-white rounded-xl font-bold text-[11px] shadow-sm shadow-black/10 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
              >
                 <RotateCcw size={14} /> Apply & Reset
              </button>
              <button 
                onClick={copyConfig} 
                className={`flex-1 py-2.5 rounded-xl font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 ${isCopied ? 'bg-green-500 text-white shadow-green-200 shadow-sm' : 'bg-white border border-black/5 text-black hover:bg-black/5'}`}
              >
                {isCopied ? <Check size={14} /> : <Copy size={14} />}
                {isCopied ? 'COPIED' : 'Export Config'}
              </button>
            </div>
          </div>

          <div className="space-y-8 flex-1">
            <GlassSection label="Entrypoint" icon={<MessageCircle size={14} />}>
              <div className="space-y-3">
                <GlassTextarea label="WELCOME_MESSAGE" value={initialMessage} onChange={setInitialMessage} height="h-24" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="font-bold text-[9px] text-black/40 uppercase tracking-wider">Initial Suggestions</span>
                    <button onClick={() => setInitialSuggestions([...initialSuggestions, ""])} className="text-[9px] font-bold text-black/60 hover:text-black">+ ADD</button>
                  </div>
                  <div className="space-y-1.5">
                    {initialSuggestions.map((s, i) => (
                      <div key={i} className="flex gap-1.5">
                         <input value={s} onChange={(e) => { const n = [...initialSuggestions]; n[i]=e.target.value; setInitialSuggestions(n); }} className="flex-1 px-3 py-2 bg-white/60 border border-black/5 rounded-xl text-[11px] font-medium focus:bg-white outline-none transition-all shadow-sm" />
                         <button onClick={() => setInitialSuggestions(initialSuggestions.filter((_, idx)=>idx!==i))} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 text-black/20 hover:text-red-500 transition-all"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </GlassSection>

            <GlassSection label="Cognitive Core" icon={<User size={14} />}>
              <div className="space-y-3">
                <GlassInputBox label="PERSONA" value={persona} onChange={setPersona} />
                <GlassTextarea label="CHARACTER_PROMPT" value={character} onChange={setCharacter} height="h-32" />
              </div>
            </GlassSection>

            <GlassSection label="System Override" icon={<MessageSquareQuote size={14} />}>
              <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="w-full p-4 bg-white/60 border border-black/5 rounded-[16px] font-mono text-[10px] h-24 focus:bg-white outline-none transition-all" placeholder="Manual system override..." />
            </GlassSection>

            <GlassSection label="Visual Matrix" icon={<ImageIcon size={14} />}>
              <div className="space-y-3">
                <button onClick={() => fileInputRef.current?.click()} className="w-full py-3 border border-dashed border-black/10 rounded-[16px] bg-white/40 font-bold text-[10px] text-black/40 hover:bg-white/70 hover:border-black/20 transition-all">
                  UPLOAD_NEW_ASSET
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileAdd} multiple className="hidden" accept="image/*" />
                <div className="grid gap-3">
                  {assets.map((asset) => (
                    <div key={asset.id} className="p-3 bg-white/80 border border-black/5 rounded-[20px] shadow-sm space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden border border-black/5">
                          <img src={asset.url} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[11px] truncate">{asset.fileName}</p>
                          <p className="text-[9px] text-black/30 font-bold">{asset.slug}</p>
                        </div>
                        <button onClick={() => setAssets(assets.filter(a=>a.id!==asset.id))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-black/10 hover:text-red-500 transition-all"><Trash2 size={14} /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                         <input value={asset.slug} onChange={(e) => updateAsset(asset.id, { slug: e.target.value })} className="px-2 py-1.5 bg-black/5 rounded-lg font-mono text-[9px] outline-none" placeholder="SLUG" />
                         <input value={asset.altText} onChange={(e) => updateAsset(asset.id, { altText: e.target.value })} className="px-2 py-1.5 bg-black/5 rounded-lg font-medium text-[9px] outline-none" placeholder="ALT_TEXT" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </GlassSection>
          </div>
        </div>
      )}
    </div>
  );
}
