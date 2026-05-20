'use client'

import { useEffect, useState } from 'react'
import type { Intervention, TaskChangeRequest, ChangeRequestStatus } from '@/types/database'
import {
  TASK_CHANGE_FIELDS,
  CHANGE_REQUEST_STATUS_META,
  type TaskChangeForm,
} from '@/constants/changeRequests'
import {
  buildRequestFormFromTask,
  buildRequestFormFromRequest,
  changedFieldsFromForm,
  changeRequestValueText,
  getChangeRequestValue,
  getRequestChangedFields,
  taskChangeWindowText,
  validateCompanyDateProposal,
} from '@/lib/changeRequests'

export type ChangeRequestSession =
  | { role: 'admin'    ; company_name: null;          user_name: string | null }
  | { role: 'company'  ; company_name: string;        user_name: string | null }
  | { role: 'external' ; company_name: string | null; user_name: string | null }

export type ReviewAction = 'accept' | 'adjust' | 'refuse'

interface PanelProps {
  iv: Intervention
  requests: TaskChangeRequest[]
  session: ChangeRequestSession
  canRequestTaskChange?: boolean
  busy?: boolean
  onSubmit: (iv: Intervention, form: TaskChangeForm) => Promise<void>
  onReview: (req: TaskChangeRequest, action: ReviewAction, form: TaskChangeForm, comment: string) => Promise<void>
}

export default function ChangeRequestPanel({ iv, requests, session, canRequestTaskChange = true, busy, onSubmit, onReview }: PanelProps) {
  const sorted = [...(requests ?? [])].sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  )
  const pending = sorted.find(r => r.status === 'pending_admin') ?? null
  const latest  = sorted[0] ?? null

  const isOwnerCompany   = session.role === 'company' && session.company_name === iv.company
  const isAdmin          = session.role === 'admin'
  const taskOpenForCo    = !!iv.company_edit_allowed
  const effectiveAllowed = !!canRequestTaskChange && taskOpenForCo

  if (!isOwnerCompany && !isAdmin && !latest) return null

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: 'var(--muted)',
          letterSpacing: '.05em', textTransform: 'uppercase',
          fontFamily: "'DM Mono', monospace",
        }}>
          Modification contrôlée
        </div>
        {latest && <ChangeRequestStatusBadge status={latest.status} />}
      </div>

      {latest && latest.status !== 'pending_admin' && (
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)', padding: '9px 11px', fontSize: 12,
          color: 'var(--muted)', lineHeight: 1.45, marginBottom: 8,
        }}>
          Dernière demande : {CHANGE_REQUEST_STATUS_META[latest.status]?.label ?? latest.status}
          {latest.admin_comment ? <><br /><b>Commentaire admin :</b> {latest.admin_comment}</> : null}
        </div>
      )}

      {pending && isOwnerCompany && (
        <div style={{
          background: 'rgba(249,115,22,.08)', border: '1px solid rgba(249,115,22,.25)',
          borderRadius: 'var(--r-sm)', padding: '10px 12px',
          fontSize: 12, color: '#9A3412', lineHeight: 1.45,
        }}>
          Votre demande de modification est en attente d’action admin. La tâche officielle n’est pas encore modifiée.
        </div>
      )}

      {!pending && isOwnerCompany && effectiveAllowed && (
        <CompanyChangeRequestForm iv={iv} busy={busy} onSubmit={onSubmit} />
      )}

      {!pending && isOwnerCompany && !effectiveAllowed && (
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)', padding: '10px 12px',
          fontSize: 12, color: 'var(--muted)', lineHeight: 1.45,
        }}>
          {!canRequestTaskChange
            ? 'Planning validé : les demandes de modification sont désactivées sur cette version.'
            : 'Cette tâche n’est pas ouverte à modification par l’entreprise. L’admin doit l’autoriser dans la fiche tâche.'}
        </div>
      )}

      {isAdmin && (
        <div style={{
          background: taskOpenForCo ? 'var(--primary-l)' : 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
          padding: '9px 11px', fontSize: 12,
          color: taskOpenForCo ? 'var(--primary)' : 'var(--muted)',
          lineHeight: 1.45, marginBottom: 8,
        }}>
          <b>{taskOpenForCo ? 'Modification entreprise autorisée' : 'Modification entreprise non autorisée'}</b>
          {taskOpenForCo ? <><br />{taskChangeWindowText(iv)}</> : null}
        </div>
      )}

      {pending && isAdmin && canRequestTaskChange && (
        <AdminChangeRequestReview iv={iv} req={pending} busy={busy} onReview={onReview} />
      )}
    </div>
  )
}

