'use client'

import { useState } from 'react'
import type { Company, Trade } from '@/types/database'
import { TRADE_COLORS } from '@/constants/colors'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
  companies: Company[]
  trades: Trade[]
  preferredTradeId?: string | null
  /** Insert a new external company in DB. Returns the created Company. */
  onCreateExternal: (name: string) => Promise<Company>
}

export default function CompaniesPicker({ value, onChange, companies, trades, preferredTradeId, onCreateExternal }: Props) {
  void trades; void preferredTradeId
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  function addOne(name: string) {
    const n = name.trim()
    if (!n) return
    if (value.includes(n)) return
    onChange([...value, n])
    setSearch('')
  }

  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  async function createAndAdd(name: string) {
    const n = name.trim()
    if (!n) return
    setCreating(true)
    try {
      const co = await onCreateExternal(n)
      addOne(co.name)
    } finally {
      setCreating(false)
    }
  }

  const knownNames = new Set(companies.map(c => c.name))
  const internal = companies.filter(c => !c.is_external && c.active !== false)
  const externals = companies.filter(c => c.is_external)

  const ql = search.trim().toLowerCase()
  const filterFn = (c: Company) =>
    !value.includes(c.name) &&
    (!ql || c.name.toLowerCase().includes(ql))

  const internalMatches = internal.filter(filterFn)
  const externalMatches = externals.filter(filterFn)

  // Exact name match (case-insensitive) → don't propose "create new"
  const exactExists = !!ql && [...knownNames].some(n => n.toLowerCase() === ql)
  const canCreate = !!ql && !exactExists

  return (
    <div>
      {/* Current chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {value.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Aucun intervenant pour cette tâche</span>
        )}
        {value.map((name, i) => {
          const co = companies.find(c => c.name === name)
          const isExt = !!co?.is_external
          const colorKey = (co?.color as keyof typeof TRADE_COLORS | null) ?? null
          const tc = colorKey ? TRADE_COLORS[colorKey] : null
          const bg = isExt && tc ? tc.bg : 'var(--surface-2)'
          const border = isExt && tc ? tc.b : 'var(--border)'
          const fg = isExt && tc ? tc.t : 'var(--text)'
          return (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 999,
              background: bg, border: `1px solid ${border}`,
              fontSize: 12, fontWeight: 600, color: fg,
            }}>
              {isExt && '✎ '}{name}
              <button
                type="button"
                onClick={() => removeAt(i)}
                style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
              >×</button>
            </span>
          )
        })}
      </div>

      {/* Toggle picker */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            padding: '5px 10px', borderRadius: 'var(--r-xs)',
            border: '1px dashed var(--primary)', background: 'transparent',
            color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Ajouter un intervenant
        </button>
      )}

      {open && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', padding: 8, background: 'var(--surface)' }}>
          <input
            type="text"
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher ou saisir un nom (entreprise, MOE, AMO…)"
            style={{
              width: '100%', padding: '6px 8px', borderRadius: 'var(--r-xs)',
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', fontSize: 13, marginBottom: 6, boxSizing: 'border-box',
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                // If a single result matches → pick it, otherwise create
                if (internalMatches.length === 1 && !canCreate) addOne(internalMatches[0].name)
                else if (externalMatches.length === 1 && !canCreate) addOne(externalMatches[0].name)
                else if (canCreate && !creating) createAndAdd(search)
              }
              if (e.key === 'Escape') { setOpen(false); setSearch('') }
            }}
          />

          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {internalMatches.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', padding: '4px 4px 2px' }}>
                  Entreprises
                </div>
                {internalMatches.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addOne(c.name)}
                    style={pickerRowStyle}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {externalMatches.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', padding: '4px 4px 2px' }}>
                  Intervenants externes
                </div>
                {externalMatches.map(c => {
                  const colorKey = c.color as keyof typeof TRADE_COLORS | null
                  const tc = colorKey ? TRADE_COLORS[colorKey] : null
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => addOne(c.name)}
                      style={{ ...pickerRowStyle, color: tc?.t ?? 'var(--text)' }}
                    >
                      {tc && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: tc.b, marginRight: 6 }} />}
                      ✎ {c.name}
                    </button>
                  )
                })}
              </div>
            )}

            {canCreate && (
              <button
                type="button"
                onClick={() => createAndAdd(search)}
                disabled={creating}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '7px 8px', marginTop: 4,
                  borderRadius: 'var(--r-xs)', border: '1px dashed var(--primary)',
                  background: 'var(--primary-l)', color: 'var(--primary)',
                  fontSize: 12, fontWeight: 700, cursor: creating ? 'wait' : 'pointer',
                }}
              >
                {creating ? 'Création…' : `+ Créer « ${search.trim()} » comme intervenant externe`}
              </button>
            )}

            {!canCreate && internalMatches.length === 0 && externalMatches.length === 0 && (
              <div style={{ padding: 8, fontSize: 12, color: 'var(--muted)' }}>
                {ql ? 'Aucun résultat — tape un nom complet et appuie sur Entrée pour le créer' : 'Tape un nom pour rechercher ou créer un intervenant'}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              type="button"
              onClick={() => { setOpen(false); setSearch('') }}
              style={{ padding: '4px 8px', border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const pickerRowStyle: React.CSSProperties = {
  width: '100%', textAlign: 'left',
  padding: '6px 8px',
  borderRadius: 'var(--r-xs)', border: 'none',
  background: 'transparent', color: 'var(--text)',
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
  display: 'flex', alignItems: 'center',
}
