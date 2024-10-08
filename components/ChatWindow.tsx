"use client";

import { useRef, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ToastContainer, toast } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';

import { ChatMessageBubble } from '@/components/ChatMessageBubble';
import { MobileWarningOverlay } from './MobileWarningOverlay';
import type { ChatWindowMessage } from '@/schema/ChatWindowMessage';
import type { FormEvent } from "react";

type ModelProvider = "ollama" | "webllm" | "chrome_ai";

const modelInfo: Record<ModelProvider, { title: string; emoji: string; instructions: JSX.Element }> = {
  ollama: {
    title: "Fully Local Chat Over",
    emoji: "🦙",
    instructions: (
      <li>
        <span>The default LLM is <code>Mistral-7B</code>. Install the <a target="_blank" href="https://ollama.ai">Ollama desktop app</a> and run:</span>
        <pre>$ OLLAMA_ORIGINS=https://webml-demo.vercel.app OLLAMA_HOST=127.0.0.1:11435 ollama serve</pre>
      </li>
    )
  },
  webllm: {
    title: "Fully In-Browser Chat Over",
    emoji: "🌐",
    instructions: (
      <>
        <li><span>Using <code>llama 3.2 1B</code> model with <a href="https://webllm.mlc.ai/">WebLLM</a>. Caches weights in the browser.</span></li>
        <li><span>Weights are large; please ensure a stable internet connection.</span></li>
      </>
    )
  },
  chrome_ai: {
    title: "Chrome-Native Chat Over",
    emoji: "♊",
    instructions: (
      <>
        <li><span>Runs experimental <code>Gemini Nano</code> model. Access required.</span></li>
        <li><span>Note: Gemini Nano is experimental and not chat-tuned.</span></li>
      </>
    )
  }
};

export function ChatWindow({ placeholder = "Type your message..." }: { placeholder?: string }) {
  const searchParams = useSearchParams();
  const presetProvider = searchParams.get("provider");
  const initialProvider = (["ollama", "webllm", "chrome_ai"].includes(presetProvider) ? presetProvider : "ollama") as ModelProvider;

  const [modelProvider, setModelProvider] = useState<ModelProvider>(initialProvider);
  const [messages, setMessages] = useState<ChatWindowMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPDF, setSelectedPDF] = useState<File | null>(null);
  const [readyToChat, setReadyToChat] = useState(false);

  const worker = useRef<Worker | null>(null);
  const initProgressToastId = useRef<Id | null>(null);

  useEffect(() => {
    worker.current = new Worker(new URL('../app/worker.ts', import.meta.url), { type: 'module' });
  }, []);

  const handleModelChange = (provider: ModelProvider) => {
    setModelProvider(provider);
    const params = new URLSearchParams(window.location.search);
    params.set("provider", provider);
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  const queryModel = async (messageList: ChatWindowMessage[]) => {
    if (!worker.current) throw new Error("Worker not initialized.");

    const payload = { messages: messageList, modelProvider, modelConfig: { baseUrl: "http://localhost:11435", temperature: 0.3 } };
    worker.current.postMessage(payload);
    worker.current.onmessage = (event) => {
      const { type, data } = event.data;
      switch (type) {
        case "log":
          console.log(data);
          break;
        case "init_progress":
          if (!initProgressToastId.current) {
            initProgressToastId.current = toast.loading("Loading model weights...", { theme: "dark" });
          } else {
            toast.update(initProgressToastId.current, { progress: data.progress });
          }
          break;
        case "complete":
          setReadyToChat(true);
          setIsLoading(false);
          toast.dismiss(initProgressToastId.current);
          toast.success("Model ready!");
          break;
        case "error":
          console.error(data);
          toast.error(`Error: ${data.message}`);
          break;
        default:
          console.warn("Unknown message type");
      }
    };
  };

  const sendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input || isLoading) return;

    const userMessage = { role: "human", content: input } as ChatWindowMessage;
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      await queryModel(newMessages);
    } catch (error) {
      console.error(error);
      toast.error(`Message send failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const choosePDFComponent = (
    <div className="p-4 rounded-lg bg-black text-white w-[300px] mx-auto">
      <h2 className="text-lg font-semibold text-center">{modelInfo[modelProvider].title}</h2>
      <ul>{modelInfo[modelProvider].instructions}</ul>
      <div className="mt-4 text-center">
        <input type="file" onChange={(e) => setSelectedPDF(e.target.files?.[0] ?? null)} className="mb-4 text-sm" />
        <button onClick={() => embedPDF()} className="py-2 px-4 rounded-md bg-gray-700 text-sm hover:bg-gray-600 transition">Embed PDF</button>
      </div>
    </div>
  );

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4">
      <ToastContainer theme="dark" />
      <MobileWarningOverlay />
      {readyToChat ? (
        <form onSubmit={sendMessage} className="w-full max-w-md">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              className="flex-1 px-4 py-2 rounded-md bg-gray-800 text-white focus:outline-none"
            />
            <button type="submit" disabled={isLoading} className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 transition">
              Send
            </button>
          </div>
          <div className="mt-4 flex flex-col space-y-2">
            {messages.map((msg, index) => <ChatMessageBubble key={index} message={msg} />)}
          </div>
        </form>
      ) : choosePDFComponent}
    </div>
  );
}
