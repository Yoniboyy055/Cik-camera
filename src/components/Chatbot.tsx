import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Image as ImageIcon, Loader2, BrainCircuit } from 'lucide-react';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import ReactMarkdown from 'react-markdown';

function getAIClient() {
  const key = (import.meta as any).env.VITE_GEMINI_API_KEY || (import.meta as any).env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  imageUrl?: string;
  isThinking?: boolean;
}

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'model', text: 'Hello! I am the CIK Assistant. How can I help you today? You can ask me questions or upload a proof photo for analysis.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [useThinking, setUseThinking] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !imageFile) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      imageUrl: imagePreview || undefined,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    
    // Keep a reference to the image data before clearing state
    const currentImagePreview = imagePreview;
    
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      const ai = getAIClient();
      if (!ai) {
        throw new Error('Missing VITE_GEMINI_API_KEY');
      }

      const parts: any[] = [];
      
      if (currentImagePreview) {
        const base64Data = currentImagePreview.split(',')[1];
        const mimeType = currentImagePreview.split(';')[0].split(':')[1];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          }
        });
      }
      
      if (userMsg.text) {
        parts.push({ text: userMsg.text });
      } else if (currentImagePreview) {
        parts.push({ text: "Please analyze this image." });
      }

      const config: any = {};
      if (useThinking) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: { parts },
        config,
      });

      const modelMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || 'Sorry, I could not generate a response.',
      };

      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error('Error calling Gemini:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: 'Assistant is unavailable. Set VITE_GEMINI_API_KEY to enable AI responses.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 w-14 h-14 bg-brand-primary text-white rounded-full shadow-lg shadow-brand-primary/20 flex items-center justify-center hover:bg-brand-primary/90 transition-transform hover:scale-105 z-50 border border-brand-primary/50 ${isOpen ? 'hidden' : 'flex'}`}
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[380px] h-[600px] max-h-[80vh] bg-brand-surface rounded-2xl shadow-2xl flex flex-col z-50 border border-brand-border overflow-hidden flex-shrink-0">
          {/* Header */}
          <div className="bg-brand-bg border-b border-brand-border text-brand-text px-4 py-3 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-primary/10 rounded-full flex items-center justify-center border border-brand-primary/20">
                <BrainCircuit className="w-4 h-4 text-brand-primary" />
              </div>
              <div>
                <h3 className="font-bold text-sm">CIK Assistant</h3>
                <p className="text-[10px] text-brand-text-muted">Powered by Gemini 3.1 Pro</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-brand-text-muted hover:text-brand-text p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-brand-bg">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-brand-primary text-white rounded-br-sm border border-brand-primary/50' : 'bg-brand-surface border border-brand-border text-brand-text rounded-bl-sm shadow-sm'}`}>
                  {msg.imageUrl && (
                    <img src={msg.imageUrl} alt="Uploaded" className="w-full rounded-lg mb-2 object-cover max-h-48 border border-brand-border" />
                  )}
                  <div className="markdown-body prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-brand-bg prose-pre:text-brand-text prose-pre:border prose-pre:border-brand-border prose-a:text-brand-primary">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-brand-surface border border-brand-border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-brand-primary animate-spin" />
                  <span className="text-sm text-brand-text-muted">{useThinking ? 'Thinking deeply...' : 'Generating...'}</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-brand-surface border-t border-brand-border shrink-0">
            {imagePreview && (
              <div className="mb-3 relative inline-block">
                <img src={imagePreview} alt="Preview" className="h-16 rounded-lg border border-brand-border object-cover" />
                <button 
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 bg-brand-danger text-white rounded-full p-0.5 hover:bg-brand-danger/80"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <label className="flex items-center gap-1.5 text-xs text-brand-text-muted cursor-pointer hover:text-brand-text">
                  <input 
                    type="checkbox" 
                    checked={useThinking} 
                    onChange={(e) => setUseThinking(e.target.checked)}
                    className="rounded text-brand-primary focus:ring-brand-primary bg-brand-bg border-brand-border"
                  />
                  Deep Thinking Mode
                </label>
              </div>
              
              <div className="flex items-end gap-2">
                <div className="flex-1 bg-brand-bg rounded-xl border border-brand-border flex items-center px-2 focus-within:ring-1 focus-within:ring-brand-primary transition-all">
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                  />
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-brand-text-muted hover:text-brand-primary transition-colors shrink-0"
                    title="Upload Image"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask a question..."
                    className="flex-1 bg-transparent border-none py-3 px-2 text-sm focus:outline-none text-brand-text placeholder:text-brand-text-muted"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={loading || (!input.trim() && !imageFile)}
                  className="bg-brand-primary text-white p-3 rounded-xl hover:bg-brand-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 border border-brand-primary/50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
