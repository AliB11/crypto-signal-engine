import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Crypto Advanced Signal Scanner | Context-Aware Layer 3 Engine',
  description:
    'Serverless real-time crypto market scanner with Multi-Timeframe Structure, Liquidity Sweeps, Session Levels, Derivatives, and Advanced Liquidity Layer 3.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
