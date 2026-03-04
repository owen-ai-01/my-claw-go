import { getBaseUrl } from '@/lib/urls/urls';
import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title') || 'My Claw Go';
  const desc =
    searchParams.get('desc') ||
    'Your private OpenClaw workspace — no VPS, no setup, no API key hassle.';

  return new ImageResponse(
    <div
      style={{
        width: '1200px',
        height: '630px',
        background:
          'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '72px 80px',
        fontFamily: 'sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* background glow */}
      <div
        style={{
          position: 'absolute',
          top: '-100px',
          right: '-100px',
          width: '500px',
          height: '500px',
          background:
            'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
          borderRadius: '50%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-80px',
          left: '20%',
          width: '360px',
          height: '360px',
          background:
            'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)',
          borderRadius: '50%',
        }}
      />

      {/* logo pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: '40px',
          padding: '8px 22px',
          marginBottom: '36px',
        }}
      >
        <span style={{ fontSize: '26px' }}>🦞</span>
        <span
          style={{
            color: '#a5b4fc',
            fontSize: '18px',
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          MyClawGo
        </span>
        <span
          style={{
            background: 'rgba(16,185,129,0.2)',
            border: '1px solid rgba(16,185,129,0.5)',
            borderRadius: '20px',
            color: '#6ee7b7',
            fontSize: '12px',
            fontWeight: 600,
            padding: '2px 10px',
            marginLeft: '4px',
          }}
        >
          Hosted OpenClaw
        </span>
      </div>

      {/* title */}
      <div
        style={{
          fontSize: title.length > 40 ? '42px' : '52px',
          fontWeight: 800,
          color: '#f1f5f9',
          lineHeight: 1.15,
          maxWidth: '900px',
          marginBottom: '24px',
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </div>

      {/* desc */}
      <div
        style={{
          fontSize: '22px',
          color: '#94a3b8',
          maxWidth: '820px',
          lineHeight: 1.55,
          marginBottom: '48px',
        }}
      >
        {desc}
      </div>

      {/* badges */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {[
          'No VPS required',
          'Private workspace',
          'OpenClaw hosting',
          'Start in minutes',
        ].map((badge) => (
          <div
            key={badge}
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '24px',
              color: '#cbd5e1',
              fontSize: '15px',
              padding: '6px 18px',
            }}
          >
            {badge}
          </div>
        ))}
      </div>

      {/* bottom domain */}
      <div
        style={{
          position: 'absolute',
          bottom: '36px',
          right: '80px',
          color: '#475569',
          fontSize: '16px',
          fontWeight: 500,
        }}
      >
        myclawgo.com
      </div>
    </div>,
    { width: 1200, height: 630 }
  );
}
