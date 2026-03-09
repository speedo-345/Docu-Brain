import apiClient from "./apiClient";

export interface LoginData{
    email:string;
    password: string;
}

export interface RegisterData{
    username:string;
    email:string;
    password:string;
}

export interface AuthResponse{
    token:string;
    _id: string;
    username:string;
    email:string;
}

export const authService={
    login: async(data:LoginData)=>{
        const response= await apiClient.post<AuthResponse>('/auth/login', data);
        return response.data;
    },
    register: async(data: RegisterData)=>{
        const response= await apiClient.post<AuthResponse>('/auth/register', data);
        return response.data;
    },
    logout: ()=>{
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href='/login';
    },

    isAuthenticated:()=>{
        return !!localStorage.getItem('token');
    },

    getCurrentUser:()=>{
        const useStr= localStorage.getItem('user');
        if(useStr) return JSON.parse(useStr);
        return null;
    }
};