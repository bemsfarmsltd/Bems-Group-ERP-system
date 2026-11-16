import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BEMS ERP | Media Management',
};

export default function MediaLayout({ children }: { children: React.ReactNode }) {
  return children;
}

