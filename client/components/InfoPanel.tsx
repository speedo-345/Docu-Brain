'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Plus, FileText, Trash2, Loader2 } from 'lucide-react';
import { docsService } from '@/services/docsService';

interface InfoPanelProps {
  currentDocId?: string;
  onUploadDocument?: () => void;
}

interface DocItem {
  _id: string;
  filename: string;
  originalName?: string;
  createdAt: string;
}

export default function InfoPanel({
  currentDocId,
  onUploadDocument,
}: InfoPanelProps) {

  const router = useRouter();
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedSections, setExpandedSections] = useState({
    library: true,
    actions: true,
  });

  useEffect(() => {
    loadLibrary();
    const handler = () => loadLibrary();
    window.addEventListener('refresh-library', handler);
    return () => window.removeEventListener('refresh-library', handler);
  }, []);

  const loadLibrary = async () => {
    try {
      setLoading(true);
      const list = await docsService.getMyDocuments();
      setDocuments(list);
    } catch (error) {
      console.error("Failed to load history", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDocClick = (doc: DocItem) => {
    const name = doc.originalName || doc.filename;
    router.push(`/viewer?docId=${doc._id}&file=${encodeURIComponent(doc.filename)}&name=${encodeURIComponent(name)}`);
    // Force page-level state refresh in case docId didn't change (viewer was just closed)
    window.dispatchEvent(new Event('reopen-viewer'));
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this document? Chat history will be lost.")) return;
    
    // Optimistically remove the item from UI to prevent flicker
    setDocuments(prev => prev.filter(doc => doc._id !== id));

    try {
      await docsService.deleteDocument(id);
      
      // Fetch fresh list quietly without turning on global loading spinner
      const list = await docsService.getMyDocuments();
      setDocuments(list);
    } catch (error) {
      alert("Failed to delete");
      // Revert if it fails
      loadLibrary();
    }
  }


  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    /* No border-radius — flush right edge for three-panel seam */
    <div
      className="w-full h-full glass-dark border-l flex flex-col overflow-hidden"
      style={{ borderColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 0 }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 border-b flex-shrink-0"
        style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}
      >
        <h2 className="text-lg font-bold text-white">Library</h2>
        <span className="text-xs text-gray-500 bg-white/10 px-2 py-1 rounded-full">
          {documents.length} Files
        </span>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Upload Button */}
        <button
          onClick={onUploadDocument}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg glass hover:bg-white/10 transition-all duration-200 text-foreground font-semibold"
        >
          <Plus size={18} />
          <span>Upload New</span>
        </button>

        {/* Library Section */}
        <div className="glass rounded-lg overflow-hidden border border-white/10">
          <button
            onClick={() => toggleSection('library')}
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
          >
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <FileText size={16} className="text-blue-400" />
              My Documents
            </h3>
            {expandedSections.library ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.library && (
            <div className="px-2 pb-2 space-y-1 border-t border-white/5">
              {loading ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="animate-spin text-gray-500" />
                </div>
              ) : documents.length === 0 ? (
                <p className="text-xs text-center text-gray-500 p-4">No documents yet.</p>
              ) : (
                documents.map((doc) => (
                  <div
                    key={doc._id}
                    onClick={() => handleDocClick(doc)}
                    className={`group flex items-center justify-between p-2 rounded-md cursor-pointer transition-all ${currentDocId === doc._id
                        ? 'bg-blue-500/20 border border-blue-500/30'
                        : 'hover:bg-white/5 border border-transparent'
                      }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText size={16} className={currentDocId === doc._id ? "text-blue-400" : "text-gray-500"} />
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${currentDocId === doc._id ? 'text-white' : 'text-gray-300'}`}>
                          {doc.originalName || doc.filename}
                        </p>
                        <p className="text-[10px] text-gray-600">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Delete Button (Visible on Hover) */}
                    <button
                      onClick={(e) => handleDelete(e, doc._id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-400 transition-all"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* <--- Added this missing closing div for Scrollable Content */}

      {/* Footer */}
      <div className="border-t p-4 flex-shrink-0" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
        <p className="text-[10px] text-center text-gray-600">
          DocuBrain Storage: {documents.length} / 50 MB
        </p>
      </div>
    </div>
  );
}