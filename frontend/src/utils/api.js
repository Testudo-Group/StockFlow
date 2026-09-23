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

// ── Active country ──────────────────────────────────────────────────────────
// Most API routes are country-scoped and the server rejects any request that
// arrives without a countryId. Rather than have every call site remember to
// append it, the request interceptor below attaches it automatically.

const COUNTRY_STORAGE_KEY = 'activeCountry';

let activeCountryId = null;

/** Called by CountryContext whenever the active country changes. */
export const setApiCountryId = (id) => {
    activeCountryId = id || null;
};

/**
 * The country to scope requests to. Falls back to the value CountryContext
 * persisted, so requests fired before the context mounts still carry one.
 */
export const getApiCountryId = () => {
    if (activeCountryId) return activeCountryId;
    try {
        const raw = localStorage.getItem(COUNTRY_STORAGE_KEY);
        return raw ? JSON.parse(raw)?._id || null : null;
    } catch {
        return null;
    }
};

// Request interceptor to add token and the active country
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Attach countryId unless the caller already set one explicitly.
        const countryId = getApiCountryId();
        const alreadySet =
            (config.url || '').includes('countryId=') ||
            (config.params && config.params.countryId);

        if (countryId && !alreadySet) {
            config.params = { ...(config.params || {}), countryId };
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
