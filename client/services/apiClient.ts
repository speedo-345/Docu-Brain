import axios from 'axios';


const apiClient = axios.create({
    baseURL: "http://localhost:5000/api/docs",
    timeout: 300000, // 5 minutes — AI processing (parsing, embedding) can be slow
    headers:{
        'Content-Type':'application/json',
    },
});

apiClient.interceptors.request.use(
    (config)=>{

        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('token');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    },
    (error)=>{
        return Promise.reject(error);
    }
);

export default apiClient;