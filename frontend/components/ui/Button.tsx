
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ children, className, variant = 'primary', size = 'md', ...props }) => {
  const baseStyles = "inline-flex items-center justify-center rounded-lg font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 disabled:opacity-50 disabled:pointer-events-none transition-all duration-200";

  const variantStyles = {
    primary: 'bg-[#1B2B4B] text-white hover:bg-[#152238] focus-visible:ring-[#C9A84C] shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
    secondary: 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200 focus-visible:ring-[#C9A84C] dark:bg-neutral-800 dark:text-zinc-200 dark:hover:bg-neutral-700 dark:focus-visible:ring-[#C9A84C] border border-zinc-200 dark:border-neutral-700/50',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
    ghost: 'bg-transparent hover:bg-zinc-100 dark:hover:bg-neutral-800 focus-visible:ring-[#C9A84C] text-zinc-700 dark:text-zinc-300',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const combinedClassName = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;

  return (
    <button className={combinedClassName} {...props}>
      {children}
    </button>
  );
};
