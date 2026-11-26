import './globals.css';

export const metadata = {
  title: 'Smallsteps · GLP-1 Telemedicine',
  description: 'Explore a fictional GLP-1 telemedicine journey with doctor-led consultations, medication review and follow-up care.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
