'use client';

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { Send, Sparkles, ExternalLink, Star, Briefcase, TrendingUp } from 'lucide-react';
import YC from "@/lib/YC.json";

// --- TYPES ---

interface YCData {
  logo: string;
  company: string;
  repo: string;
  rating_count: number;
  projects_count: number;
  website: string;
}

interface Agency {
  agency_name: string;
  domain: string;
  services?: string[];
  rating_count: number;
  projects_count: number;
  imgUrl?: string;
  popularity?: "legendary" | "famous" | "popular" | "rising";
  html_url: string;
  description?: string;
  repoLink?: string;
  websiteUrl?: string;
  matchScore?: number;
}

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  agencies?: Agency[];
  timestamp: Date;
}

// --- LOGIC ---

const DOMAIN_SERVICES_MAP: { [key: string]: string[] } = {
  'Web Development': ['Frontend Engineering', 'E-commerce Solutions', 'CMS Integration', 'API Development'],
  'AI/Machine Learning': ['LLM Integration', 'Predictive Modeling', 'Computer Vision', 'Data Science'],
  'Data & Analytics': ['BI Dashboarding', 'Data Warehousing', 'ETL Pipelines', 'PostgreSQL Optimization'],
  'DevOps & Cloud': ['Cloud Migration (AWS/Azure)', 'Kubernetes Management', 'CI/CD Automation', 'Infrastructure as Code'],
  'Mobile App Development': ['iOS/Android Native', 'Cross-Platform Dev', 'App Store Optimization', 'QA & Testing'],
  'Marketing & SEO': ['SEO Optimization', 'Content Strategy', 'Performance Marketing', 'Conversion Rate Optimization'],
  'UI/UX Design': ['Figma Prototyping', 'User Research', 'Design System Dev', 'Interaction Design'],
  'Other': ['General Consulting', 'Security Audits', 'Compliance'],
};

const mapLanguageToDomain = (language: string | null): string => {
  if (!language) return 'Unknown';
  const lang = language.toLowerCase();
  if (['typescript', 'javascript', 'html', 'css', 'php', 'ruby'].includes(lang)) return 'Web Development';
  if (['python', 'r'].includes(lang)) return 'AI/Machine Learning';
  if (['java', 'scala', 'c++', 'go', 'c#'].includes(lang)) return 'DevOps & Cloud';
  return 'Data & Analytics';
}

const getRandomServices = (domain: string): string[] => {
  const services = DOMAIN_SERVICES_MAP[domain] || DOMAIN_SERVICES_MAP.Other;
  return services.slice(0, 3);
}

const getPopularity = (ratings: number): "legendary" | "famous" | "popular" | "rising" => {
  if (ratings >= 4.8) return 'legendary';
  if (ratings >= 4.5) return 'famous';
  if (ratings >= 4.0) return 'popular';
  return 'rising';
};

const formatNumber = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : n.toString();


