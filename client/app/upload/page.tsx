'use client';

import { useState } from 'react';
import { Upload, FileText, X, Loader } from 'lucide-react';
import Link from 'next/link';
import { docsService } from '@/services/docsService';
import { useRouter } from 'next/navigation';


export default function UploadPage() {

  const router = useRouter();

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);

    try {
      const data = await docsService.uploadDocument(selectedFile);
      const finalDocName = data.filename ?? selectedFile.name;
      const displayName = data.originalName ?? selectedFile.name;

      if (!data.docId) {
        console.error("Document Id is not found\n");
        setIsUploading(false);
        alert("Upload failed — no document ID returned.");
        return;
      }

      // Go straight to the viewer — vectorization happens in background
      router.push(`/viewer?docId=${data.docId}&file=${encodeURIComponent(finalDocName)}&name=${encodeURIComponent(displayName)}`);

    } catch (error) {
      setIsUploading(false);
      console.error("Upload Error:", error);
      alert("Upload failed. Please try again.");
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setIsUploading(false);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex flex-col items-center justify-center p-4">
      {/* Background */}
      <div className="absolute inset-0 bg-background pointer-events-none" />

      {/* Subtle white ambient orbs */}
      <div
        className="absolute top-32 right-32 w-80 h-80 rounded-full opacity-[0.04] blur-3xl animate-float pointer-events-none"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-32 left-32 w-96 h-96 rounded-full opacity-[0.03] blur-3xl animate-float pointer-events-none"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)', animationDelay: '1.5s' }}
      />

      {/* Header */}
      <div className="relative z-20 w-full max-w-2xl mb-12 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-foreground-secondary hover:text-foreground transition-colors px-4 py-2 rounded-lg hover:glass"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back</span>
        </Link>
        <h1 className="text-2xl font-bold text-white">Upload Document</h1>
        <div className="w-20" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-2xl">
        {!selectedFile ? (
          // Upload Zone
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDrop={handleDrop}
            className={`glass-glow p-12 rounded-xl border-2 transition-all duration-300 cursor-pointer ${dragActive
              ? 'border-white/60 bg-white/[0.06]'
              : 'border-white/10 hover:border-white/25'
              } animate-fadeInUp`}
          >
            <div className="flex flex-col items-center justify-center gap-6">
              {/* Upload Icon */}
              <div className="relative">
                <div className="w-20 h-20 glass rounded-xl flex items-center justify-center">
                  <Upload size={40} className="text-white" />
                </div>
                {dragActive && (
                  <div className="absolute inset-0 w-20 h-20 glass rounded-xl animate-pulse" />
                )}
              </div>

              {/* Text */}
              <div className="text-center">
                <h2 className="text-2xl font-bold text-foreground mb-2">Drop your document here</h2>
                <p className="text-foreground-secondary mb-2">or click to browse from your computer</p>
                <p className="text-xs text-foreground-tertiary">Supported: PDF, DOCX, TXT</p>
              </div>

              {/* File Input */}
              <input
                type="file"
                id="file-input"
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.docx,.txt"
              />
              <label
                htmlFor="file-input"
                className="px-8 py-3 rounded-lg font-semibold bg-white text-black hover:bg-white/90 hover:shadow-lg hover:shadow-white/10 transition-all duration-200 hover:scale-[1.02] cursor-pointer"
              >
                Choose File
              </label>
            </div>
          </div>
        ) : (
          // File Selected
          <div className="space-y-6 animate-fadeInUp">
            {/* File Card */}
            <div className="glass-glow p-6 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <div className="w-14 h-14 glass rounded-xl flex items-center justify-center">
                  <FileText size={28} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{selectedFile.name}</p>
                  <p className="text-sm text-foreground-secondary">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>

              {!isUploading && (
                <button
                  onClick={clearFile}
                  className="p-2 hover:glass rounded-lg text-foreground-secondary hover:text-foreground transition-all"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Action Buttons */}
            {!isUploading ? (
              <div className="flex gap-4">
                <button
                  onClick={handleUpload}
                  className="flex-1 py-3 px-4 rounded-lg font-semibold bg-white text-black hover:bg-white/90 hover:shadow-lg hover:shadow-white/10 transition-all duration-200 hover:scale-[1.02]"
                >
                  Upload &amp; Analyze
                </button>
                <button
                  onClick={clearFile}
                  className="flex-1 py-3 px-4 rounded-lg font-semibold text-foreground glass hover:bg-white/10 transition-all duration-200 hover:scale-[1.02]"
                >
                  Choose Different
                </button>
              </div>
            ) : (
              <div className="glass p-4 rounded-lg border border-white/20 flex items-center gap-3">
                <Loader size={20} className="text-white flex-shrink-0 animate-spin" />
                <div>
                  <p className="text-sm font-semibold text-white">Uploading your document...</p>
                  <p className="text-xs text-foreground-secondary">You'll be redirected to the viewer shortly</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info Cards */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: '📄', title: 'Multi-Format Support', description: 'PDF, Word, Text, and image documents' },
            { icon: '⚡', title: 'Fast Processing', description: 'Quick analysis and extraction' },
            { icon: '🔒', title: 'Secure Upload', description: 'Your documents are kept private' },
          ].map((card, i) => (
            <div
              key={i}
              className="glass-glow p-4 rounded-xl text-center hover:scale-105 transition-transform duration-200 animate-fadeInUp"
              style={{ animationDelay: `${(i + 1) * 100}ms` }}
            >
              <div className="text-3xl mb-3">{card.icon}</div>
              <h3 className="font-semibold text-foreground mb-1">{card.title}</h3>
              <p className="text-xs text-foreground-secondary">{card.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
