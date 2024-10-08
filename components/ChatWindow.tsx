"use client";

import { Id, ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useRef, useState, useEffect } from "react";
import type { FormEvent } from "react";

import { ChatMessageBubble } from '@/components/ChatMessageBubble';
import { ChatWindowMessage } from '@/schema/ChatWindowMessage';


export function ChatWindow(props: { placeholder?: string; }) {
  const { placeholder } = props;
  const [messages, setMessages] = useState<ChatWindowMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPDF, setSelectedPDF] = useState<File | null>(null);
  const [readyToChat, setReadyToChat] = useState(false);
  const worker = useRef<Worker | null>(null);
  const toastId = useRef<Id | null>(null);


  useEffect(() => {
    worker.current = new Worker(new URL('../app/worker.ts', import.meta.url), { type: 'module' });
    setIsLoading(false);
  }, []);

  const handlePDFUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedPDF) {
      toast("Please select a PDF file.", { theme: "dark" });
      return;
    }

    setIsLoading(true);

    worker.current?.postMessage({ pdf: selectedPDF });
    worker.current?.addEventListener("message", (e: any) => {
      switch (e.data.type) {
        case "init_progress":
          if (!toastId.current) {
            toastId.current = toast("Processing PDF...", { progress: e.data.data.progress, theme: "dark" });
          } else {
            toast.update(toastId.current, { progress: e.data.data.progress });
          }
          break;

        case "error":
          setIsLoading(false);
          toast(`Error: ${e.data.error}`, { theme: "dark" });
          break;

        case "complete":
          setIsLoading(false);
          setReadyToChat(true);
          toast("PDF processed. You can now ask questions.", { theme: "dark" });
          if (toastId.current) toast.dismiss(toastId.current);
          break;
      }
    });

  };

  const handleSendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading || !input) return;

    const newMessage: ChatWindowMessage = { role: "human", content: input };
    setMessages([...messages, newMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const stream = await queryLLM([...messages, newMessage]);
      const reader = stream.getReader();
      const aiMessage: ChatWindowMessage = { role: "ai", content: "" };
      setMessages([...messages, newMessage, aiMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        aiMessage.content += value;
        setMessages([...messages, newMessage, aiMessage]);
      }

    } finally {
      setIsLoading(false);
    }
  };

  const queryLLM = async (messages: ChatWindowMessage[]) => {
    if (!worker.current) throw new Error("Worker not initialized");
    return new ReadableStream({
      start(controller) {
        worker.current?.postMessage({ messages });
        worker.current?.addEventListener("message", (e: any) => {
          if (e.data.type === "chunk") controller.enqueue(e.data.data);
          if (e.data.type === "complete") controller.close();
          if (e.data.type === "error") controller.error(new Error(e.data.error));
        });
      }
    });
  };

  const clearMessages = () => setMessages([]);

  return (
    <div className={`flex flex-col items-center p-4 md:p-8 rounded grow overflow-hidden ${readyToChat ? "border" : ""}`}>

      {!readyToChat && (
        <div className="p-0 md:p-8 rounded w-[44vh] h-full overflow-hidden flex flex-col">
          <h1 className="text-3xl md:text-4xl mb-2 mr-auto flex justify-center max-h-full">
            <span className="mx-2 font-semibold mt-2 text-sm">Privacy-focused Local LLM Chat</span>
          </h1>
          <p className="text-center text-gray-500">Upload a PDF and ask questions. All processing happens locally. No logs are kept.</p>

          <form onSubmit={handlePDFUpload} className="pt-6 items-center w-screen">
            <input id="file_input" type="file" accept="pdf" onChange={(e) => e.target.files && setSelectedPDF(e.target.files[0])} />
            <button type="submit" className="px-2 font-semibold text-sm py-1 bg-sky-600 rounded w-auto">
              {isLoading ? <span className="animate-spin">Loading...</span> : <span>Upload</span>}
            </button>
          </form>
        </div>
      )}

      {readyToChat && (
        <>
          <div className="flex flex-col-reverse w-full mb-4 overflow-auto grow">
            {messages.map((m, i) => (
              <ChatMessageBubble key={i} message={m} aiEmoji={"🌐"} onRemovePressed={() => setMessages(prev => prev.filter((_, j) => j !== i))} />
            ))}
          </div>
          <button onClick={clearMessages} className={(messages.length === 0 ? "hidden " : "") + "shrink-0 rounded mr-auto text-gray-400 border py-1 px-2"}>Clear all messages</button>
          <form onSubmit={handleSendMessage} className="flex w-full flex-col">
            <div className="flex w-full mt-4">
              <input className="grow mr-8 p-4 rounded" value={input} placeholder={placeholder} onChange={(e) => setInput(e.target.value)} />
              <button type="submit" className="shrink-0 px-6 py-4 bg-sky-600 rounded w-28">
                {isLoading ? <span className="animate-spin">Loading...</span> : <span>Send</span>}
              </button>
            </div>
          </form>
        </>
      )}

      <ToastContainer />
    </div>
  );
}
