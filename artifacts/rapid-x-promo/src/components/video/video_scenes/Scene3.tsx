import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-transparent z-10"
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
    >
      <div className="flex w-[80%] max-w-6xl items-center justify-between">
        
        {/* Left side text */}
        <div className="w-1/2 pr-12">
          <motion.h2 
            className="text-[4vw] font-bold text-white mb-6 leading-tight"
            initial={{ opacity: 0, x: -50 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
            transition={{ duration: 0.8 }}
          >
            Human-like conversations.
            <br />
            <span className="text-white/40">Zero latency.</span>
          </motion.h2>
          
          <motion.div 
            className="h-1 w-24 bg-gradient-to-r from-purple-500 to-pink-500"
            initial={{ scaleX: 0 }}
            animate={phase >= 2 ? { scaleX: 1 } : { scaleX: 0 }}
            style={{ transformOrigin: 'left' }}
            transition={{ duration: 0.6 }}
          />
        </div>

        {/* Right side visualization */}
        <div className="w-1/2 flex justify-center relative">
          <motion.div 
            className="relative w-64 h-64 rounded-full flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={phase >= 1 ? { scale: 1 } : { scale: 0 }}
            transition={{ type: "spring", bounce: 0.4, duration: 1 }}
          >
            {/* Pulsing rings */}
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-full border-2 border-purple-500/50"
                animate={phase >= 2 ? {
                  scale: [1, 2],
                  opacity: [0.8, 0],
                } : {}}
                transition={{
                  duration: 2,
                  repeat: phase >= 2 ? Infinity : 0,
                  delay: i * 0.6,
                  ease: "easeOut"
                }}
              />
            ))}
            
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 shadow-[0_0_60px_rgba(168,85,247,0.5)] flex items-center justify-center z-10">
              <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
          </motion.div>
        </div>

      </div>
    </motion.div>
  );
}