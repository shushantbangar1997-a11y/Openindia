import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

export const SCENE_DURATIONS = {
  problem: 6000,
  moment: 5000,
  magic: 7000,
  scale: 6000,
  close: 8000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  problem: Scene1,
  moment: Scene2,
  magic: Scene3,
  scale: Scene4,
  close: Scene5,
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Background layer */}
      <div className="absolute inset-0">
        <motion.img
          src={`${import.meta.env.BASE_URL}images/bg-gradient.png`}
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          animate={{ scale: [1.1, 1.2, 1.1], opacity: [0.4, 0.6, 0.4] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          alt=""
        />

        <motion.div className="absolute w-[40vw] h-[40vw] rounded-full blur-[80px]"
          style={{ background: 'radial-gradient(circle, rgba(59, 130, 246, 0.2), transparent)' }}
          animate={{ x: ['-20%', '50%', '10%'], y: ['10%', '60%', '30%'] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }} />

        <motion.div className="absolute w-[50vw] h-[50vw] rounded-full blur-[80px] right-0 bottom-0"
          style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 0.15), transparent)' }}
          animate={{ x: ['10%', '-30%', '5%'], y: ['-10%', '-40%', '-20%'] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>
    </div>
  );
}
