import { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api, { setApiCountryId } from '../utils/api';
import { useAuth } from './AuthContext';

const CountryContext = createContext(null);

const STORAGE_KEY = 'activeCountry';

export const CountryProvider = ({ children }) => {
    const { isAuthenticated, user } = useAuth();
    const [availableCountries, setAvailableCountries] = useState([]);
    const [activeCountry, setActiveCountryState] = useState(null);
    const [loadingCountries, setLoadingCountries] = useState(true);

    const setActiveCountry = useCallback((country) => {
        setActiveCountryState(country);
        // Keep the api layer in sync — it stamps countryId onto every request.
        setApiCountryId(country?._id || null);
        if (country) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(country));
        }
    }, []);

    useEffect(() => {
        // Only fetch when the user is actually logged in
        if (!isAuthenticated) {
            setAvailableCountries([]);
            setActiveCountryState(null);
            setApiCountryId(null);
            setLoadingCountries(false);
            return;
        }

        const fetchCountries = async () => {
            setLoadingCountries(true);
            try {
                const response = await api.get('/countries');
                const countries = response.data.data || [];
                setAvailableCountries(countries);

                if (countries.length === 0) {
                    setActiveCountryState(null);
                    setApiCountryId(null);
                    return;
                }

                // The server already filters to only the countries this user may access.
                // So we must only allow a stored country if it's in the server's list.
                let stored = null;
                try {
                    const raw = localStorage.getItem(STORAGE_KEY);
                    stored = raw ? JSON.parse(raw) : null;
                } catch {
                    stored = null;
                }

                const allowedStored = stored && countries.find((c) => c._id === stored._id);

                if (allowedStored) {
                    // Refresh with latest server data (name/isoCode may have changed)
                    setActiveCountry(allowedStored);
                } else {
                    // Use default (Nigeria) or first in the allowed list
                    const defaultCountry = countries.find((c) => c.isDefault) || countries[0];
                    setActiveCountry(defaultCountry);
                }
            } catch (err) {
                console.error('Failed to fetch countries:', err);
                setLoadingCountries(false);
            } finally {
                setLoadingCountries(false);
            }
        };

        fetchCountries();
    // Re-run whenever the authenticated user changes (login/logout/user switch)
    }, [isAuthenticated, user?._id]);

    return (
        <CountryContext.Provider
            value={{
                activeCountry,
                setActiveCountry,
                availableCountries,
                loadingCountries,
            }}
        >
            {children}
        </CountryContext.Provider>
    );
};

export const useCountry = () => {
    const context = useContext(CountryContext);
    if (!context) {
        throw new Error('useCountry must be used within CountryProvider');
    }
    return context;
};
