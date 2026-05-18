'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Intervention, Zone, Trade, Company } from '@/types/database'
import { effectiveStatus } from '@/lib/progress'
import { STATUS_META } from '@/constants/status'
import { getTradeColor, getZoneFloorColor } from '@/constants/colors'

// ─── Date helpers ─────────────────────────────────────────────────────────────

const FR_DAYS_LONG  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
const FR_DAYS_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
const FR_MONTHS     = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const FR_MONTHS_S   = ['jan.','fév.','mar.','avr.','mai','juin','juil.','août','sep.','oct.','nov.','déc.']

function localStr(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
}

function getWeekDays(offsetWeeks: number): string[] {
  const today = new Date(); today.setHours(0,0,0,0)
  const dow = today.getDay()
  const mon = new Date(today)
  mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + offsetWeeks * 7)
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return localStr(d)
  })
}

function fmtDayLabel(ds: string): { short: string; num: number; month: string } {
  const d = new Date(ds + 'T00:00:00')
  return { short: FR_DAYS_SHORT[d.getDay()], num: d.getDate(), month: FR_MONTHS_S[d.getMonth()] }
}

function fmtDateRange(days: string[]): string {
  const first = new Date(days[0] + 'T00:00:00')
  const last  = new Date(days[days.length - 1] + 'T00:00:00')
  if (first.getMonth() === last.getMonth())
    return `${first.getDate()} – ${last.getDate()} ${FR_MONTHS[last.getMonth()]} ${last.getFullYear()}`
  return `${first.getDate()} ${FR_MONTHS_S[first.getMonth()]} – ${last.getDate()} ${FR_MONTHS_S[last.getMonth()]} ${last.getFullYear()}`
}

function isActiveOn(iv: Intervention, ds: string): boolean {
  if (iv.status === 'termine') return false
  const s = iv.start_date ?? '', e = iv.end_date ?? s
  if (!s || s > ds || e < ds) return false
  if (iv.off_days?.includes(ds)) return false
  return true
}

// ─── Main export page ─────────────────────────────────────────────────────────

