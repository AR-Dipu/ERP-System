import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'ERP System',description:'Your products, companies, and inventory in one workspace.',robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
