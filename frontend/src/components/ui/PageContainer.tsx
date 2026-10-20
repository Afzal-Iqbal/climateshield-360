import React from 'react';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: '7xl' | 'full' | '6xl';
}

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className = '',
  maxWidth = '7xl',
}) => {
  const maxClass = maxWidth === 'full' ? 'max-w-none' : maxWidth === '6xl' ? 'max-w-6xl' : 'max-w-7xl';

  return (
    <div
      className={`w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-5 sm:gap-6 ${maxClass} ${className}`}
    >
      {children}
    </div>
  );
};
