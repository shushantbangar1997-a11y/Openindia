import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-transparent z-10 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.2 }}
      transition={{ duration: 0.8 }}
    >
      {/* Network Background Image */}
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/network.png`}
        className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-screen"
        initial={{ scale: 1 }}
        animate={{ scale: 1.1 }}
        transition={{ duration: 6, ease: "linear" }}
        alt=""
      />

      <div className="relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-[2vw] font-semibold text-blue-400 tracking-widest uppercase mb-4">The Scale</p>
        </motion.div>

        <motion.h2 
          className="text-[7vw] font-black text-white leading-none mb-8"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={phase >= 2 ? { scale: 1, opacity: 1 } : { scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          10,000 calls.
          <br />
          <span className="text-white/20">At the exact same time.</span>
        </motion.h2>
      </div>

    </motion.div>
  );
}