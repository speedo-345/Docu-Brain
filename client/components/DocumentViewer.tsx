'use client';

import { X, Download, FileText, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

//1.COnfigyure the WOrker(Required for react-pdf to work)
//We use the version matching the installed packages
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

//import default styles for text selection overlay
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css'
import { Input } from './ui/input';

interface DocumentViewerProps {
  documentName?: string;
  onClose?: () => void;
  highlightPage?: number,
}

export default function DocumentViewer({ documentName, onClose, highlightPage }: DocumentViewerProps) {


  const containerRef = useRef<HTMLDivElement>(null);

  if (!documentName) return null;
  const extension = documentName.split('.').pop()?.toLowerCase() || '';
  if (extension !== 'pdf') return null;

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [documentName]);

  useEffect(()=>{
    if (highlightPage) {
      const pageElement=document.getElementById(`page_${highlightPage}`);
      if (pageElement) {
        pageElement.scrollIntoView({behavior:'smooth', block:'start'});
        pageElement.classList.add('ring-4', 'ring-blue-500');
        setTimeout(()=>pageElement.classList.remove('ring-4', 'ring-blue-500'), 2000);
      }
    }
  }, [highlightPage]);


  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [inputPage, setInputPage] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number | null>(null);

  useEffect(() => {

    if (loading || !numPages || !containerRef.current) return;
    //continaerRef is a way to directly access a DOM element without triggering a re-render. Heree it is attached to main content wrapper to knwo which element is doing the scrolling
    //without the intersectionobsever wont know which window to monitor


    const observer = new IntersectionObserver(//IntersectionObserver is the intelligence of viewer. sdetects when a specific page leave or enter the visibe area of the screen
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageId = entry.target.id;
            const pageNum = parseInt(pageId.split('_')[1]);
            setCurrentPage(pageNum);
            // setInputPage(pageNum);
          }
        })
      },
      {
        root: containerRef.current,
        threshold: 0.5,
      }
    );
    const timer = setTimeout(() => {
      const pages = document.querySelectorAll('[id^="page_"]');//'[id^="page_"] this is css way of searching all the ids starting with page_
      pages.forEach((page) => observer.observe(page));
    }, 500);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };

  }, [numPages, loading]);




  const fileUrl = `http://localhost:5000/uploads/${documentName}`;

  const handlePageJump = (pageNumber: number) => {

    let pageElement = document.getElementById(`page_${pageNumber}`);

    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      console.warn(`Page ${pageNumber} not found`);
    }


  };

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);

    if (containerRef.current) {
      setTimeout(() => {
        containerRef.current!.scrollTop = 0;
      }, 100);
    }
  }

  function onDocumentLoadError(err: Error) {
    console.error("PDF Load Error: ", err);
    setError("Failed to Load Error: ");
    setLoading(false);
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0f0f0f] h-full border-l border-white/10">

      {/* --- Header --- */}
      <div className="glass-dark border-b px-6 py-4 flex items-center justify-between z-20 border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-white/5 rounded-lg border border-white/10">
            <FileText size={18} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white truncate max-w-xs">{documentName}</h2>
            <p className="text-xs text-gray-400 uppercase tracking-widest">{extension} Document</p>
          </div>
        </div>

        <div className="flex items-center gap-3">

          <div className="flex items-center gap-2 bg-white/5 rounded-md px-2 py-1 border border-white/10">
            <span className="text-xs text-gray-400">{currentPage}</span>
            <input
              value={inputPage ?? ''}
              type="number"
              min="1"
              max={numPages || 1}
              className="w-12 bg-transparent text-white text-center text-sm focus:outline-none appearance-none"
              onChange={(e) => {
                // Allow user to clear input to type
                const val = e.target.value;
                // Handle empty deletion
                if (val === '') {
                  setInputPage(null);
                } else {
                  setInputPage(parseInt(val));
                }

              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // Only jump if it's a valid number
                  if (typeof inputPage === 'number') {
                    handlePageJump(inputPage);
                  }
                }
              }}
            />
            <span className="text-xs text-gray-500">/ {numPages || '--'}</span>
          </div>


          <a href={fileUrl} download className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all">
            <Download size={18} />
          </a>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-400 transition-all">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* --- Main Content Wrapper (Critical for Layout) --- */}
      <div className="flex-1 relative w-full overflow-y-auto min-h-0 bg-[#141414] flex flex-col items-center justify-start py-6"
        ref={containerRef}>

        {/* Loading Spinner */}
        {loading && !error && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0f0f0f]">
            <Loader2 className="animate-spin text-blue-500 mb-2" size={40} />
            <p className="text-gray-400 text-sm">Loading Document...</p>
          </div>
        )}

        {/* Error Message */}
        {error ? (
          <div className="text-center text-red-400">
            <p>{error}</p>
            <a href={fileUrl} className="mt-4 inline-block px-4 py-2 bg-white/10 rounded hover:bg-white/20 text-white text-sm">
              Download File
            </a>
          </div>
        ) : (
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={null}
            className='flex flex-col gap-4'
          >
            {/*To render all the pages we will be creating a array of pages and map it */}
            {numPages && Array.from(new Array(numPages), (el, index) => (
              <div key={`page_${index + 1}`} id={`page_${index + 1}`} className="shadow-lg relative">
                <Page
                  pageNumber={index + 1}


                  renderTextLayer={true} // Allows selecting text
                  renderAnnotationLayer={true} // Links
                  scale={1.2} // Zoom level (Fixed for now)
                  className="bg-white"
                />

                {/* Page Number Indicator */}
                <div className="absolute -right-12 top-0 text-xs text-gray-400">
                  {index + 1}
                </div>
              </div>
            ))}

          </Document>

        )}
      </div>

      {/* --- Footer Controls --- */}
      <div className="glass-dark border-t border-white/10 px-6 py-3 flex items-center justify-center shrink-0">
        <span className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">
          {extension} Rendering • DocuBrain Engine
        </span>
      </div>
    </div>
  );
}