import type { ChangeRequestStatus, TaskChangeRequest } from '@/types/database'

export interface ChangeRequestStatusMeta {
  label: string
  short: string
  dot: string
  text: string
  bg: string
}

export const CHANGE_REQUEST_STATUS_META: Record<ChangeRequestStatus, ChangeRequestStatusMeta> = {
  pending_admin:     { label: 'Tâche modifiée par l’entreprise', short: 'Modif. entreprise', dot: '#F97316', text: '#9A3412', bg: 'rgba(249,115,22,.12)' },
  accepted:          { label: 'Modification acceptée',           short: 'Acceptée',         dot: '#16A34A', text: '#166534', bg: 'rgba(22,163,74,.12)' },
  refused:           { label: 'Modification refusée',            short: 'Refusée',          dot: '#DC2626', text: '#991B1B', bg: 'rgba(220,38,38,.12)' },
  adjusted_accepted: { label: 'Ajustée puis validée',            short: 'Ajustée validée',  dot: '#2563EB', text: '#1D4ED8', bg: 'rgba(37,99,235,.12)' },
}

export type TaskChangeFieldKey  = 'start' | 'end' | 'task' | 'prereq' | 'notes'
export type TaskChangeFieldType = 'date' | 'text' | 'textarea'

export interface TaskChangeFieldDef {
  key:      TaskChangeFieldKey
  label:    string
  oldKey:   keyof TaskChangeRequest
  newKey:   keyof TaskChangeRequest
  finalKey: keyof TaskChangeRequest
  type:     TaskChangeFieldType
}

export const TASK_CHANGE_FIELDS: TaskChangeFieldDef[] = [
  { key: 'start',  label: 'Date de début', oldKey: 'old_start_date', newKey: 'new_start_date', finalKey: 'final_start_date', type: 'date' },
  { key: 'end',    label: 'Date de fin',   oldKey: 'old_end_date',   newKey: 'new_end_date',   finalKey: 'final_end_date',   type: 'date' },
  { key: 'task',   label: 'Descriptif',    oldKey: 'old_task',       newKey: 'new_task',       finalKey: 'final_task',       type: 'textarea' },
  { key: 'prereq', label: 'Pré-requis',    oldKey: 'old_prereq',     newKey: 'new_prereq',     finalKey: 'final_prereq',     type: 'textarea' },
  { key: 'notes',  label: 'Notes',         oldKey: 'old_notes',      newKey: 'new_notes',      finalKey: 'final_notes',      type: 'textarea' },
]

export type TaskChangeForm = Record<TaskChangeFieldKey, string>
