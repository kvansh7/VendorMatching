import React from "react";
import { useLLM } from "../context/LLMProviderContext";

function TestLLM() {
  const { provider, setProvider } = useLLM();

  return (
    <div className="text-white bg-slate-900 min-h-screen flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold mb-6">
        🔍 LLM Provider Context Test
      </h1>

      <p className="text-xl mb-4">
        Current LLM Provider: <span className="text-blue-400 font-semibold">{provider}</span>
      </p>

      <div className="flex gap-4">
        <button
          onClick={() => setProvider("openai")}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          Set to OpenAI
        </button>

        <button
          onClick={() => setProvider("gemini")}
          className="px-5 py-2 bg-green-600 hover:bg-green-700 rounded-lg"
        >
          Set to Gemini
        </button>

        <button
          onClick={() => setProvider("ollama")}
          className="px-5 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg"
        >
          Set to Ollama
        </button>
      </div>

      <p className="text-gray-400 mt-8 text-sm">
        Try switching providers — the selection should persist even after refresh 🚀
      </p>
    </div>
  );
}

export default TestLLM;