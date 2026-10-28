import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const evolventa = localFont({
  src: [
    { path: '../fonts/Evolventa-Regular.ttf', weight: '400' },
    { path: '../fonts/Evolventa-Bold.ttf', weight: '700' },
  ],
  variable: '--font-evolventa',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'OK Battle',
  description: 'Музыкальная викторина: угадай песню или ответь на вопрос быстрее соперников.',
  icons: { icon: 'icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#5E9AD5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className={`${evolventa.variable} root`}>{children}</div>
      </body>
    </html>
  );
}
