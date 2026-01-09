
import React, { useEffect, useRef, useState } from 'react';
import { Message } from '../types';
import { Terminal as TerminalIcon, Wifi, ChevronRight } from 'lucide-react';

interface TerminalViewProps {
  messages: Message[];
  onExecuteCommand?: (command: string) => void;
}

const TerminalView: React.FC<TerminalViewProps> = ({ messages, onExecuteCommand }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const lastMessage = messages[messages.length - 1];
  const isShellActive = lastMessage?.content.includes('exec -it') && !lastMessage?.content.includes('command terminated');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && onExecuteCommand) {
      onExecuteCommand(inputValue.trim());
      setInputValue('');
    }
  };

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div 
      className="h-full bg-slate-900 font-mono p-8 flex flex-col overflow-hidden selection:bg-indigo-500/30 text-indigo-100 shadow-inner cursor-text"
      onClick={handleContainerClick}
    >
      <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-5 shrink-0 pointer-events-none">
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500/80 shadow-lg shadow-rose-500/20" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80 shadow-lg shadow-amber-500/20" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80 shadow-lg shadow-emerald-500/20" />
          </div>
          <div className="flex items-center gap-3">
            <TerminalIcon className="w-4 h-4 text-white/40" />
            <span className="text-[10px] text-white/40 font-black tracking-widest uppercase">System Control Unit</span>
          </div>
        </div>
        
        {isShellActive && (
          <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full border border-emerald-500/20 animate-pulse shadow-2xl">
            <Wifi className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-widest">Active Shell</span>
          </div>
        )}
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-8 custom-scrollbar pr-4 pb-10">
        {messages.length === 0 ? (
          <div className="text-white/20 italic text-sm font-bold flex items-center gap-3 px-2">
             <span className="animate-pulse">_</span>
             <span className="uppercase tracking-widest text-xs">Awaiting Command Stream</span>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className="animate-in fade-in slide-in-from-left-2 duration-300">
              <pre className="text-sm text-indigo-100/90 leading-relaxed whitespace-pre-wrap break-all font-mono">
                {msg.content.split('\n').map((line, idx) => (
                  <div key={idx} className={line.startsWith('$') ? 'text-indigo-400 font-black mb-3 mt-6 first:mt-0 flex items-start gap-3' : 'opacity-80 py-0.5 border-l-2 border-white/5 pl-4'}>
                    {line}
                  </div>
                ))}
              </pre>
            </div>
          ))
        )}

        {/* Manual Command Input Area */}
        <div className="mt-8 px-2">
          <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <span className="text-indigo-400 font-black whitespace-nowrap">
              {isShellActive ? '/ #' : '$'}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-sm text-indigo-100 font-mono caret-indigo-500"
              placeholder={isShellActive ? "Type command..." : "Enter kubectl command..."}
              autoFocus
            />
          </form>
          {inputValue === '' && !isShellActive && messages.length > 0 && (
             <div className="w-2.5 h-5 bg-indigo-500/40 rounded-sm animate-pulse inline-block align-middle ml-[2.2rem] mt-[-1.5rem]" />
          )}
        </div>
      </div>
    </div>
  );
};

export default TerminalView;
