
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
    docId?: string;
    status?: string;
}

export const docsService = {
    uploadDocument: async (file: File, onProgress: (percent: number) => void) => {
        const formData = new FormData();
        formData.append('pdf', file);
        const response = await apiClient.post<UploadResponse>('/upload', formData, {
            onUploadProgress: (progressEvent) => {
                const total = progressEvent.total;
                if (total) {
                    const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) / total
                    );
                    onProgress(percentCompleted);
                }
            },
        });
        return response.data;
    },

    searchDocument: async (query: string, docId: string) => {
        const response = await apiClient.post<SearchResult[]>('/search', {
            query: query,
            docId: docId
        });
        return response.data;
    },

    getChatHistory: async (docId: string, before?: string) => {

        const params= new URLSearchParams();
        params.append('limit', '50');
        if(before) params.append('before', before);

        const response = await apiClient.get(`/${docId}/chat?${params.toString()}`);
        return response.data;
    },

    getMyDocuments: async()=>{
        const response= await apiClient.get('/list');
        return response.data;
    },

    deleteDocument: async(docId: string)=>{
      const response= await apiClient.delete(`/${docId}`);
      return response.data;
    }
};
