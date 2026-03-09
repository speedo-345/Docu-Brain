'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Plus, Menu, X } from 'lucide-react';
import { docsService } from '@/services/docsService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?:{textSnippet?:string; score?:number; pageNumber?: number}[];
}

interface ChatSidebarProps {
  docId: string;
  onUploadClick?: () => void;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onCitationClick: (page: number) => void
}

export default function ChatSidebar({
  docId,
  onUploadClick,
  isCollapsed = false,
  onCollapsedChange,
  onCitationClick
}: ChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I've analyzed your document. What would you like to know?",
      timestamp: new Date(Date.now() - 60000),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!docId) return;

    const loadHistory = async () => {
      try {
        const history = await docsService.getChatHistory(docId);

        const formatted = history.map((msg: any) => ({
          id: msg._id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.createdAt)
        }));
        setMessages(formatted);
      } catch (error) {
        console.error("Failed to load history");
      }
    };
    loadHistory()
  }, [docId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping) return;

    const currentQuery = inputValue;
    setIsTyping(true);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    try {

      const results = await docsService.searchDocument(currentQuery, docId);
      let aiResponseContent = "";

      if (results && results.length > 0) {
        aiResponseContent = "Here are the most relevant sections I found:\n\n";
        results.forEach((item: any) => {
          aiResponseContent += `Source:${item.filename} (Match: ${Math.round(item.score * 100)}%)\n"${item.text.substring(0, 150)}..."\n\n `;
        });

      } else {
        aiResponseContent = "I couldn't find any relevant information in your documents.";
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponseContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);

    } catch (error) {
      console.error("Search failed: ", error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: "Sorry, I encountered an error searching the documents.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  /* ── Collapsed state ── */
  if (isCollapsed) {
    return (
      <div
        className="w-16 h-screen glass-dark border-r flex flex-col items-center justify-between p-4"
        style={{ borderColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 0 }}
      >
        <button
          onClick={() => onCollapsedChange?.(false)}
          className="p-2 hover:glass rounded-lg text-white/70 hover:text-white transition-all"
        >
          <Menu size={20} />
        </button>
        <button
          onClick={onUploadClick}
          className="p-2 hover:glass rounded-lg text-white/70 hover:text-white transition-all"
          title="Upload Document"
        >
          <Plus size={20} />
        </button>
      </div>
    );
  }

  return (
    /* Flush left edge — no border-radius on the panel itself */
    <div
      className="w-full sm:w-80 h-screen glass-dark border-r flex flex-col"
      style={{ borderColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
        <h2 className="text-lg font-bold text-white">Chat</h2>
        <button
          onClick={() => onCollapsedChange?.(true)}
          className="p-1.5 hover:glass rounded-lg text-white/50 hover:text-white transition-all"
        >
          <X size={18} />
        </button>
      </div>

      {/* Upload Button */}
      <div className="px-4 pt-4 pb-2">
        <button
          onClick={onUploadClick}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-white text-black font-semibold hover:bg-white/90 hover:shadow-lg hover:shadow-white/10 transition-all duration-200"
        >
          <Plus size={18} />
          <span>New Document</span>
        </button>
      </div>

      {/* Messages Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide"
        style={{ scrollBehavior: 'smooth' }}
      >
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`flex gap-3 animate-slideInLeft stagger-${(index % 4) + 1}`}
            style={{ justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}
          >
            {/* Assistant avatar */}
            {message.role === 'assistant' && (
              <div className="w-8 h-8 rounded-lg glass flex items-center justify-center flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-white/60" />
              </div>
            )}

            {/* Bubble */}
            <div
              className={`max-w-xs px-4 py-2 rounded-lg glass whitespace-pre-wrap ${message.role === 'user'
                ? 'bg-white/10 border border-white/15'
                : 'bg-white/5 border border-white/10'
                }`}
            >
              <p className="text-sm text-foreground">{message.content}</p>
              <p className="text-xs text-foreground-tertiary mt-1">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {/* User avatar */}
            {message.role === 'user' && (
              <div className="w-8 h-8 rounded-lg glass flex items-center justify-center flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-white/80" />
              </div>
            )}

            {message.sources?.map((source, i) => (
              <button
                key={i}
                onClick={() => onCitationClick(source.pageNumber || 1)}
                className="text-xs text-blue-400 underline hover:text-blue-300 block mt-1"
              >
                Jump to Page {source.pageNumber || 1}
              </button>
            ))}
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg glass flex items-center justify-center flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-white/60" />
            </div>
            <div className="glass px-4 py-2 rounded-lg flex gap-1 items-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" />
              <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0.15s' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t p-4 space-y-3" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
        <div className="relative">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask me anything about the document..."
            rows={2}
            className="w-full px-4 py-2 rounded-lg glass-dark text-foreground placeholder-gray-600 focus-glow transition-all resize-none"
          />
          {inputValue && (
            <div className="text-xs text-foreground-tertiary mt-1">{inputValue.length} characters</div>
          )}
        </div>

        <button
          onClick={handleSendMessage}
          disabled={!inputValue.trim() || isTyping}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-white text-black font-semibold hover:bg-white/90 hover:shadow-lg hover:shadow-white/10 transition-all duration-200 disabled:opacity-30 disabled:hover:bg-white"
        >
          <Send size={18} />
          <span>Send</span>
        </button>
      </div>
    </div>
  );
}
