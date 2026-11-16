import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BEMS ERP | Operations Management',
};

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

