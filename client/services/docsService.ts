
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

    searchDocument: async (query: string, docId: string, history: any[] = []) => {
        const response = await apiClient.post('/docs/search', {
            query: query,
            docId: docId,
            history: history
        });
        return response.data;
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

