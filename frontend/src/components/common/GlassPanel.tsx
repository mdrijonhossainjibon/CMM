import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  padding?: boolean;
  animate?: boolean;
}

export default function GlassPanel({ children, className = '', padding = true, animate = true }: GlassPanelProps) {
  const Component = animate ? motion.div : 'div';
  const animateProps = animate ? {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3 },
  } : {};

  return (
    <Component
      className={`rounded-xl glass ${padding ? 'p-5' : ''} ${className}`}
      {...animateProps}
    >
      {children}
    </Component>
  );
}
