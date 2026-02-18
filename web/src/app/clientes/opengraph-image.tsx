import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Maninos Homes — Tu nuevo hogar en Texas'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          background: 'linear-gradient(135deg, #001d3d 0%, #003566 35%, #004274 60%, #0068b7 100%)',
          padding: '80px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle decorative circles */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            right: '-120px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-80px',
            right: '200px',
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.03)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-60px',
            left: '-60px',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.02)',
            display: 'flex',
          }}
        />

        {/* Top: Brand name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '40px',
          }}
        >
          {/* Simple house icon */}
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
            }}
          >
            🏠
          </div>
          <div
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.9)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase' as const,
              display: 'flex',
            }}
          >
            Maninos Homes
          </div>
        </div>

        {/* Main heading */}
        <div
          style={{
            fontSize: '72px',
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            maxWidth: '800px',
            marginBottom: '20px',
            display: 'flex',
          }}
        >
          Tu nuevo hogar en Texas
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '28px',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
            lineHeight: 1.4,
            maxWidth: '700px',
            marginBottom: '10px',
            display: 'flex',
          }}
        >
          Un lugar seguro para tu familia.
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: '20px',
            fontWeight: 400,
            color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.5,
            maxWidth: '650px',
            display: 'flex',
          }}
        >
          Casas móviles listas para mudarte. Compra al contado o con plan dueño a dueño RTO.
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '80px',
            background: 'rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 80px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '32px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '16px',
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              📍 Houston · Dallas · Conroe, TX
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '16px',
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              📞 (832) 745-9600
            </div>
          </div>
          <div
            style={{
              fontSize: '15px',
              color: 'rgba(255,255,255,0.4)',
              display: 'flex',
            }}
          >
            maninoshomes.com
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  )
}

