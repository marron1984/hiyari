'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-zinc-700 mb-1.5">
            {label}
            {props.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full h-11 px-3.5 border rounded-xl text-zinc-900 placeholder-zinc-400 bg-white',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-1',
            'disabled:bg-zinc-50 disabled:text-zinc-500',
            error ? 'border-red-400 focus:ring-red-500' : 'border-zinc-200',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
        {hint && !error && <p className="mt-1.5 text-sm text-zinc-500">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  showCount?: boolean;
  maxCount?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, showCount, maxCount, id, value, ...props }, ref) => {
    const inputId = id || props.name;
    const currentLength = typeof value === 'string' ? value.length : 0;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-zinc-700 mb-1.5">
            {label}
            {props.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          value={value}
          className={cn(
            'w-full px-3.5 py-3 border rounded-xl text-zinc-900 placeholder-zinc-400 bg-white resize-none',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-1',
            'disabled:bg-zinc-50 disabled:text-zinc-500',
            error ? 'border-red-400 focus:ring-red-500' : 'border-zinc-200',
            className
          )}
          {...props}
        />
        <div className="flex justify-between mt-1.5">
          <div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            {hint && !error && <p className="text-sm text-zinc-500">{hint}</p>}
          </div>
          {showCount && (
            <p className={cn(
              'text-sm',
              maxCount && currentLength > maxCount ? 'text-red-500' : 'text-zinc-400'
            )}>
              {currentLength}{maxCount && ` / ${maxCount}`}
            </p>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
