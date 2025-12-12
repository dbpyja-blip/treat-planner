import "../styles/globals.css";

// Next.js custom App to inject global styles.
export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

