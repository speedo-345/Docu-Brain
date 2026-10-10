'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Plus, Menu, X, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { docsService } from '@/services/docsService';
import ChatChart, { ChartPayload } from './ChatChart';
import DebatePanel, { DebateData } from './DebatePanel';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useVoiceOutput } from '@/hooks/useVoiceOutput';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: { textSnippet?: string; score?: number; pageNumber?: number; filename?: string | null }[];
  chart?: ChartPayload;
  debate?: DebateData;
}

interface ChatSidebarProps {
  docId: string;
  onUploadClick?: () => void;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onCitationClick: (page: number) => void;
  isFullScreen?: boolean;
}

export default function ChatSidebar({
  docId,
  onUploadClick,
  isCollapsed = false,
  onCollapsedChange,
  onCitationClick,
  isFullScreen = false
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
  const voiceTriggeredRef = useRef(false);
  const fullAnswerRef = useRef('');

  // Voice hooks
  const { isListening, transcript, startListening, stopListening, isSupported: micSupported } = useVoiceInput();
  const { isSpeaking, speak, stop: stopSpeaking, isSupported: ttsSupported } = useVoiceOutput();

  // When voice transcript updates, fill the input
  useEffect(() => {
    if (transcript) {
      setInputValue(transcript);
    }
  }, [transcript]);

  // When voice stops listening and there's a transcript, auto-send
  useEffect(() => {
    if (!isListening && voiceTriggeredRef.current && inputValue.trim()) {
      voiceTriggeredRef.current = false;
      handleSendMessage(true);
    }
  }, [isListening]);

  useEffect(() => {
    if (!docId) return;

    const loadHistory = async () => {
      try {
        const history = await docsService.getChatHistory(docId);

        const formatted = history.map((msg: any) => ({
          id: msg._id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.createdAt),
          sources: msg.sources || []
        }));
        if (formatted.length > 0) {
          setMessages(formatted);
        }
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

  const handleSendMessage = async (isVoice: boolean = false) => {
    if (!inputValue.trim() || isTyping) return;

    const currentQuery = inputValue;
    setIsTyping(true);
    fullAnswerRef.current = '';

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };
    const aiMessageId = (Date.now() + 1).toString();
    const initialAiMessage: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: "",
      timestamp: new Date(),
      sources: []
    };

    setMessages((prev) => [...prev, userMessage, initialAiMessage]);
    setInputValue('');

    try {
      // Build history for context (excluding the new user message)
      const history = messages
        .filter(m => m.id !== '1' && m.id !== userMessage.id && m.id !== aiMessageId) // remove welcome msg
        .map(m => ({ role: m.role, content: m.content }));

      await docsService.searchDocument(
        currentQuery, 
        docId,
        history,
        (chunk) => {
            fullAnswerRef.current += chunk;
            setMessages(prev => prev.map(m => 
                m.id === aiMessageId 
                    ? { ...m, content: m.content + chunk } 
                    : m
            ));
        },
        (sources) => {
            setMessages(prev => prev.map(m => 
                m.id === aiMessageId 
                    ? { ...m, sources: sources.map((item: any) => ({
                        textSnippet: item.textSnippet,
                        score: item.score,
                        pageNumber: item.pageNumber || 1,
                        filename: item.filename
                    })) } 
                    : m
            ));
        },
        (chartData) => {
            setMessages(prev => prev.map(m =>
                m.id === aiMessageId
                    ? { ...m, chart: chartData }
                    : m
            ));
        },
        (debateType, debateData) => {
            setMessages(prev => prev.map(m => {
                if (m.id !== aiMessageId) return m;
                const currentDebate = m.debate || { advocate: '', critic: '', verdict: '', status: '' };
                if (debateType === 'debate_advocate') {
                    return { ...m, debate: { ...currentDebate, advocate: debateData } };
                } else if (debateType === 'debate_critic') {
                    return { ...m, debate: { ...currentDebate, critic: debateData } };
                } else if (debateType === 'debate_verdict') {
                    return { ...m, debate: { ...currentDebate, verdict: currentDebate.verdict + debateData } };
                } else if (debateType === 'debate_status') {
                    return { ...m, debate: { ...currentDebate, status: debateData } };
                }
                return m;
            }));
        }
      );

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
      // Voice-out: speak the answer if this was a voice query
      if (isVoice && ttsSupported && fullAnswerRef.current) {
        speak(fullAnswerRef.current);
      }
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
      </div>
    );
  }

  return (
    <div
      className="w-full h-full glass-dark border-r flex flex-col"
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
      {/* Messages Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide"
        style={{ scrollBehavior: 'smooth' }}
      >
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'animate-slideInRight' : 'animate-slideInLeft'} stagger-${(index % 4) + 1}`}
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

              {/* Generative UI: Chart */}
              {message.chart && (
                <ChatChart data={message.chart} />
              )}

              {/* Multi-Agent Debate */}
              {message.debate && (
                <DebatePanel data={message.debate} />
              )}

              <p className="text-xs text-foreground-tertiary mt-1">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>

              {message.sources && message.sources.length > 0 && (
                <div className='mt-3 space-y-1 border-t border-white/10 pt-2'>
                  <span className='text-xs text-gray-400 font-semibold uppercase'>Sources:</span>

                  {message.sources?.map((source, i) => {
                    const isOtherFile = source.filename && source.filename !== docId;
                    return (
                      <div key={i} className="flex flex-col gap-0.5">
                        {isOtherFile && (
                          <span className="text-xs text-amber-400/80 font-medium">
                            📄 {source.filename}
                          </span>
                        )}
                        <button
                          onClick={() => !isOtherFile && onCitationClick(source.pageNumber || 1)}
                          className={`text-xs underline block text-left ${
                            isOtherFile
                              ? 'text-amber-400/60 cursor-default no-underline'
                              : 'text-blue-400 hover:text-blue-300'
                          }`}
                        >
                          {isOtherFile ? `Page ${source.pageNumber || '?'} (other document)` : `Jump to Page ${source.pageNumber || 1}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* User avatar */}
            {message.role === 'user' && (
              <div className="w-8 h-8 rounded-lg glass flex items-center justify-center flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-white/80" />
              </div>
            )}
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
            <div className="text-xs text-foreground-tertiary mt-1">~{Math.ceil(inputValue.split(/\s+/).filter(Boolean).length * 1.3)} tokens</div>
          )}
        </div>

        <div className="flex gap-2">
        <button
          onClick={handleSendMessage}
          disabled={!inputValue.trim() || isTyping}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-white text-black font-semibold hover:bg-white/90 hover:shadow-lg hover:shadow-white/10 transition-all duration-200 disabled:opacity-30 disabled:hover:bg-white"
        >
          <Send size={18} />
          <span>Send</span>
        </button>

        {/* Voice Controls */}
        {micSupported && (
          <button
            onClick={() => {
              if (isListening) {
                stopListening();
              } else {
                voiceTriggeredRef.current = true;
                startListening();
              }
            }}
            className={`p-2 rounded-lg transition-all duration-200 ${
              isListening
                ? 'bg-red-500/20 text-red-400 animate-pulse border border-red-500/30'
                : 'glass text-white/60 hover:text-white'
            }`}
            title={isListening ? 'Stop listening' : 'Voice input'}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}

        {ttsSupported && isSpeaking && (
          <button
            onClick={stopSpeaking}
            className="p-2 rounded-lg glass text-amber-400 animate-pulse border border-amber-500/20"
            title="Stop speaking"
          >
            <VolumeX size={18} />
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
