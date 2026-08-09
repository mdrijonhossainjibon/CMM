import { motion } from 'framer-motion';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-6"
    >
      <div className="text-3xl">⚠</div>
      <p className="text-sm text-red-400 text-center">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md bg-red-500/10 px-4 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
        >
          Retry
        </button>
      )}
    </motion.div>
  );
}