/* ─────────────────────────── ChangeRequestStatusBadge ─────────────────────────── */

export function ChangeRequestStatusBadge({ status }: { status: ChangeRequestStatus }) {
  const m = CHANGE_REQUEST_STATUS_META[status] ?? CHANGE_REQUEST_STATUS_META.pending_admin
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20,
      background: m.bg, color: m.text,
      fontSize: 10.5, fontWeight: 700,
      fontFamily: "'DM Mono', monospace",
      border: `1px solid ${m.dot}35`, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
      {m.short}
    </span>
  )
}

/* ─────────────────────────── CompanyChangeRequestForm ─────────────────────────── */

interface CompanyFormProps {
  iv: Intervention
  busy?: boolean
  onSubmit: (iv: Intervention, form: TaskChangeForm) => Promise<void>
}

function CompanyChangeRequestForm({ iv, busy, onSubmit }: CompanyFormProps) {
  const [openForm, setOpenForm] = useState(false)
  const [form, setForm] = useState<TaskChangeForm>(() => buildRequestFormFromTask(iv))
  const [error, setError] = useState('')

  useEffect(() => {
    setForm(buildRequestFormFromTask(iv))
    setError('')
    setOpenForm(false)
  }, [iv.id, iv.updated_at])

  function setField<K extends keyof TaskChangeForm>(key: K, value: TaskChangeForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setError('')
  }

  async function submit() {
    const changes = changedFieldsFromForm(iv, form)
    if (!changes.length) { setError('Aucune modification détectée.'); return }
    const dateError = validateCompanyDateProposal(iv, form)
    if (dateError) { setError(dateError); return }
    try {
      await onSubmit(iv, form)
      setOpenForm(false)
    } catch (e) {
      setError((e instanceof Error && e.message) || 'Erreur lors de l’envoi.')
    }
  }

  if (!openForm) {
    return (
      <button
        onClick={() => setOpenForm(true)}
        style={{
          width: '100%', marginTop: 8, marginBottom: 8,
          padding: '10px', borderRadius: 'var(--r-sm)',
          border: 'none', background: 'var(--primary)', color: '#fff',
          fontWeight: 800, fontSize: 12, cursor: 'pointer',
        }}
      >
        Demander une modification
      </button>
    )
  }

  return (
    <div style={{
      border: '1px solid var(--border)', background: 'var(--surface-2)',
      borderRadius: 'var(--r-sm)', padding: 12, marginTop: 10, marginBottom: 10,
    }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
        Demande de modification entreprise
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45, marginBottom: 12 }}>
        Vous pouvez proposer une modification sur les dates, le descriptif, les pré-requis et les notes.
        La zone, le niveau, l’entreprise et le corps de métier restent verrouillés.
        <br /><b>{taskChangeWindowText(iv)}</b>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <FieldLabel label="Date de début">
          <input type="date" value={form.start}
            min={iv.company_edit_start_min ?? undefined}
            max={iv.company_edit_end_max ?? undefined}
            onChange={e => setField('start', e.target.value)}
            style={inputStyle}
          />
        </FieldLabel>
        <FieldLabel label="Date de fin">
          <input type="date" value={form.end}
            min={iv.company_edit_start_min ?? undefined}
            max={iv.company_edit_end_max ?? undefined}
            onChange={e => setField('end', e.target.value)}
            style={inputStyle}
          />
        </FieldLabel>
      </div>
      <FieldLabel label="Descriptif">
        <textarea rows={3} value={form.task} onChange={e => setField('task', e.target.value)} style={inputStyle} />
      </FieldLabel>
      <FieldLabel label="Pré-requis">
        <textarea rows={2} value={form.prereq} onChange={e => setField('prereq', e.target.value)} style={inputStyle} />
      </FieldLabel>
      <FieldLabel label="Notes">
        <textarea rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} style={inputStyle} />
      </FieldLabel>

      {error && <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 700, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
        <button onClick={() => { setOpenForm(false); setError('') }} disabled={busy}
          style={{ padding: '10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontWeight: 700, fontSize: 12, cursor: busy ? 'wait' : 'pointer' }}>
          Annuler
        </button>
        <button onClick={submit} disabled={busy}
          style={{ padding: '10px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 800, fontSize: 12, cursor: busy ? 'wait' : 'pointer' }}>
          Envoyer la demande
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────── AdminChangeRequestReview ─────────────────────────── */

interface AdminReviewProps {
  iv: Intervention
  req: TaskChangeRequest
  busy?: boolean
  onReview: (req: TaskChangeRequest, action: ReviewAction, form: TaskChangeForm, comment: string) => Promise<void>
}

function AdminChangeRequestReview({ iv: _iv, req, busy, onReview }: AdminReviewProps) {
  const [form, setForm] = useState<TaskChangeForm>(() => buildRequestFormFromRequest(req))
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setForm(buildRequestFormFromRequest(req))
    setComment('')
    setError('')
  }, [req.id])

  function setField<K extends keyof TaskChangeForm>(key: K, value: TaskChangeForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setError('')
  }

  async function review(action: ReviewAction) {
    if (action !== 'refuse' && form.start && form.end && form.end < form.start) {
      setError('La date de fin ne peut pas être avant la date de début.'); return
    }
    try {
      await onReview(req, action, form, comment)
    } catch (e) {
      setError((e instanceof Error && e.message) || 'Erreur lors du traitement.')
    }
  }

  const changed = getRequestChangedFields(req)

  return (
    <div style={{
      border: '1px solid rgba(249,115,22,.35)', background: 'rgba(249,115,22,.06)',
      borderRadius: 'var(--r-sm)', padding: 12, marginTop: 10, marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Action admin requise</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Mono', monospace" }}>
            Demandée par {req.requested_by_company ?? 'Entreprise'}
            {req.created_at ? ` · ${new Date(req.created_at).toLocaleString('fr-FR')}` : ''}
          </div>
        </div>
        <ChangeRequestStatusBadge status={req.status} />
      </div>

      {changed.length ? (
        <div style={{ display: 'grid', gap: 7, marginBottom: 10 }}>
          {changed.map(f => (
            <div key={f.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', padding: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
                {f.label}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, lineHeight: 1.4 }}>
                <div>
                  <b>Actuel</b><br />
                  <span style={{ color: 'var(--muted)' }}>{changeRequestValueText(f, getChangeRequestValue(req, f, 'old'))}</span>
                </div>
                <div>
                  <b>Proposé</b><br />
                  <span>{changeRequestValueText(f, getChangeRequestValue(req, f, 'new'))}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Aucun écart détecté dans cette demande.</div>
      )}

      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Ajustement admin éventuel</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <FieldLabel label="Date de début">
          <input type="date" value={form.start} onChange={e => setField('start', e.target.value)} style={inputStyle} />
        </FieldLabel>
        <FieldLabel label="Date de fin">
          <input type="date" value={form.end} onChange={e => setField('end', e.target.value)} style={inputStyle} />
        </FieldLabel>
      </div>
      <FieldLabel label="Descriptif">
        <textarea rows={3} value={form.task} onChange={e => setField('task', e.target.value)} style={inputStyle} />
      </FieldLabel>
      <FieldLabel label="Pré-requis">
        <textarea rows={2} value={form.prereq} onChange={e => setField('prereq', e.target.value)} style={inputStyle} />
      </FieldLabel>
      <FieldLabel label="Notes">
        <textarea rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} style={inputStyle} />
      </FieldLabel>
      <FieldLabel label="Commentaire admin">
        <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)}
          placeholder="Motif du refus ou précision d’ajustement…"
          style={inputStyle}
        />
      </FieldLabel>

      {error && <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 700, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <button onClick={() => review('accept')} disabled={busy}
          style={{ padding: '10px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--success, #16A34A)', color: '#fff', fontWeight: 800, fontSize: 12, cursor: busy ? 'wait' : 'pointer' }}>
          Accepter
        </button>
        <button onClick={() => review('adjust')} disabled={busy}
          style={{ padding: '10px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 800, fontSize: 12, cursor: busy ? 'wait' : 'pointer' }}>
          Ajuster
        </button>
        <button onClick={() => review('refuse')} disabled={busy}
          style={{ padding: '10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--danger, #DC2626)', background: 'transparent', color: 'var(--danger, #DC2626)', fontWeight: 800, fontSize: 12, cursor: busy ? 'wait' : 'pointer' }}>
          Refuser
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────── small helpers ─────────────────────────── */

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginTop: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 12,
  fontFamily: 'inherit',
  resize: 'vertical',
}

// re-export the per-field helper so TaskDetail can import everything from one place
export { TASK_CHANGE_FIELDS }
