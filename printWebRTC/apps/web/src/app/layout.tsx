import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'MyPrint', description: 'Private cloud-to-edge printing' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
