import axios from 'axios';

import FormData from 'form-data';// used to bundle up key-value pairs to send to a server
import fs from 'fs';

export const sendFileToAI = async (filePath: string, filename: string) => {
    try {
        const PYTHON_URL = process.env.PYTHON_URI;
        const form = new FormData();

        form.append('file', fs.createReadStream(filePath));

        const response = await axios.post(`${PYTHON_URL}/file-parser`, form, {
            headers: {
                ...form.getHeaders()
            },
            maxContentLength: Infinity,//prevents axios from blocking the big files
            maxBodyLength: Infinity
        });
        return response.data;
    } catch (error) {
        console.error("AI Service Error:", error);
        throw error;
    }
};

export const searchAI = async (queryText: string) => {
    const PYTHON_URL = process.env.PYTHON_URI;
    const response = await axios.post(`${PYTHON_URL}/search`, {
        text: queryText,
        top_k: 3
    });
    return response.data;
};

export const deleteFileFromAI=async(filename:string)=>{
    try{
        const PYTHON_URL = process.env.PYTHON_URI;
        await axios.post(`${PYTHON_URL}/delete`,{
            filename: filename
        })
    }catch(error){
        console.error("AI Delete Error: ", error);

        return false;
    }
}
