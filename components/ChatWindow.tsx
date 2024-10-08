"use client";

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useRef, useState, useEffect } from "react";
import type { FormEvent } from "react";

import { ChatMessageBubble } from '@/components/ChatMessageBubble';
import { ChatWindowMessage } from '@/schema/ChatWindowMessage';

const titleText = "Privacy-Oriented, Locally Offline Llama 3.2 Model";

export function ChatWindow(props: { placeholder?: string }) {
  const { placeholder } = props;
  const [messages, setMessages] = useState<ChatWindowMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPDF, setSelectedPDF] = useState<File | null>(null);
  const [readyToChat, setReadyToChat] = useState(false);
  const initProgressToastId = useRef(null);
  
  const worker = useRef<Worker | null>(null);

  async function queryModel(messages: ChatWindowMessage[]) {
    if (!worker.current) {
      throw new Error("Worker is not ready.");
    }
    return new ReadableStream({
      start(controller) {
        const payload = {
          messages,
          modelConfig: {
            model: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
            chatOptions: { temperature: 0.1 },
          }
        };
        worker.current?.postMessage(payload);

        const onMessageReceived = async (e: any) => {
          switch (e.data.type) {
            case "init_progress":
              if (initProgressToastId.current === null) {
                initProgressToastId.current = toast("Loading model weights... This may take a while", { progress: e.data.data.progress || 0.01, theme: "dark" });
              } else {
                toast.update(initProgressToastId.current, { progress: e.data.data.progress || 0.01 });
              }
              break;
            case "chunk":
              controller.enqueue(e.data.data);
              break;
            case "error":
              worker.current?.removeEventListener("message", onMessageReceived);
              controller.error(new Error(e.data.error));
              break;
            case "complete":
              worker.current?.removeEventListener("message", onMessageReceived);
              controller.close();
              break;
          }
        };
        worker.current?.addEventListener("message", onMessageReceived);
      },
    });
  }

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isLoading || !input) return;
    
    const newMessages = [...messages, { role: "human", content: input }];
    setMessages(newMessages);
    setIsLoading(true);
    setInput("");

    try {
      const stream = await queryModel(newMessages);
      const reader = stream.getReader();
      let chunk = await reader.read();
      const aiResponseMessage = { content: "", role: "ai" };
      setMessages([...newMessages, aiResponseMessage]);

      while (!chunk.done) {
        aiResponseMessage.content += chunk.value;
        setMessages([...newMessages, aiResponseMessage]);
        chunk = await reader.read();
      }
      setIsLoading(false);
    } catch (e: any) {
      toast(`Error querying your PDF: ${e.message}`, { theme: "dark" });
      setIsLoading(false);
      setInput(input);
    }
  }

  async function embedPDF(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedPDF) {
      toast("Select a file to embed.", { theme: "dark" });
      return;
    }
    setIsLoading(true);
    worker.current?.postMessage({ pdf: selectedPDF });

    const onMessageReceived = (e: any) => {
      switch (e.data.type) {
        case "error":
          worker.current?.removeEventListener("message", onMessageReceived);
          toast(`Error embedding PDF: ${e.data.error}`, { theme: "dark" });
          setIsLoading(false);
          break;
        case "complete":
          worker.current?.removeEventListener("message", onMessageReceived);
          setReadyToChat(true);
          toast("Embedding successful! Ask questions about your PDF now.", { theme: "dark" });
          setIsLoading(false);
          break;
      }
    };
    worker.current?.addEventListener("message", onMessageReceived);
  }

  useEffect(() => {
    if (!worker.current) {
      worker.current = new Worker(new URL('../app/worker.ts', import.meta.url), { type: 'module' });
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="p-6 md:p-12 bg-black text-gray-300 rounded-md max-w-3xl mx-auto shadow-lg flex flex-col space-y-4">
      <h1 className="text-center text-4xl font-semibold text-white mb-6">{titleText}</h1>
      <form onSubmit={embedPDF} className="flex flex-col items-center space-y-3">
        <input type="file" accept="application/pdf" onChange={(e) => setSelectedPDF(e.target.files ? e.target.files[0] : null)} className="text-white" />
        <button type="submit" className="py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500">Upload PDF</button>
      </form>
      <form onSubmit={sendMessage} className="flex flex-col items-center space-y-3 mt-4">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} className="w-full p-4 bg-gray-800 text-white rounded-lg" rows={5}></textarea>
        <button type="submit" disabled={isLoading} className={`py-2 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-500 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>Send</button>
      </form>
      <ToastContainer position="bottom-right" theme="dark" />
    </div>
  );
}
