import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'اسکنر سیگنال کریپتو | موتور نقدینگی لایه ۳',
  description:
    'اسکنر بی‌درنگ و بدون سرور بازار ارزهای دیجیتال با تحلیل ساختار چند تایم‌فریم، سوئیپ نقدینگی، سطوح جلسات معاملاتی، جریان مشتقات و موتور پیشرفته نقدینگی لایه ۳.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
