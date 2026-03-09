'use client';

import { useState } from 'react';
import ChatSidebar from '@/components/ChatSidebar';
import DocumentViewer from '@/components/DocumentViewer';
import InfoPanel from '@/components/InfoPanel';
import { Menu } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function ViewerPage() {

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const [targetPage, setTargetPage]= useState<number| null>(null);

  const searchParams = useSearchParams();

  const filename = searchParams.get('file');
  const docId = searchParams.get('docId');

  if (!filename || !docId) return <div> No document selected.</div>;


  const handleUploadClick = () => {
    setShowUploadModal(true);
    setTimeout(() => {
      window.location.href = '/upload';
    }, 200);
  };

  const handleCitationClick=(pageNumber: number)=>{
    setTargetPage(pageNumber);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Mobile Menu Button - Only visible on small screens */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="fixed top-4 left-4 z-50 p-2 glass rounded-lg text-white/80 hover:text-white md:hidden"
        >
          <Menu size={20} />
        </button>
      )}

      {/* Left Sidebar - Chat */}
      <div
        className={`${sidebarCollapsed ? 'hidden' : 'flex'
          } md:flex h-screen flex-col transition-all duration-300 fixed md:relative z-40 md:z-0 left-0 top-0 w-screen sm:w-80 md:w-auto`}
      >
        <ChatSidebar
          docId={docId}
          onUploadClick={handleUploadClick}
          isCollapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onCitationClick={handleCitationClick}
        />
      </div>

      {/* Center - Document Viewer */}
      <div
        className={`flex-1 flex flex-col h-screen oveflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'md:ml-0' : ''
          }`}
      >
        <DocumentViewer
          highlightPage={targetPage?? 1}
          documentName={filename} onClose={() => window.history.back()} />
      </div>

      {/* Right Panel - Info (Hidden on mobile) */}
      <div
        className={`${rightPanelCollapsed ? 'hidden' : 'flex'
          } lg:flex h-screen flex-col transition-all duration-300`}
      >
        <InfoPanel
          currentDocId={docId} 
          onUploadDocument={handleUploadClick}
          />

      </div>

      {/* Mobile Overlay - Click outside to close sidebar */}
      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Upload Modal (Mobile Transition) */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fadeInUp">
          <div className="glass p-8 rounded-xl">
            <p className="text-foreground text-center">Opening upload...</p>
          </div>
        </div>
      )}
    </div>
  );
}
