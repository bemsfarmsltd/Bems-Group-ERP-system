import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BEMS ERP | Financial Operations',
};

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}

