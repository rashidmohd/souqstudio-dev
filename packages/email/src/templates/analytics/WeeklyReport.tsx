import { Section, Heading, Text, Row, Column } from '@react-email/components'
import { Base } from '../../layouts/Base'
import { Button } from '../../components/primitives/Button'

export interface WeeklyReportProps {
  shopName: string
  dateRange: { from: string; to: string }
  totalViews: number
  viewsChange: number        // percentage vs previous week, can be negative
  totalClicks: number
  avgTimeSeconds: number
  topProducts: Array<{ name: string; clicks: number }>
  offerBooks: Array<{ title: string; views: number; clicks: number }>
  analyticsUrl: string
}

export function WeeklyReportEmail({
  shopName,
  dateRange,
  totalViews,
  viewsChange,
  totalClicks,
  avgTimeSeconds,
  topProducts,
  offerBooks,
  analyticsUrl,
}: WeeklyReportProps) {
  const avgTimeMin = Math.floor(avgTimeSeconds / 60)
  const avgTimeSec = avgTimeSeconds % 60
  const changeSign = viewsChange >= 0 ? '+' : ''

  return (
    <Base preview={`${shopName} — ${totalViews} views this week`} >
      <Section style={section}>
        <Text style={eyebrow}>{dateRange.from} – {dateRange.to}</Text>
        <Heading style={heading}>Weekly report — {shopName}</Heading>

        {/* Stats row */}
        <Row style={statsRow}>
          <Column style={statCell}>
            <Text style={statValue}>{totalViews.toLocaleString()}</Text>
            <Text style={statLabel}>Views ({changeSign}{viewsChange}%)</Text>
          </Column>
          <Column style={statCell}>
            <Text style={statValue}>{totalClicks.toLocaleString()}</Text>
            <Text style={statLabel}>Clicks</Text>
          </Column>
          <Column style={statCell}>
            <Text style={statValue}>{avgTimeMin}m {avgTimeSec}s</Text>
            <Text style={statLabel}>Avg time</Text>
          </Column>
        </Row>

        {/* Top products */}
        {topProducts.length > 0 && (
          <>
            <Text style={sectionLabel}>Top products this week</Text>
            {topProducts.slice(0, 3).map((p) => (
              <Row key={p.name} style={productRow}>
                <Column><Text style={productName}>{p.name}</Text></Column>
                <Column style={clicksCol}><Text style={clicksText}>{p.clicks} clicks</Text></Column>
              </Row>
            ))}
          </>
        )}

        <Button href={analyticsUrl}>View full analytics</Button>
      </Section>
    </Base>
  )
}

const section: React.CSSProperties = { padding: '32px 40px' }
const eyebrow: React.CSSProperties = { fontSize: '11px', color: '#8A8880', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }
const heading: React.CSSProperties = { fontSize: '24px', color: '#323232', margin: '0 0 24px', fontWeight: '600' }
const statsRow: React.CSSProperties = { marginBottom: '32px' }
const statCell: React.CSSProperties = { textAlign: 'center', padding: '16px', backgroundColor: '#F8F7F3', borderRadius: '6px' }
const statValue: React.CSSProperties = { fontSize: '28px', fontWeight: '600', color: '#323232', margin: '0 0 4px', fontFamily: 'monospace' }
const statLabel: React.CSSProperties = { fontSize: '12px', color: '#6E6C64', margin: 0 }
const sectionLabel: React.CSSProperties = { fontSize: '12px', fontWeight: '500', color: '#323232', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }
const productRow: React.CSSProperties = { padding: '10px 0', borderBottom: '1px solid rgba(50,50,50,0.08)' }
const productName: React.CSSProperties = { fontSize: '14px', color: '#323232', margin: 0 }
const clicksCol: React.CSSProperties = { textAlign: 'right' }
const clicksText: React.CSSProperties = { fontSize: '13px', color: '#6E6C64', margin: 0, fontFamily: 'monospace' }

export default WeeklyReportEmail
