import { MessageCircle, User, MessageSquareQuote, ImageIcon, Trash2, X } from 'lucide-react';

export function GlassSection({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-1">
        <div className="w-7 h-7 rounded-lg bg-white/50 flex items-center justify-center text-black/40 border border-black/5 shadow-sm">
          {icon}
        </div>
        <h3 className="font-bold text-[11px] uppercase tracking-[0.2em] text-black/40">{label}</h3>
      </div>
      {children}
    </div>
  );
}

export function GlassInputBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2 px-1">
      <label className="font-bold text-[10px] text-black/30 uppercase tracking-wider pl-1">{label}</label>
      <input 
        type="text" 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        className="glass-input w-full font-semibold text-sm" 
      />
    </div>
  );
}

export function GlassTextarea({ label, value, onChange, height = "h-28" }: { label: string; value: string; onChange: (v: string) => void; height?: string }) {
  return (
    <div className="space-y-2 px-1">
      <label className="font-bold text-[10px] text-black/30 uppercase tracking-wider pl-1">{label}</label>
      <textarea 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        className={`glass-input w-full font-semibold text-sm resize-none ${height}`} 
      />
    </div>
  );
}
