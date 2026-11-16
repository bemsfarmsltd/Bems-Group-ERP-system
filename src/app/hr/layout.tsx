import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BEMS ERP | Human Resources',
};

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return children;
}

