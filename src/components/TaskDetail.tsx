'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Intervention, Zone, Trade, Company, Status, TaskChangeRequest } from '@/types/database'
import { effectiveStatus } from '@/lib/progress'
import { STATUS_META, STATUS_OPTIONS } from '@/constants/status'
import { getTradeColor, getZoneFloorColor } from '@/constants/colors'
import { fmtDate, daysOverdue } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import { NoteFormModal } from './NotesScreen'
import ChangeRequestPanel, { type ChangeRequestSession, type ReviewAction } from './ChangeRequestPanel'
import type { TaskChangeForm } from '@/constants/changeRequests'
import { changedFieldsFromForm } from '@/lib/changeRequests'

interface NoteEntry {
  id: string
  content: string
  author_name: string
  created_at: string
}

interface Props {
  iv: Intervention
  zones: Zone[]
  trades: Trade[]
  companies?: Company[]
  allInterventions: Intervention[]
  readOnly?: boolean
  authorName?: string
  userRole?: 'admin' | 'company' | 'external'
  userCompany?: string | null
  onClose: () => void
  onUpdate: (patch: Partial<Intervention>) => void
  onStartMove?: () => void
  onStartDuplicate?: () => void
}

export default function TaskDetail({ iv, zones, trades, companies = [], allInterventions, readOnly, authorName, userRole = 'admin', userCompany = null, onClose, onUpdate, onStartMove, onStartDuplicate }: Props) {
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteCount,    setNoteCount]    = useState<number | null>(null)

  useEffect(() => {
    supabase.from('notes').select('id', { count: 'exact', head: true }).eq('intervention_id', iv.id).is('deleted_at', null).then(({ count, error }) => {
      if (error) {
        // Fallback for v1 schema (no deleted_at column)
        if ((error as { code?: string }).code === '42703') {
          supabase.from('notes').select('id', { count: 'exact', head: true }).eq('intervention_id', iv.id).then(({ count: c2 }) => setNoteCount(c2 ?? 0))
        }
        return
      }
      setNoteCount(count ?? 0)
    })
  }, [iv.id])
  const [saving, setSaving]   = useState(false)
  const [editing, setEditing] = useState(false)
  const [status, setStatus]   = useState<Status>(iv.status as Status)
  const [notes, setNotes]     = useState(iv.notes ?? '')

  // History notes
  const [notesList, setNotesList]   = useState<NoteEntry[]>([])
  const [newNote, setNewNote]       = useState('')
  const [addingNote, setAddingNote] = useState(false)

  useEffect(() => {
    supabase
      .from('intervention_notes')
      .select('*')
      .eq('intervention_id', iv.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setNotesList(data as NoteEntry[]) })
  }, [iv.id])

  // ─── Change requests ───
  const [changeRequests, setChangeRequests] = useState<TaskChangeRequest[]>([])
  const [crBusy, setCrBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('task_change_requests')
      .select('*')
      .eq('task_id', iv.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setChangeRequests(data as TaskChangeRequest[]) })
  }, [iv.id])

  const session: ChangeRequestSession =
    userRole === 'admin'
      ? { role: 'admin',    company_name: null,                user_name: authorName ?? null }
      : userRole === 'company'
      ? { role: 'company',  company_name: userCompany ?? '',   user_name: authorName ?? null }
      : { role: 'external', company_name: userCompany ?? null, user_name: authorName ?? null }

  const handleSubmitChangeRequest = useCallback(async (target: Intervention, form: TaskChangeForm) => {
    if (session.role !== 'company' || session.company_name !== target.company) {
      throw new Error('Vous ne pouvez modifier que les tâches de votre entreprise.')
    }
    if (!target.company_edit_allowed) {
      throw new Error('Cette tâche n’a pas été ouverte à modification par l’admin.')
    }
    if (changeRequests.some(r => r.status === 'pending_admin')) {
      throw new Error('Une demande est déjà en attente sur cette tâche.')
    }
    const changed = changedFieldsFromForm(target, form)
    if (!changed.length) throw new Error('Aucune modification détectée.')

    setCrBusy(true)
    try {
      const nowIso = new Date().toISOString()
      const row = {
        task_id: target.id,
        task_number: target.task_number || '',
        task_company: target.company || '',
        requested_by_company: session.company_name,
        requested_by_contact: session.user_name ?? '',
        status: 'pending_admin' as const,
        old_start_date: target.start_date || null,
        old_end_date:   target.end_date   || target.start_date || null,
        old_task:       target.task       || '',
        old_prereq:     target.prereq     || '',
        old_notes:      target.notes      || '',
        new_start_date: form.start || null,
        new_end_date:   form.end   || form.start || null,
        new_task:       form.task   || '',
        new_prereq:     form.prereq || '',
        new_notes:      form.notes  || '',
        created_at: nowIso,
        updated_at: nowIso,
        payload: {
          changed_fields: changed.map(c => c.key),
          company_edit_allowed: !!target.company_edit_allowed,
          company_edit_start_min: target.company_edit_start_min ?? null,
          company_edit_end_max:   target.company_edit_end_max   ?? null,
        },
      }
      const { data, error } = await supabase
        .from('task_change_requests')
        .insert(row)
        .select()
        .single()
      if (error) throw new Error(error.message)
      if (data) setChangeRequests(prev => [data as TaskChangeRequest, ...prev])

      // Notif → admin
      await supabase.from('notifications').insert({
        recipient_role: 'admin',
        intervention_id: target.id,
        task_name: target.task,
        message: `Modification demandée par ${session.company_name} · ${target.task_number || target.task}`,
      })
    } finally {
      setCrBusy(false)
    }
  }, [session, changeRequests])

  const handleReviewChangeRequest = useCallback(async (
    req: TaskChangeRequest,
    action: ReviewAction,
    form: TaskChangeForm,
    comment: string,
  ) => {
    if (session.role !== 'admin') throw new Error('Action réservée à l’admin.')
    setCrBusy(true)
    try {
      const nowIso = new Date().toISOString()
      const isRefuse = action === 'refuse'
      const newStatus = action === 'refuse' ? 'refused' : action === 'adjust' ? 'adjusted_accepted' : 'accepted'
      const patch = {
        status: newStatus,
        admin_decision: action,
        admin_comment: comment || null,
        reviewed_by: session.user_name ?? 'Admin',
        reviewed_at: nowIso,
        final_start_date: isRefuse ? null : (form.start || null),
        final_end_date:   isRefuse ? null : (form.end   || form.start || null),
        final_task:       isRefuse ? null : (form.task   || ''),
        final_prereq:     isRefuse ? null : (form.prereq || ''),
        final_notes:      isRefuse ? null : (form.notes  || ''),
        updated_at: nowIso,
      }
      const { data, error } = await supabase
        .from('task_change_requests')
        .update(patch)
        .eq('id', req.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      if (data) setChangeRequests(prev => prev.map(r => r.id === req.id ? (data as TaskChangeRequest) : r))

      if (!isRefuse) {
        const ivPatch: Partial<Intervention> = {
          start_date: form.start || null,
          end_date:   form.end   || form.start || null,
          task:       form.task   || iv.task,
          prereq:     form.prereq || '',
          notes:      form.notes  || '',
        }
        const { error: e2 } = await supabase.from('interventions').update(ivPatch).eq('id', iv.id)
        if (!e2) onUpdate(ivPatch)
      }

      // Notif → entreprise demandeuse
      const label = action === 'accept' ? 'acceptée' : action === 'adjust' ? 'ajustée puis validée' : 'refusée'
      if (req.requested_by_company) {
        await supabase.from('notifications').insert({
          recipient_role: 'company',
          recipient_company: req.requested_by_company,
          intervention_id: iv.id,
          task_name: iv.task,
          message: `Votre demande de modification a été ${label}${comment ? ' · ' + comment : ''}`,
        })
      }
    } finally {
      setCrBusy(false)
    }
  }, [session, iv.id, iv.task, onUpdate])

  // Edit-mode fields
  const [editTask,      setEditTask]      = useState(iv.task ?? '')
  const [editZone,      setEditZone]      = useState(iv.zone ?? '')
  const [editTrade,     setEditTrade]     = useState(iv.trade ?? '')
  const [editCompany,   setEditCompany]   = useState(iv.company ?? '')
  const [editStartDate, setEditStartDate] = useState(iv.start_date ?? '')
  const [editEndDate,   setEditEndDate]   = useState(iv.end_date ?? '')
  const [editOffDays,   setEditOffDays]   = useState<string[]>(iv.off_days ?? [])
  const [newOffDay,     setNewOffDay]     = useState('')
  const [editCEAllowed, setEditCEAllowed] = useState<boolean>(!!iv.company_edit_allowed)
  const [editCEMin,     setEditCEMin]     = useState<string>(iv.company_edit_start_min ?? '')
  const [editCEMax,     setEditCEMax]     = useState<string>(iv.company_edit_end_max   ?? '')

  const zone  = zones.find(z => z.id === (editing ? editZone : iv.zone))
  const trade = trades.find(t => t.id === (editing ? editTrade : iv.trade))
  const tc    = getTradeColor(trade?.color ?? 'blue')
  const es    = effectiveStatus(iv)
  const sm    = STATUS_META[es]
  const zoneColor = zone ? getZoneFloorColor(zones, zone.floor) : '#9CA3AF'

  const predecessor = iv.predecessor_id ? allInterventions.find(x => x.id === iv.predecessor_id) : null
  const successors  = (iv.successor_ids ?? []).map(id => allInterventions.find(x => x.id === id)).filter(Boolean) as Intervention[]

  const hasChanges = editing
    ? editTask !== (iv.task ?? '') || editZone !== (iv.zone ?? '') || editTrade !== (iv.trade ?? '') ||
      editCompany !== (iv.company ?? '') || editStartDate !== (iv.start_date ?? '') || editEndDate !== (iv.end_date ?? '') ||
      JSON.stringify(editOffDays.slice().sort()) !== JSON.stringify((iv.off_days ?? []).slice().sort()) ||
      editCEAllowed !== !!iv.company_edit_allowed ||
      editCEMin !== (iv.company_edit_start_min ?? '') ||
      editCEMax !== (iv.company_edit_end_max ?? '') ||
      status !== iv.status || notes !== (iv.notes ?? '')
    : status !== iv.status || notes !== (iv.notes ?? '')

  function handleTradeChange(newTradeId: string) {
    setEditTrade(newTradeId)
    const firstCompany = trades.find(t => t.id === newTradeId)
    if (firstCompany) setEditCompany('')
  }

  async function handleSave() {
    setSaving(true)
    const patch: Partial<Intervention> = editing
      ? {
          status, notes, task: editTask, zone: editZone, trade: editTrade, company: editCompany,
          start_date: editStartDate || null, end_date: editEndDate || null, off_days: editOffDays,
          company_edit_allowed:   editCEAllowed,
          company_edit_start_min: editCEAllowed ? (editCEMin || null) : null,
          company_edit_end_max:   editCEAllowed ? (editCEMax || null) : null,
        }
      : { status, notes }
    const { error } = await supabase.from('interventions').update(patch).eq('id', iv.id)
    setSaving(false)
    if (!error) { setEditing(false); onUpdate(patch) }
  }

  const canAddNote = !readOnly || (!!authorName && iv.company === authorName)

  async function handleAddNote() {
    if (!newNote.trim()) return
    setAddingNote(true)
    const entry = { intervention_id: iv.id, content: newNote.trim(), author_name: authorName ?? 'Anonyme' }
    const { data, error } = await supabase.from('intervention_notes').insert(entry).select().single()
    if (!error && data) {
      setNotesList(prev => [...prev, data as NoteEntry])
      setNewNote('')
      // Notifications
      if (readOnly && iv.company) {
        await supabase.from('notifications').insert({
          recipient_role: 'admin',
          intervention_id: iv.id,
          task_name: iv.task,
          message: `${authorName} a ajouté une note sur « ${iv.task} »`,
        })
      } else if (!readOnly && iv.company) {
        await supabase.from('notifications').insert({
          recipient_role: 'company',
          recipient_company: iv.company,
          intervention_id: iv.id,
          task_name: iv.task,
          message: `Nouvelle note sur « ${iv.task} »`,
        })
      }
    }
    setAddingNote(false)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, backdropFilter: 'blur(2px)' }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: 'var(--surface)', borderRadius: '16px 16px 0 0',
        boxShadow: '0 -8px 32px rgba(0,0,0,.18)',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        animation: 'slideUp .22s ease-out',
      }}>
        {/* Handle */}
        <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: tc.b, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {iv.task_number && (
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--xmuted)', background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>
                  {iv.task_number}
                </span>
              )}
              {zone && !editing && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, color: zoneColor, background: zoneColor + '18', border: `1px solid ${zoneColor}40` }}>
                  {zone.short}
                </span>
              )}
              {trade && !editing && (
                <span style={{ fontSize: 10, color: tc.t, background: tc.bg, padding: '1px 6px', borderRadius: 4, fontWeight: 500, border: `1px solid ${tc.b}30` }}>
                  {trade.short}
                </span>
              )}
              <span style={{ fontSize: 10, fontWeight: 600, color: sm.dot, background: sm.bg, padding: '2px 7px', borderRadius: 10 }}>
                {sm.label}
              </span>
            </div>
            {editing ? (
              <input
                value={editTask}
                onChange={e => setEditTask(e.target.value)}
                style={{ width: '100%', fontSize: 15, fontWeight: 700, color: 'var(--text)', border: '1px solid var(--primary)', borderRadius: 6, padding: '5px 8px', background: 'var(--surface-2)', fontFamily: "'DM Sans', sans-serif" }}
              />
            ) : (
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{iv.task}</div>
            )}
            {!editing && (
              <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Mono', monospace", marginTop: 4 }}>
                {fmtDate(iv.start_date)}{iv.end_date && iv.end_date !== iv.start_date ? ` → ${fmtDate(iv.end_date)}` : ''}
                {iv.company && ` · ${iv.company}`}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            <button onClick={onClose} style={{ border: 'none', background: 'var(--surface-2)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }}>×</button>
            {!readOnly && <button onClick={() => setEditing(e => !e)} style={{ border: `1px solid ${editing ? 'var(--primary)' : 'var(--border)'}`, background: editing ? 'var(--primary-l)' : 'var(--surface-2)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 13, color: editing ? 'var(--primary)' : 'var(--muted)' }}>✎</button>}
            <button
              onClick={() => setShowNoteForm(true)}
              title={noteCount && noteCount > 0 ? `${noteCount} note${noteCount > 1 ? 's' : ''} sur cette tâche — cliquer pour ajouter` : 'Créer une note sur cette tâche'}
              style={{
                position: 'relative',
                border: '1px solid #DDD6FE',
                background: '#F5F3FF',
                borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
                fontSize: 14, color: '#5B21B6',
              }}
            >
              📝
              {noteCount !== null && noteCount > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -5,
                  background: '#7C3AED', color: '#fff', borderRadius: 99,
                  fontSize: 9, fontWeight: 800, minWidth: 16, height: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                  border: '1.5px solid var(--surface)',
                }}>{noteCount > 9 ? '9+' : noteCount}</span>
              )}
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

          {/* Late warning */}
          {es === 'en_retard' && (
            <div style={{ background: '#FFF7ED', border: '1px solid rgba(234,88,12,.3)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>⏱</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#9A3412' }}>
                En retard de {daysOverdue(iv)} jour{daysOverdue(iv) > 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Prereq */}
          {iv.prereq?.trim() && (
            <div style={{ background: '#FEF2F2', border: '1px solid rgba(220,38,38,.25)', borderLeft: '3px solid #DC2626', borderRadius: 'var(--r-xs)', padding: '8px 10px', marginBottom: 10, fontSize: 12, color: '#991B1B' }}>
              ⚠ Prérequis : {iv.prereq}{iv.prereq_company ? ` · ${iv.prereq_company}` : ''}
            </div>
          )}

          {/* Dependencies */}
          {predecessor && (
            <InfoRow label="Prédécesseur">
              <DepBadge iv={predecessor} zones={zones} trades={trades} />
            </InfoRow>
          )}
          {successors.length > 0 && (
            <InfoRow label={`Successeur${successors.length > 1 ? 's' : ''}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {successors.map(s => <DepBadge key={s.id} iv={s} zones={zones} trades={trades} />)}
              </div>
            </InfoRow>
          )}

          {/* Off days */}
          {(editing || (iv.off_days && iv.off_days.length > 0)) && (
            <InfoRow label="Jours gelés">
              {editing ? (
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: editOffDays.length > 0 ? 8 : 0 }}>
                    {editOffDays.sort().map(d => (
                      <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(220,38,38,.1)', border: '1px solid rgba(220,38,38,.3)', borderRadius: 20, padding: '3px 8px', fontSize: 12, color: '#991B1B' }}>
                        {fmtDate(d)}
                        <button onClick={() => setEditOffDays(prev => prev.filter(x => x !== d))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="date" value={newOffDay} onChange={e => setNewOffDay(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                    <button
                      onClick={() => { if (newOffDay && !editOffDays.includes(newOffDay)) { setEditOffDays(prev => [...prev, newOffDay]); setNewOffDay('') } }}
                      style={{ padding: '7px 14px', borderRadius: 'var(--r-xs)', border: '1px solid var(--primary)', background: 'var(--primary-l)', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >+ Ajouter</button>
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--danger)' }}>
                  {iv.off_days!.map(d => fmtDate(d)).join(', ')}
                </span>
              )}
            </InfoRow>
          )}

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 14px' }} />

          {/* Edit mode fields */}
          {editing && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>Zone</label>
                  <select value={editZone} onChange={e => setEditZone(e.target.value)} style={inputStyle}>
                    <option value="">— Sans zone —</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.short}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Corps de métier</label>
                  <select value={editTrade} onChange={e => handleTradeChange(e.target.value)} style={inputStyle}>
                    <option value="">— Sans trade —</option>
                    {trades.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Entreprise</label>
                <input value={editCompany} onChange={e => setEditCompany(e.target.value)} style={inputStyle} placeholder="Nom de l'entreprise" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>Début</label>
                  <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Fin</label>
                  <input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
              {/* Modification entreprise (Change Requests) */}
              <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--r-sm)', padding: 10, background: 'var(--surface-2)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editCEAllowed}
                    onChange={e => setEditCEAllowed(e.target.checked)}
                  />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    Autoriser l’entreprise à demander une modification
                  </span>
                </label>
                {editCEAllowed && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    <div>
                      <label style={labelStyle}>Au plus tôt</label>
                      <input type="date" value={editCEMin} max={editCEMax || undefined} onChange={e => setEditCEMin(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Au plus tard</label>
                      <input type="date" value={editCEMax} min={editCEMin || undefined} onChange={e => setEditCEMax(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
                  Si activé, l’entreprise verra un bouton « Demander une modification » sur cette tâche. Les dates min/max bornent les dates proposables.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Note interne</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', marginTop: 4 }}
                  placeholder="Note interne (admin)…"
                />
              </div>
            </div>
          )}

          {/* Change requests */}
          <ChangeRequestPanel
            iv={iv}
            requests={changeRequests}
            session={session}
            busy={crBusy}
            onSubmit={handleSubmitChangeRequest}
            onReview={handleReviewChangeRequest}
          />

          {/* Statut */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Statut</label>
            {readOnly ? (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: sm.dot, background: sm.bg, padding: '4px 12px', borderRadius: 20, border: `1px solid ${sm.dot}40` }}>
                  {sm.label}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {STATUS_OPTIONS.map(s => {
                  const m = STATUS_META[s]
                  const active = status === s
                  return (
                    <button
                      key={s}
                      onClick={() => setStatus(s)}
                      style={{
                        padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1px solid ${active ? m.dot : 'var(--border)'}`,
                        background: active ? m.bg : 'var(--surface-2)',
                        color: active ? m.dot : 'var(--muted)',
                        transition: 'all .12s',
                      }}
                    >{m.label}</button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Notes historique */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Notes & suivi</label>

            {/* Historique */}
            {notesList.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, marginBottom: 10 }}>
                {notesList.map(n => (
                  <div key={n.id} style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${tc.b}`,
                    borderRadius: 'var(--r-xs)',
                    padding: '9px 11px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: tc.b }}>{n.author_name}</span>
                      <span style={{ fontSize: 10, color: 'var(--xmuted)', fontFamily: "'DM Mono', monospace" }}>
                        {new Date(n.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, fontWeight: 500 }}>
                      {n.content}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Formulaire ajout — seulement si autorisé */}
            {canAddNote && <div style={{
              background: 'var(--surface-2)',
              border: `1px solid ${newNote.trim() ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 'var(--r-xs)',
              padding: '10px 12px',
              transition: 'border-color .15s',
            }}>
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                rows={2}
                placeholder="Ajouter une note ou un commentaire…"
                style={{
                  width: '100%', border: 'none', background: 'transparent',
                  color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                  resize: 'none', outline: 'none', lineHeight: 1.5,
                  boxSizing: 'border-box',
                }}
              />
              {newNote.trim() && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                  <button
                    onClick={handleAddNote}
                    disabled={addingNote}
                    style={{
                      padding: '6px 16px', borderRadius: 'var(--r-xs)', border: 'none',
                      background: 'var(--primary)', color: '#fff',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >{addingNote ? 'Envoi…' : 'Publier'}</button>
                </div>
              )}
            </div>}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          {!readOnly && (onStartMove || onStartDuplicate) && (
            <div style={{ display: 'flex', gap: 8 }}>
              {onStartMove && (
                <button onClick={onStartMove} style={{ flex: 1, padding: '9px 0', borderRadius: 'var(--r-sm)', border: '1px solid #3B82F6', background: '#EFF6FF', color: '#1D4ED8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  ↕ Déplacer
                </button>
              )}
              {onStartDuplicate && (
                <button onClick={onStartDuplicate} style={{ flex: 1, padding: '9px 0', borderRadius: 'var(--r-sm)', border: '1px solid #22C55E', background: '#F0FDF4', color: '#15803D', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  ⊕ Dupliquer
                </button>
              )}
            </div>
          )}
          {readOnly ? (
            <button onClick={onClose} style={{ padding: '11px 0', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Fermer
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                style={{
                  flex: 2, padding: '11px 0', borderRadius: 'var(--r-sm)', border: 'none',
                  background: hasChanges ? 'var(--primary)' : 'var(--border)',
                  color: hasChanges ? '#fff' : 'var(--muted)',
                  fontSize: 14, fontWeight: 700, cursor: hasChanges ? 'pointer' : 'default',
                  transition: 'background .15s',
                }}
              >{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          )}
        </div>
      </div>

      {showNoteForm && (
        <NoteFormModal
          mode="intervention"
          iv={iv}
          zones={zones}
          trades={trades}
          companies={companies}
          authorName={authorName ?? 'Admin'}
          onClose={() => setShowNoteForm(false)}
        />
      )}
    </>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      {children}
    </div>
  )
}

function DepBadge({ iv, zones, trades }: { iv: Intervention; zones: Zone[]; trades: Trade[] }) {
  const trade = trades.find(t => t.id === iv.trade)
  const zone  = zones.find(z => z.id === iv.zone)
  const es    = effectiveStatus(iv)
  const sm    = STATUS_META[es]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', background: 'var(--surface-2)', borderRadius: 6, padding: '5px 8px', border: '1px solid var(--border)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.dot, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ fontWeight: 500 }}>{iv.task_number ?? iv.id}</span>
      <span style={{ color: 'var(--muted)' }}>{iv.task?.slice(0, 40)}{(iv.task?.length ?? 0) > 40 ? '…' : ''}</span>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 'var(--r-xs)',
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
  boxSizing: 'border-box',
}
