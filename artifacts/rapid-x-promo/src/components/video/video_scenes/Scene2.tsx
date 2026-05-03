import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-transparent z-10"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.8 }}
    >
      <div className="relative flex flex-col items-center">
        <motion.div 
          className="w-32 h-32 rounded-2xl bg-blue-500/20 border border-blue-500/50 flex items-center justify-center mb-12 shadow-[0_0_50px_rgba(59,130,246,0.3)]"
          initial={{ scale: 0, rotate: -45 }}
          animate={phase >= 1 ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -45 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <svg className="w-16 h-16 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </motion.div>

        <motion.h2 
          className="text-[5vw] font-extrabold text-white text-center leading-tight"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          Dispatch agents
          <br />
          <span className="text-gradient">with one click.</span>
        </motion.h2>

        {phase >= 3 && (
          <motion.div 
            className="absolute top-1/2 left-1/2 w-[200vw] h-[200vw] rounded-full border border-blue-500/30 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 2, ease: "easeOut" }}
          />
        )}
      </div>
    </motion.div>
  );
}