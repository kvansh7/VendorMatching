import React, { createContext, useContext, useState, useEffect } from "react";

// Create Context
const LLMContext = createContext();

// Provider Component
export const LLMProvider = ({ children }) => {
  const [provider, setProvider] = useState(() => {
    return localStorage.getItem("llm_provider") || "openai";
  });

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem("llm_provider", provider);
    console.log("LLM provider updated:", provider);
  }, [provider]);

  return (
    <LLMContext.Provider value={{ provider, setProvider }}>
      {children}
    </LLMContext.Provider>
  );
};

// Hook for easy use
export const useLLM = () => useContext(LLMContext);