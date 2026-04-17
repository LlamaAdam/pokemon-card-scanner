import type { AppProps } from 'next/app';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <Component {...pageProps} />
    </>
  );
}