export default function AIAgencyMatcher() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    const fetchAgencyData = async () => {
      setIsInitializing(true);
      // 🟢 Fix: Use proper interface instead of any
      const agencyData = YC as unknown as YCData[];
      try {
        const fetched = await Promise.all(
          agencyData.map(async (agency) => {
            const res = await fetch(`/api/githubOverview?repo=${agency.repo}`);
            const raw = res.ok ? await res.json() : {};
            const industryDomain = mapLanguageToDomain(raw.language);
            const finalRating = agency.rating_count ?? 4.0;
            const finalProjects = agency.projects_count ?? (raw.forks_count || 0);
            return {
              agency_name: agency.company,
              domain: industryDomain,
              services: getRandomServices(industryDomain),
              rating_count: finalRating,
              projects_count: finalProjects,
              imgUrl: agency.logo,
              repoLink: agency.repo,
              websiteUrl: agency.website,
              description: raw.description || "Specialized engineering and design solutions.",
              popularity: getPopularity(finalRating),
              html_url: raw.html_url || `https://github.com/${agency.repo}`,
            } as Agency;
          })
        );
        setAgencies(fetched.filter(Boolean));
      } catch (err) { console.error(err); } finally { setIsInitializing(false); }
    };
    fetchAgencyData();
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    const userMessage: Message = { id: Date.now().toString(), type: 'user', content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      const res = await fetch('http://127.0.0.1:8000/recommendations/semantic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: userMessage.content, top_k: 3 }),
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch AI recommendations');
      }
      
      const data = await res.json();
      
      let matchedAgencies: Agency[] = [];
      if (data.success && data.data && data.data.all_matches) {
        matchedAgencies = data.data.all_matches.map((item: { name?: string; domain?: string; skills?: string[]; similarity_score: number; team_size?: number; views?: number; website?: string; description?: string; }) => {
          // Map similarity score loosely to a 5-star rating for UI purposes
          // Assuming similarity_score is typically between 0.3 and 1.0
          const minScore = 0.3;
          const normalizedScore = Math.max(0, (item.similarity_score - minScore) / (1 - minScore));
          const rating = 3.5 + normalizedScore * 1.5; // Scale to 3.5 - 5.0
          
          return {
            agency_name: item.name || 'Unknown Agency',
            domain: item.domain || 'Tech',
            services: (item.skills && item.skills.length > 0) ? item.skills.slice(0, 3) : ['Specialized Consulting'],
            rating_count: Math.min(5, Math.max(1, rating)),
            projects_count: item.team_size || item.views || Math.floor(Math.random() * 500) + 50,
            popularity: getPopularity(rating),
            html_url: item.website || '#',
            description: item.description || 'Innovative tech solutions.',
            repoLink: '',
            websiteUrl: item.website || '',
            matchScore: item.similarity_score * 100
          };
        });
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: matchedAgencies.length > 0 ? `I've found ${matchedAgencies.length} highly suitable agencies for you using AI semantic matching:` : "I couldn't find any agencies matching those specific requirements.",
        agencies: matchedAgencies,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Error fetching from backend:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: "Oops! There was an issue connecting to the Ytheys AI matching engine. Is the backend server running?",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  return (
    <div className="relative w-full h-screen flex flex-col bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-yellow-500/5 rounded-full blur-3xl animate-pulse" />
      </div>
      <div className="relative border-b border-neutral-800/50 bg-black/40 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="inline-flex font-mono text-white text-[1.9rem] sm:text-[2.5rem] font-medium tracking-tight">Ytheys</Link>
          {!isInitializing && <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-neutral-800/30 border border-neutral-700/30 rounded-lg"><TrendingUp className="w-4 h-4 text-green-400" /><span className="text-sm text-neutral-300">{agencies.length} agencies loaded</span></div>}
        </div>
      </div>
      <div className="relative flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {isInitializing ? (<div className="flex flex-col items-center justify-center h-[60vh] gap-6"><div className="w-16 h-16 border-4 border-transparent border-t-yellow-400 rounded-full animate-spin" /><p className="text-neutral-300">Initializing AI matcher...</p></div>) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-8 text-center">
              <h2 className="text-3xl font-bold text-white">What are you building today?</h2>
              <p className="text-neutral-400 text-lg">Describe your project, and our AI will match you with the perfect agencies.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-3xl mt-4">
                {[{ text: "I need a mobile app", icon: "📱" }, { text: "Looking for AI help", icon: "🤖" }].map((suggestion, i) => (
                  <button key={i} onClick={() => setInput(suggestion.text)} className="px-5 py-4 bg-neutral-900/30 border border-neutral-800/50 rounded-xl text-left text-neutral-300 hover:text-white transition-all">{suggestion.icon} {suggestion.text}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {messages.map((message) => (
                <div key={message.id} className={`flex gap-4 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.type === 'assistant' && <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-yellow-400 to-pink-500 flex items-center justify-center shadow-lg"><Sparkles className="w-5 h-5 text-white" /></div>}
                  <div className={`flex flex-col gap-4 max-w-3xl ${message.type === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`px-5 py-3 rounded-2xl ${message.type === 'user' ? 'bg-blue-600 text-white' : 'bg-neutral-900/60 border border-neutral-800/50 text-neutral-200'}`}>{message.content}</div>
                    {message.agencies?.map((agency, _idx) => (
                      <div key={_idx} className="relative bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-6 w-full backdrop-blur-sm">
                        <div className="flex items-start gap-5">
                          {agency.imgUrl && <Image src={agency.imgUrl} alt={agency.agency_name} width={64} height={64} className="rounded-xl border border-neutral-800/50" unoptimized />}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-xl font-bold text-white mb-2">{agency.agency_name}</h3>
                            <p className="text-sm text-neutral-400 mb-4">{agency.description}</p>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-5 text-sm text-neutral-400">
                                <div className="flex items-center gap-2"><Star className="w-4 h-4 text-yellow-400" />{agency.rating_count.toFixed(1)}</div>
                                <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-blue-400" />{formatNumber(agency.projects_count)}</div>
                              </div>
                              <Link href={agency.websiteUrl || `https://github.com/${agency.repoLink}`} target="_blank" className="flex items-center gap-2 px-5 py-2.5 bg-yellow-500/10 text-yellow-400 rounded-xl text-sm font-semibold border border-yellow-400/30 transition-all hover:scale-105">View Agency <ExternalLink className="w-4 h-4" /></Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>
      <div className="relative border-t border-neutral-800/50 bg-black/40 backdrop-blur-xl p-5">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto relative">
          <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Describe your project needs..." className="w-full px-6 py-4 pr-14 bg-neutral-900/60 border border-neutral-800/50 rounded-2xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 resize-none max-h-32 transition-all" rows={1} />
          <button type="submit" disabled={!input.trim() || isLoading} className="absolute right-3 bottom-3 p-2.5 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl transition-all hover:scale-110 shadow-lg"><Send className="w-5 h-5 text-white" /></button>
        </form>
      </div>
    </div>
  );
}