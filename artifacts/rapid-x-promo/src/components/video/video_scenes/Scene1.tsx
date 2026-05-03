import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 2800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-transparent z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <div className="w-[80%] max-w-5xl">
        <motion.h1 
          className="text-[6vw] font-black leading-tight tracking-tight text-white mb-12"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          Outbound calling is broken.
        </motion.h1>

        <div className="flex flex-col gap-6 text-[3vw] font-medium text-white/50">
          <motion.div 
            className="flex items-center gap-6"
            initial={{ opacity: 0, x: -30 }}
            animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <p>Endless dialing</p>
          </motion.div>
          
          <motion.div 
            className="flex items-center gap-6"
            initial={{ opacity: 0, x: -30 }}
            animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <p>Voicemails & hangups</p>
          </motion.div>
          
          <motion.div 
            className="flex items-center gap-6"
            initial={{ opacity: 0, x: -30 }}
            animate={phase >= 4 ? { opacity: 1, x: 0, color: "rgba(255,255,255,0.9)" } : { opacity: 0, x: -30 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <p>Burnout.</p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}