import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { contextAwareRecognitionService } from '../services/contextAwareRecognitionService';

export type LocationType = 'home' | 'school' | 'playground' | 'other';

interface LocationContextType {
  currentLocation: LocationType;
  setLocation: (location: LocationType) => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

interface LocationProviderProps {
  children: ReactNode;
}

export function LocationProvider({ children }: LocationProviderProps) {
  const [currentLocation, setCurrentLocation] = useState<LocationType>('home');

  useEffect(() => {
    contextAwareRecognitionService.setLocation(currentLocation);
  }, [currentLocation]);

  const setLocation = (location: LocationType) => {
    setCurrentLocation(location);
  };

  return (
    <LocationContext.Provider value={{ currentLocation, setLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation(): LocationContextType {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return ctx;
}
