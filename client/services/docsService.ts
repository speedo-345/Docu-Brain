
import apiClient from './apiClient'

export interface SearchResult {
    text: string;
    score: number;
    filename: string;
    chunk_id?: string;
}

export interface UploadResponse {
    message: string;
    filename?: string;  // the server-saved filename on disk
    originalName?: string;  // the user-friendly original filename
    docId?: string;
    status?: string;
}

export const docsService = {
    uploadDocument: async (file: File, onProgress?: (percent: number) => void) => {
        const formData = new FormData();
        formData.append('pdf', file);
        const response = await apiClient.post('/docs/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            onUploadProgress: (progressEvent) => {
                if (onProgress) {
                    const total = progressEvent.total;
                    if (total) {
                        const percentCompleted = Math.round(
                            (progressEvent.loaded * 100) / total
                        );
                        onProgress(percentCompleted);
                    }
                }
            },
        });
        return response.data as UploadResponse;
    },

    searchDocument: async (query: string, docId: string, history: any[] = [], onChunk?: (text: string) => void, onSources?: (sources: any[]) => void, onChart?: (chartData: any) => void, onDebate?: (type: string, data: string) => void) => {
        const token = localStorage.getItem('token');
        const response = await fetch("http://localhost:5000/api/docs/search", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ query, docId, history })
        });

        if (!response.ok) throw new Error('Search request failed');
        if (!response.body) throw new Error('ReadableStream not supported');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let done = false;
        let fullAnswer = "";
        let finalSources: any[] = [];

        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
                const chunkStr = decoder.decode(value, { stream: !done });
                const lines = chunkStr.split('\n\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const parsed = JSON.parse(line.slice(6));
                            if (parsed.type === 'token') {
                                fullAnswer += parsed.data;
                                if (onChunk) onChunk(parsed.data);
                            } else if (parsed.type === 'results') {
                                finalSources = parsed.data;
                                if (onSources) onSources(parsed.data);
                            } else if (parsed.type === 'chart') {
                                if (onChart) onChart(parsed.data);
                            } else if (parsed.type === 'debate_advocate' || parsed.type === 'debate_critic' || parsed.type === 'debate_verdict' || parsed.type === 'debate_status') {
                                if (onDebate) onDebate(parsed.type, parsed.data);
                            }
                        } catch(e) {}
                    }
                }
            }
        }
        
        return { answer: fullAnswer, sources: finalSources };
    },

    getChatHistory: async (docId: string, before?: string) => {

        const params= new URLSearchParams();
        params.append('limit', '50');
        if(before) params.append('before', before);

        const response = await apiClient.get(`/docs/${docId}/chat?${params.toString()}`);
        return response.data;
    },

    getMyDocuments: async()=>{
        const response= await apiClient.get('/docs/list');
        return response.data;
    },

    getDocumentStatus: async (docId: string) => {
        const response = await apiClient.get(`/docs/${docId}/status`);
        return response.data;
    },

    retryDocument: async (docId: string) => {
        const response = await apiClient.post(`/docs/${docId}/retry`);
        return response.data;
    },

    deleteDocument: async(docId: string)=>{
      const response= await apiClient.delete(`/docs/${docId}`);
      return response.data;
    }
};

