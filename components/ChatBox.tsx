
import React, { useState, useRef, useEffect } from 'react';
import { Message, AgentResponse } from '../types';
import { Send, Sparkles, Loader2, Code, Terminal, Info, ChevronRight } from 'lucide-react';

interface ChatBoxProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isProcessing: boolean;
  compact?: boolean;
}

const ChatBox: React.FC<ChatBoxProps> = ({ messages, onSendMessage, isProcessing, compact = false }) => {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className={`flex flex-col h-full ${compact ? 'bg-transparent' : 'bg-white'}`}>
      {!compact && (
        <div className="p-4 border-b border-slate-100 bg-white/50 backdrop-blur-md">
          <h2 className="flex items-center gap-2 font-bold text-slate-700">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            Assistant
          </h2>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar scroll-smooth">
        {messages.filter(m => m.role !== 'terminal').map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[95%] rounded-2xl px-4 py-3 text-[13px] font-medium leading-relaxed shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-br-none' 
                : 'bg-slate-50 text-slate-700 border border-slate-100 rounded-bl-none'
            }`}>
              {msg.content}
            </div>
            
            {msg.data && (msg.data as AgentResponse).steps && (
              <div className="mt-3 w-full space-y-2 animate-in fade-in slide-in-from-top-1">
                {(msg.data as AgentResponse).steps.map((step, idx) => (
                  <div key={idx} className="bg-slate-50/50 border border-slate-100 rounded-xl p-3 shadow-sm overflow-hidden group hover:bg-white transition-colors">
                    <div className="flex items-center gap-2 text-indigo-600 font-black text-[9px] uppercase tracking-widest mb-2">
                      <ChevronRight className="w-3 h-3" />
                      Step {idx + 1}: {step.description}
                    </div>
                    <div className="bg-slate-900 p-2.5 rounded-lg font-mono text-[10px] text-indigo-300 border border-slate-800 mb-2 select-all overflow-x-auto whitespace-nowrap shadow-inner">
                      {step.command}
                    </div>
                    <p className="text-slate-500 text-[10px] font-bold leading-normal flex items-start gap-1.5 px-0.5">
                      <Info className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
                      {step.explanation}
                    </p>
                  </div>
                ))}
              </div>
            )}
            
            <span className="text-[8px] text-slate-400 mt-1.5 uppercase tracking-widest font-black opacity-60">
              {msg.role === 'user' ? 'USER' : 'AGENT'} • {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        {isProcessing && (
          <div className="flex items-center gap-3 text-slate-400 p-2 animate-pulse">
             <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
             <span className="text-[9px] font-black uppercase tracking-widest">Thinking...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="p-4 bg-white/80 backdrop-blur-md border-t border-slate-100">
        <form onSubmit={handleSubmit} className="relative group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            placeholder="Translate intent to command..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-5 pr-14 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all placeholder:text-slate-400 text-sm font-semibold shadow-inner"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="absolute right-2 top-2 h-10 w-10 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl transition-all shadow-lg active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="mt-3 flex items-center justify-center gap-2">
           <span className="text-[8px] text-slate-300 font-black uppercase tracking-[0.2em]">SRE Intelligence Layer</span>
        </div>
      </div>
    </div>
  );
};

export default ChatBox;
