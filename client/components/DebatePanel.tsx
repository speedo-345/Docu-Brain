'use client';

import { useState } from 'react';

export interface DebateData {
  advocate: string;
  critic: string;
  verdict: string;
  status?: string;
}

export default function DebatePanel({ data }: { data: DebateData }) {
  const [activeTab, setActiveTab] = useState<'advocate' | 'critic' | 'verdict'>('advocate');

  const tabs = [
    { id: 'advocate' as const, label: '🟢 Advocate', color: 'emerald' },
    { id: 'critic' as const, label: '🔴 Critic', color: 'red' },
    { id: 'verdict' as const, label: '⚖️ Verdict', color: 'amber' },
  ];

  const borderColors: Record<string, string> = {
    advocate: 'rgba(52, 211, 153, 0.25)',
    critic: 'rgba(248, 113, 113, 0.25)',
    verdict: 'rgba(251, 191, 36, 0.25)',
  };

  const glowColors: Record<string, string> = {
    advocate: '0 0 20px rgba(52, 211, 153, 0.08)',
    critic: '0 0 20px rgba(248, 113, 113, 0.08)',
    verdict: '0 0 20px rgba(251, 191, 36, 0.08)',
  };

  const textColors: Record<string, string> = {
    advocate: '#6ee7b7',
    critic: '#fca5a5',
    verdict: '#fcd34d',
  };

  const content: Record<string, string> = {
    advocate: data.advocate || 'Analyzing...',
    critic: data.critic || 'Analyzing...',
    verdict: data.verdict || 'Awaiting arguments...',
  };

  return (
    <div className="w-full my-2 animate-fadeInUp" style={{ minWidth: 280 }}>
      {/* Status */}
      {data.status && (
        <p className="text-xs text-white/40 mb-2 italic">{data.status}</p>
      )}

      {/* Tab Bar */}
      <div className="flex gap-1 mb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? 'glass-glow'
                : 'glass opacity-50 hover:opacity-80'
            }`}
            style={{
              borderColor: activeTab === tab.id ? borderColors[tab.id] : 'transparent',
              color: activeTab === tab.id ? textColors[tab.id] : '#888',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Panel */}
      <div
        className="p-3 rounded-xl glass-glow transition-all duration-300"
        style={{
          borderColor: borderColors[activeTab],
          boxShadow: glowColors[activeTab],
        }}
      >
        <p
          className="text-sm whitespace-pre-wrap leading-relaxed"
          style={{ color: textColors[activeTab] + 'cc' }}
        >
          {content[activeTab]}
        </p>
      </div>
    </div>
  );
}
