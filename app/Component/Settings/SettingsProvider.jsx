"use client";

import { createContext, useContext, useEffect, useState } from "react";

const SettingsContext = createContext(null);

export function useSettings() {
  return useContext(SettingsContext);
}

export default function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.settings) {
          setSettings(data.settings);
          const root = document.documentElement;
          root.style.setProperty("--primary", data.settings.primaryColor || "#135B9A");
          root.style.setProperty("--secondary", data.settings.secondaryColor || "#F48E2B");
        }
      })
      .catch(() => {});
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}
