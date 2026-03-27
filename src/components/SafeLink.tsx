// src/components/SafeLink.tsx
'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

interface SafeLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  [key: string]: any;
}

export default function SafeLink({ href, children, className, onClick, ...props }: SafeLinkProps) {
  return (
    <Link
      href={href}
      onContextMenu={(e) => e.preventDefault()}
      onClick={onClick}
      className={className}
      {...props}
    >
      {children}
    </Link>
  );
}