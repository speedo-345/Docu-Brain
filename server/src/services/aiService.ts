import axios from 'axios';

import FormData from 'form-data';// used to bundle up key-value pairs to send to a server
import fs from 'fs';

export const sendFileToAI = async (filePath: string, filename: string, userId: string) => {
    try {
        const PYTHON_URL = process.env.PYTHON_URI;
        const form = new FormData();

        form.append('file', fs.createReadStream(filePath));
        // CRITICAL: Pass the exact Multer filename so Python uses this same string
        // for all Pinecone metadata. Without this, FastAPI derives a different
        // filename from the stream path, causing a mismatch when searching later.
        form.append('filename', filename);
        form.append('user_id', userId);

        const response = await axios.post(`${PYTHON_URL}/file-parser`, form, {
            headers: {
                ...form.getHeaders()
            },
            maxContentLength: Infinity,//prevents axios from blocking the big files
            maxBodyLength: Infinity,
            timeout: 600000 // 10 minutes — parsing large PDFs with Docling can be slow
        });
        return response.data;
    } catch (error) {
        console.error("AI Service Error:", error);
        throw error;
    }
};

export const searchAI = async (queryText: string, filename: string, userId: string, history: any[] = []) => {
    const PYTHON_URL = process.env.PYTHON_URI;
    const response = await axios.post(`${PYTHON_URL}/search`, {
        text: queryText,
        filename: filename,
        user_id: userId,
        history: history,
        top_k: 7
    }, {
        timeout: 240000 // 4 minutes — Ollama may need to cold-load the model
    });
    return response.data;
};

export const getProcessingStatus = async (filename: string) => {
    const PYTHON_URL = process.env.PYTHON_URI;
    const response = await axios.get(`${PYTHON_URL}/status/${encodeURIComponent(filename)}`, {
        timeout: 5000
    });
    return response.data;
};

export const deleteFileFromAI=async(filename:string)=>{
    try{
        const PYTHON_URL = process.env.PYTHON_URI;
        await axios.post(`${PYTHON_URL}/delete`,{
            filename: filename
        })
        return true;
    }catch(error){
        console.error("AI Delete Error: ", error);

        return false;
    }
}