export default function ExportPlanningPage() {
  const [zones, setZones]               = useState<Zone[]>([])
  const [trades, setTrades]             = useState<Trade[]>([])
  const [companies, setCompanies]       = useState<Company[]>([])
  const [interventions, setInterventions] = useState<Intervention[]>([])
  const [loading, setLoading]           = useState(true)
  const [weekCount, setWeekCount]       = useState<1 | 2 | 3>(1)
  const [startOffset, setStartOffset]   = useState(0)

  useEffect(() => {
    Promise.all([
      supabase.from('zones').select('*').order('display_order'),
      supabase.from('trades').select('*').order('display_order'),
      supabase.from('companies').select('*').order('display_order').eq('active', true),
      supabase.from('interventions').select('*').order('start_date').limit(1000),
    ]).then(([z, t, c, iv]) => {
      setZones((z.data ?? []) as Zone[])
      setTrades((t.data ?? []) as Trade[])
      setCompanies((c.data ?? []) as Company[])
      setInterventions((iv.data ?? []) as Intervention[])
      setLoading(false)
    })
  }, [])

  const allDays = Array.from({ length: weekCount }, (_, i) => getWeekDays(startOffset + i)).flat()
  const weeks   = Array.from({ length: weekCount }, (_, i) => getWeekDays(startOffset + i))
  const dateRange = fmtDateRange(allDays)
  const today   = localStr(new Date())

  const floors = [...new Set(zones.map(z => z.floor).filter(Boolean))].sort()

  const printedAt = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#6B6860' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div>Chargement du planning…</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ── Print styles ─────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #F4F2EE; }

        @media print {
          @page { size: A4 landscape; margin: 1cm 1.2cm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; background: white !important; }
          .page-break { page-break-before: always; margin-top: 0; }
        }
      `}</style>

      {/* ── Controls (hidden on print) ───────────────────────────────────── */}
      <div className="no-print" style={{
        background: '#1A1A1A', color: '#fff', padding: '12px 24px',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        <span style={{ fontWeight: 900, fontSize: 13, letterSpacing: '.08em', opacity: .5 }}>PLANIFY</span>
        <span style={{ opacity: .2 }}>|</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Export Planning</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Semaines à afficher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, opacity: .6, fontWeight: 600 }}>DURÉE</span>
            {([1, 2, 3] as const).map(n => (
              <button key={n} onClick={() => setWeekCount(n)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: weekCount === n ? '#2152C8' : 'rgba(255,255,255,.1)',
                color: weekCount === n ? '#fff' : 'rgba(255,255,255,.6)',
              }}>{n} sem.</button>
            ))}
          </div>

          {/* Décaler les semaines */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, opacity: .6, fontWeight: 600 }}>SEMAINE</span>
            <button onClick={() => setStartOffset(o => Math.max(0, o - 1))} disabled={startOffset === 0} style={{
              padding: '5px 10px', borderRadius: 6, border: 'none', cursor: startOffset === 0 ? 'not-allowed' : 'pointer',
              background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 700,
            }}>‹</button>
            <span style={{ fontSize: 11, opacity: .7, minWidth: 60, textAlign: 'center' }}>
              {startOffset === 0 ? 'Actuelle' : `S+${startOffset}`}{weekCount > 1 ? ` → S+${startOffset + weekCount - 1}` : ''}
            </span>
            <button onClick={() => setStartOffset(o => o + 1)} style={{
              padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 700,
            }}>›</button>
          </div>

          <button onClick={() => window.print()} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: '#2152C8', color: '#fff', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            🖨 Imprimer / Exporter PDF
          </button>
        </div>
      </div>

      {/* ── Planning pages ───────────────────────────────────────────────── */}
      <div style={{ padding: '20px 20px 40px', background: '#F4F2EE', minHeight: '100vh' }}>
        {weeks.map((weekDays, wi) => {
          const weekRange = fmtDateRange(weekDays)

          return (
            <div key={wi} className={wi > 0 ? 'page-break' : ''} style={{
              background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,.10)',
              marginBottom: 24, overflow: 'hidden',
            }}>

              {/* Page header */}
              <div style={{
                background: '#1A1A1A', color: '#fff',
                padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 11, letterSpacing: '.1em', opacity: .45 }}>PLANIFY</div>
                    <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-.3px', lineHeight: 1.1 }}>HSF Av. Marceau</div>
                  </div>
                  <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,.15)' }} />
                  <div>
                    <div style={{ fontSize: 10, opacity: .5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Planning</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{weekRange}</div>
                  </div>
                  {weekCount > 1 && (
                    <>
                      <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,.15)' }} />
                      <div style={{ fontSize: 12, opacity: .6 }}>
                        Semaine {wi + 1} / {weekCount}
                      </div>
                    </>
                  )}
                </div>
                <div style={{ fontSize: 10, opacity: .4, textAlign: 'right' }}>
                  <div>Imprimé le {printedAt}</div>
                  {weekCount > 1 && <div style={{ marginTop: 2 }}>Période : {dateRange}</div>}
                </div>
              </div>

              {/* Day header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(5, 1fr)', background: '#F8F7F4', borderBottom: '2px solid #E8E4DC' }}>
                <div style={{ padding: '10px 12px', borderRight: '1px solid #E8E4DC' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#ABA8A0', textTransform: 'uppercase', letterSpacing: '.07em' }}>Zone</div>
                </div>
                {weekDays.map(ds => {
                  const { short, num, month } = fmtDayLabel(ds)
                  const isToday = ds === today
                  const dayIvsTotal = interventions.filter(iv => isActiveOn(iv, ds)).length
                  return (
                    <div key={ds} style={{
                      padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #E8E4DC',
                      background: isToday ? '#EEF2FC' : 'transparent',
                      borderTop: isToday ? '3px solid #2152C8' : '3px solid transparent',
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: isToday ? '#2152C8' : '#ABA8A0', textTransform: 'uppercase', letterSpacing: '.07em' }}>{short}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: isToday ? '#2152C8' : '#1A1A1A', lineHeight: 1.1 }}>{num}</div>
                      <div style={{ fontSize: 9, color: '#ABA8A0', marginTop: 1 }}>{month}</div>
                      {dayIvsTotal > 0 && (
                        <div style={{ marginTop: 4, fontSize: 9, fontWeight: 700, color: isToday ? '#2152C8' : '#6B6860',
                          background: isToday ? 'rgba(33,82,200,.1)' : '#F4F2EE', borderRadius: 99, padding: '2px 6px', display: 'inline-block' }}>
                          {dayIvsTotal} int.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Zone rows, grouped by floor */}
              {floors.map(floor => {
                const floorZones = zones.filter(z => z.floor === floor)
                const fc = getZoneFloorColor(zones, floor)
                const floorHasAny = floorZones.some(zone =>
                  weekDays.some(ds => interventions.some(iv => iv.zone === zone.id && isActiveOn(iv, ds)))
                )
                if (!floorHasAny) return null

                return (
                  <div key={floor}>
                    {/* Floor separator */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '120px repeat(5, 1fr)',
                      background: fc + '16', borderTop: `1px solid ${fc}40`, borderBottom: `1px solid ${fc}30`,
                    }}>
                      <div style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: fc, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 10, fontWeight: 800, color: fc, textTransform: 'uppercase', letterSpacing: '.06em' }}>{floor}</span>
                      </div>
                      {weekDays.map(ds => {
                        const cnt = floorZones.reduce((acc, z) =>
                          acc + interventions.filter(iv => iv.zone === z.id && isActiveOn(iv, ds)).length, 0)
                        return (
                          <div key={ds} style={{ padding: '5px 8px', textAlign: 'center', borderLeft: '1px solid ' + fc + '30' }}>
                            {cnt > 0 && <span style={{ fontSize: 9, color: fc, fontWeight: 700 }}>{cnt}</span>}
                          </div>
                        )
                      })}
                    </div>

                    {/* Zone rows */}
                    {floorZones.map(zone => {
                      const zoneHasAny = weekDays.some(ds => interventions.some(iv => iv.zone === zone.id && isActiveOn(iv, ds)))
                      if (!zoneHasAny) return null

                      return (
                        <div key={zone.id} style={{
                          display: 'grid', gridTemplateColumns: '120px repeat(5, 1fr)',
                          borderBottom: '1px solid #F0EDE6', minHeight: 56,
                        }}>
                          {/* Zone label */}
                          <div style={{
                            padding: '8px 10px', borderRight: '1px solid #E8E4DC',
                            display: 'flex', flexDirection: 'column', justifyContent: 'center',
                            background: '#FAFAF8',
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#1A1A1A', lineHeight: 1.2 }}>{zone.short}</div>
                            <div style={{ fontSize: 9, color: '#ABA8A0', marginTop: 2, lineHeight: 1.3 }}>{zone.name}</div>
                          </div>

                          {/* Day cells */}
                          {weekDays.map(ds => {
                            const dayIvs = interventions.filter(iv => iv.zone === zone.id && isActiveOn(iv, ds))
                            return (
                              <div key={ds} style={{
                                padding: '5px 5px', borderRight: '1px solid #F0EDE6',
                                display: 'flex', flexDirection: 'column', gap: 3,
                                background: ds === today ? 'rgba(33,82,200,.03)' : 'transparent',
                              }}>
                                {dayIvs.map(iv => {
                                  const co = companies.find(c => c.name === iv.company)
                                  const tr = trades.find(t => t.id === (co?.trade_id ?? iv.trade))
                                  const tc = getTradeColor(tr?.color ?? 'blue')
                                  const es = effectiveStatus(iv)
                                  const sm = STATUS_META[es]
                                  return (
                                    <div key={iv.id} style={{
                                      background: tc.bg, borderLeft: `3px solid ${tc.b}`,
                                      borderRadius: 4, padding: '3px 6px',
                                      border: `1px solid ${tc.b}30`,
                                      borderLeftWidth: 3,
                                    }}>
                                      <div style={{ fontSize: 9, fontWeight: 800, color: tc.b, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {iv.company}
                                      </div>
                                      <div style={{ fontSize: 8.5, color: '#1A1A1A', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {iv.task_number ? `[${iv.task_number}] ` : ''}{iv.task}
                                      </div>
                                      {(es === 'en_retard' || es === 'bloque') && (
                                        <div style={{ fontSize: 7.5, fontWeight: 700, color: sm.dot, marginTop: 1 }}>{sm.label}</div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Legend + footer */}
              <div style={{
                padding: '10px 16px', borderTop: '1px solid #E8E4DC',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#FAFAF8',
              }}>
                {/* Trade legend */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#ABA8A0', textTransform: 'uppercase', letterSpacing: '.06em' }}>Corps de métier</span>
                  {trades.map(t => {
                    const tc = getTradeColor(t.color)
                    const hasIv = interventions.some(iv => {
                      const co = companies.find(c => c.name === iv.company)
                      return co?.trade_id === t.id && weekDays.some(ds => isActiveOn(iv, ds))
                    })
                    if (!hasIv) return null
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: tc.b, display: 'inline-block' }} />
                        <span style={{ fontSize: 9, fontWeight: 600, color: '#6B6860' }}>{t.name}</span>
                      </div>
                    )
                  })}
                </div>
                {/* Status legend */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#ABA8A0', textTransform: 'uppercase', letterSpacing: '.06em' }}>Statuts</span>
                  {(['encours','en_retard','bloque'] as const).map(s => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_META[s].dot, display: 'inline-block' }} />
                      <span style={{ fontSize: 9, color: '#6B6860' }}>{STATUS_META[s].label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
