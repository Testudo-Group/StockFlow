import axios from 'axios';

// const API_URL = import.meta.env.VITE_API_URL || 'https://stockflow-1-w6ji.onrender.com/api';
const API_URL = 'http://localhost:5000/api';
// const API_URL = 'https://stockflow-1-w6ji.onrender.com/api';

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('token');
            localStorage.removeItem('user');

            // Only redirect if NOT already on login page or if request wasn't a login attempt
            // This prevents the login form from refreshing on failed credentials
            if (!window.location.pathname.includes('/login') && !error.config.url.includes('/auth/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
