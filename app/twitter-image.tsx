import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Property Management System';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          border: '16px solid #6366f1',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#6366f1',
            borderRadius: '32px',
            color: '#ffffff',
            padding: '48px',
            marginBottom: '48px',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="128"
            height="128"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
            <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
            <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
            <path d="M10 6h4" />
            <path d="M10 10h4" />
            <path d="M10 14h4" />
            <path d="M10 18h4" />
          </svg>
        </div>
        <div
          style={{
            fontSize: '84px',
            fontWeight: 'bold',
            color: '#0f172a',
            fontFamily: 'sans-serif',
          }}
        >
          PropertyCare
        </div>
        <div
          style={{
            fontSize: '36px',
            color: '#64748b',
            marginTop: '24px',
            fontFamily: 'sans-serif',
          }}
        >
          Report, assign and track maintenance across your properties.
        </div>
      </div>
    ),
    { ...size }
  );
}
