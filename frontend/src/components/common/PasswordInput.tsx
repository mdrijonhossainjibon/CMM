import { useState } from 'react';
import { Icon } from './Icons';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onEnter?: () => void;
}

export default function PasswordInput({
  value,
  onChange,
  placeholder = 'Enter password',
  autoFocus,
  onKeyDown,
  onEnter,
}: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <Icon
        name="lock"
        className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-text/40"
      />
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
          onKeyDown?.(e);
        }}
        className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary placeholder:text-dark-text/30"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-dark-text/40 hover:text-dark-heading transition-colors"
        title={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        <Icon name={show ? 'eyeOff' : 'eye'} className="w-4 h-4" />
      </button>
    </div>
  );
}
