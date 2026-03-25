import React from 'react';
import { ExternalLink, Info } from 'lucide-react';
import { motion } from 'motion/react';

interface SponsoredAdProps {
  type?: 'banner' | 'native' | 'interstitial';
  className?: string;
}

export function SponsoredAd({ type = 'banner', className = '' }: SponsoredAdProps) {
  // In a real app, this would be where you'd integrate Google AdSense or another ad provider.
  // For this app, we'll create a polished "Sponsored" slot that can be easily connected to a real API.
  
  const ads = [
    {
      title: "TOEIC L&R Test Mastery",
      description: "Score 900+ with our intensive online course. Limited time 50% off!",
      cta: "Learn More",
      url: "https://example.com/toeic-course",
      image: "https://picsum.photos/seed/study/800/400"
    },
    {
      title: "English Grammar Pro",
      description: "The only grammar app you'll ever need. Download now for free.",
      cta: "Get App",
      url: "https://example.com/grammar-app",
      image: "https://picsum.photos/seed/app/800/400"
    },
    {
      title: "Global Networking Event",
      description: "Connect with English speakers worldwide this weekend in Tokyo.",
      cta: "Register",
      url: "https://example.com/event",
      image: "https://picsum.photos/seed/event/800/400"
    }
  ];

  const ad = ads[Math.floor(Math.random() * ads.length)];

  if (type === 'banner') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden ${className}`}
      >
        <div className="flex items-center gap-4 p-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0">
            <img src={ad.image} alt="Ad" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-1.5 py-0.5 bg-slate-100 text-[8px] font-black text-slate-400 rounded uppercase tracking-widest">Sponsored</span>
              <h4 className="text-sm font-black text-slate-900 truncate uppercase tracking-tight">{ad.title}</h4>
            </div>
            <p className="text-[10px] text-slate-400 font-bold line-clamp-1">{ad.description}</p>
          </div>
          <a 
            href={ad.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-4 py-2 bg-indigo-600 text-white text-[10px] font-black rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-1 uppercase tracking-widest"
          >
            {ad.cta} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-slate-50 rounded-[2.5rem] p-8 border-2 border-dashed border-slate-200 text-center ${className}`}
    >
      <div className="flex justify-center mb-4">
        <div className="px-3 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
          <Info className="w-3 h-3" /> Advertisement
        </div>
      </div>
      <div className="max-w-sm mx-auto">
        <div className="aspect-video rounded-3xl overflow-hidden mb-6 shadow-lg">
           <img src={ad.image} alt="Ad" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tighter">{ad.title}</h3>
        <p className="text-sm text-slate-500 font-bold mb-6 leading-relaxed">{ad.description}</p>
        <a 
          href={ad.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-black transition-all active:scale-95"
        >
          {ad.cta} <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </motion.div>
  );
}
