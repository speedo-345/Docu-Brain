'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import ChatSidebar from '@/components/ChatSidebar';
import dynamic from 'next/dynamic';
const DocumentViewer = dynamic(() => import('@/components/DocumentViewer'), { ssr: false });
import InfoPanel from '@/components/InfoPanel';
import { Menu, Loader, CheckCircle, X, AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { docsService } from '@/services/docsService';

import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

// Maps processing stages to user-friendly icons and labels
function getStageDisplay(stage?: string | null): { icon: string; label: string } {
  switch (stage) {
    case 'parsing': return { icon: '📄', label: 'Extracting text from your document...' };
    case 'chunking': return { icon: '🧩', label: 'Splitting into chunks and creating embeddings...' };
    case 'uploading': return { icon: '💾', label: 'Saving vectors to database...' };
    case 'searchable': return { icon: '🔍', label: 'Document is searchable! Building search tree...' };
    case 'tree_building': return { icon: '🌳', label: 'Building search tree (AI summarization)...' };
    case 'clustering': return { icon: '🌳', label: 'Grouping related text into clusters...' };
    case 'summarizing': return { icon: '🤖', label: 'AI is summarizing clusters...' };
    case 'indexing': return { icon: '💾', label: 'Saving tree summaries to database...' };
    case 'complete': return { icon: '✅', label: 'Document is fully indexed and ready!' };
    case 'complete_partial': return { icon: '⚠️', label: 'Basic search ready. Enhanced search partially built.' };
    case 'failed': return { icon: '❌', label: 'Processing failed. Basic search may still work.' };
    default: return { icon: '⏳', label: 'Processing your document...' };
  }
}

function ViewerContent() {

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [viewerClosed, setViewerClosed]=useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<{
    status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
    progress: number;
    filename: string;
    docId?: string;
  }>({ status: 'idle', progress: 0, filename: '' });

  // ── Processing status polling ──
  const [docStatus, setDocStatus] = useState<{ status: string; stage?: { stage: string; message: string } | null }>({ status: 'unknown' });
  const [statusBannerDismissed, setStatusBannerDismissed] = useState(false);

  
  const [targetPage, setTargetPage]= useState<number| null>(null);
  
  const searchParams = useSearchParams();
  
  const filename = searchParams.get('file');
  const docId = searchParams.get('docId');
  const displayName = searchParams.get('name') || filename;
  

  useEffect(()=>{
    setViewerClosed(false);
    // Reset status banner when switching documents
    setStatusBannerDismissed(false);
    setDocStatus({ status: 'unknown' });
  }, [docId]);

  // Listen for reopen-viewer events (e.g. clicking the same doc again after closing)
  useEffect(() => {
    const handler = () => setViewerClosed(false);
    window.addEventListener('reopen-viewer', handler);
    return () => window.removeEventListener('reopen-viewer', handler);
  }, []);

  // ── Poll document processing status ──
  useEffect(() => {
    if (!docId) return;

    let cancelled = false;

    const pollStatus = async () => {
      try {
        const status = await docsService.getDocumentStatus(docId);
        if (!cancelled) {
          setDocStatus(status);

          // Stop polling once processing is done
          if (status.status === 'ready' || status.status === 'failed') {
            // Auto-dismiss the banner after 5 seconds when complete
            if (status.status === 'ready') {
              setTimeout(() => {
                if (!cancelled) setStatusBannerDismissed(true);
              }, 5000);
            }
            return; // Don't schedule another poll
          }
        }
      } catch (error) {
        console.error("Status poll failed:", error);
      }

      // Schedule next poll
      if (!cancelled) {
        setTimeout(pollStatus, 3000);
      }
    };

    // Start polling
    pollStatus();

    return () => { cancelled = true; };
  }, [docId]);


  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadState({ status: 'uploading', progress: 0, filename: file.name });
    
    try {
      const data = await docsService.uploadDocument(file, (percent) => {
        setUploadState(prev => ({ ...prev, progress: percent }));
        if (percent >= 100) {
          setUploadState(prev => ({ ...prev, status: 'processing' }));
        }
      });

      const finalDocName = data.filename ?? file.name;

      setUploadState(prev => ({ ...prev, status: 'success', docId: data.docId, filename: finalDocName }));
      
      // Tell InfoPanel to refresh the library list
      window.dispatchEvent(new Event('refresh-library'));
      
      // Keep success banner for 5 seconds so user can click 'Open Document' if they want
      setTimeout(() => {
        setUploadState({ status: 'idle', progress: 0, filename: '' });
      }, 5000);

    } catch (error) {
      console.error("Background upload error:", error);
      setUploadState(prev => ({ ...prev, status: 'error' }));
      setTimeout(() => {
        setUploadState({ status: 'idle', progress: 0, filename: '' });
      }, 3000);
    }
    
    e.target.value = '';
  };

  const handleCitationClick=(pageNumber: number)=>{
    setTargetPage(pageNumber);
  };

  // Determine what the processing banner should show
  const isProcessing = docStatus.status === 'processing';
  const isFailed = docStatus.status === 'failed';
  const processingStage = isFailed ? 'failed' : (docStatus.stage?.stage || null);
  const stageDisplay = getStageDisplay(processingStage);
  const stageMessage = isFailed 
    ? (docStatus.stage?.message || "AI processing failed. Basic search may still work.") 
    : (docStatus.stage?.message || stageDisplay.label);
  const showBanner = (isProcessing || isFailed) && !statusBannerDismissed;
  // Show a "just completed" banner briefly
  const justCompleted = docStatus.status === 'ready' && !statusBannerDismissed && processingStage === null;

  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (!docId || isRetrying) return;
    setIsRetrying(true);
    try {
      await docsService.retryDocument(docId);
      // Restart polling by resetting the status locally
      setDocStatus({ status: 'processing', stage: { stage: 'parsing', message: 'Restarting processing...' } });
      setStatusBannerDismissed(false);
    } catch (error: any) {
      alert(error.response?.data?.error || "Retry failed");
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      {/* ── Processing Status Banner ── */}
      {showBanner && (
        <div className={`flex-shrink-0 mx-4 mt-2 mb-0 glass p-3 rounded-lg border flex items-center gap-3 animate-fadeInUp z-50 ${isFailed ? 'border-red-500/30' : 'border-blue-500/20'}`}>
          <div className="flex items-center gap-2 flex-1">
            {processingStage === 'failed' ? (
              <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
            ) : processingStage === 'complete' || processingStage === 'complete_partial' ? (
              <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
            ) : (
              <Loader size={16} className="text-blue-400 animate-spin flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium">
                <span className="mr-1.5">{stageDisplay.icon}</span>
                {stageMessage}
              </p>
              {processingStage && processingStage !== 'complete' && processingStage !== 'failed' && (
                <p className="text-xs text-gray-400 mt-0.5">You can already ask questions — enhanced search is building in background</p>
              )}
            </div>
          </div>
          
          {isFailed && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="px-3 py-1 text-xs font-medium bg-red-500/20 text-red-200 hover:bg-red-500/40 rounded transition-colors"
            >
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
          )}

          <button
            onClick={() => setStatusBannerDismissed(true)}
            className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0 ml-2"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Menu Button to restore sidebar */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="fixed top-4 left-4 z-50 p-2 glass rounded-lg text-white/80 hover:text-white"
          >
            <Menu size={20} />
          </button>
        )}

        <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          {/* Left Sidebar - Chat */}
          {!sidebarCollapsed && (
            <>
              <Panel defaultSize={25} minSize={15} maxSize={50} id="chat" order={1} className="flex h-full flex-col z-40 md:z-0 left-0 top-0 md:relative fixed w-screen md:w-auto">
                <ChatSidebar
                  docId={docId as string}
                  isFullScreen={viewerClosed || !docId}
                  onUploadClick={handleUploadClick}
                  isCollapsed={sidebarCollapsed}
                  onCollapsedChange={setSidebarCollapsed}
                  onCitationClick={handleCitationClick}
                />
              </Panel>
              {(!viewerClosed && docId) && (
                <PanelResizeHandle className="w-[3px] bg-white/10 hover:bg-blue-500 transition-colors cursor-col-resize active:bg-blue-600 hidden md:flex" />
              )}
            </>
          )}

          {/* Center - Document Viewer */}
          {(!viewerClosed && docId) && (
            <Panel defaultSize={55} minSize={30} id="viewer" order={2} className="flex-col h-full overflow-hidden flex">
              {filename && (
                <DocumentViewer
                  highlightPage={targetPage?? 1}
                  documentName={filename}
                  displayName={displayName || undefined}
                  onClose={() => setViewerClosed(true)} />
              )}
            </Panel>
          )}

          {/* Right Panel - Info (Hidden on mobile) */}
          {!rightPanelCollapsed && (
            <>
              {(!viewerClosed && docId) && (
                <PanelResizeHandle className="w-[3px] bg-white/10 hover:bg-blue-500 transition-colors cursor-col-resize active:bg-blue-600 hidden lg:flex" />
              )}
              <Panel defaultSize={20} minSize={15} maxSize={35} id="info" order={3} className="hidden lg:flex flex-col h-full">
                <InfoPanel
                  currentDocId={docId ?? undefined} 
                  onUploadDocument={handleUploadClick}
                  />
              </Panel>
            </>
          )}
        </PanelGroup>

        {/* Mobile Overlay - Click outside to close sidebar */}
        {!sidebarCollapsed && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarCollapsed(true)}
          />
        )}

        {/* Upload Modal (Mobile Transition) / Toast */}
        {uploadState.status !== 'idle' && (
          <div className="fixed bottom-6 right-6 z-50 glass-glow p-4 rounded-xl min-w-[300px] border border-white/10 shadow-2xl animate-fadeInUp bg-black/80 backdrop-blur-md">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {uploadState.status === 'uploading' && <Loader size={16} className="text-blue-400 animate-spin" />}
                {uploadState.status === 'processing' && <Loader size={16} className="text-yellow-400 animate-spin" />}
                {uploadState.status === 'success' && <CheckCircle size={16} className="text-green-400" />}
                {uploadState.status === 'error' && <X size={16} className="text-red-400" />}
                <span className="text-sm font-medium text-white truncate max-w-[150px]" title={uploadState.filename}>
                  {uploadState.filename}
                </span>
              </div>
              <span className="text-xs text-white/70">
                {uploadState.status === 'uploading' ? `${Math.round(uploadState.progress)}%` : 
                 uploadState.status === 'processing' ? 'Processing...' :
                 uploadState.status === 'success' ? 'Ready' : 'Failed'}
              </span>
            </div>
            
            {(uploadState.status === 'uploading' || uploadState.status === 'processing') && (
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${uploadState.status === 'processing' ? 'bg-yellow-400 w-full animate-pulse' : 'bg-blue-400'}`}
                  style={{ width: uploadState.status === 'uploading' ? `${uploadState.progress}%` : '100%' }}
                />
              </div>
            )}

            {uploadState.status === 'success' && uploadState.docId && (
              <div className="mt-2 flex justify-end">
                <a 
                  href={`/viewer?docId=${uploadState.docId}&file=${encodeURIComponent(uploadState.filename)}`}
                  className="text-xs bg-blue-500/20 hover:bg-blue-500/40 text-blue-200 px-3 py-1.5 rounded transition-colors"
                >
                  Open Document
                </a>
              </div>
            )}
          </div>
        )}

        {/* Hidden file input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          accept=".pdf,.docx,.txt" 
        />
      </div>
    </div>
  );
}

export default function ViewerPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-background min-h-screen">
        <Loader size={40} className="animate-spin text-blue-500" />
      </div>
    }>
      <ViewerContent />
    </Suspense>
  );
}

