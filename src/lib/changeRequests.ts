import { fmtDate } from '@/lib/dates'
import type { Intervention, TaskChangeRequest } from '@/types/database'
import {
  TASK_CHANGE_FIELDS,
  type TaskChangeFieldDef,
  type TaskChangeForm,
} from '@/constants/changeRequests'

export function valuesDiffer(a: unknown, b: unknown): boolean {
  return String(a == null ? '' : a).trim() !== String(b == null ? '' : b).trim()
}

export function buildRequestFormFromTask(iv: Intervention): TaskChangeForm {
  return {
    start:  iv.start_date || '',
    end:    iv.end_date   || iv.start_date || '',
    task:   iv.task       || '',
    prereq: iv.prereq     || '',
    notes:  iv.notes      || '',
  }
}

export function buildRequestFormFromRequest(req: TaskChangeRequest): TaskChangeForm {
  return {
    start:  (req.final_start_date || req.new_start_date || '') as string,
    end:    (req.final_end_date   || req.new_end_date   || req.new_start_date || '') as string,
    task:   (req.final_task       || req.new_task       || '') as string,
    prereq: (req.final_prereq     || req.new_prereq     || '') as string,
    notes:  (req.final_notes      || req.new_notes      || '') as string,
  }
}

export function getChangeRequestValue(
  req: TaskChangeRequest,
  field: TaskChangeFieldDef,
  mode: 'old' | 'new' | 'final',
): string {
  if (mode === 'old')   return (req[field.oldKey]   as string | null) || ''
  if (mode === 'final') return (req[field.finalKey] as string | null) || (req[field.newKey] as string | null) || ''
  return (req[field.newKey] as string | null) || ''
}

export function getRequestChangedFields(req: TaskChangeRequest): TaskChangeFieldDef[] {
  return TASK_CHANGE_FIELDS.filter(f => valuesDiffer(req[f.oldKey], req[f.newKey]))
}

export function changeRequestValueText(field: TaskChangeFieldDef, value: string): string {
  if (value == null || value === '') return '—'
  if (field.type === 'date') return fmtDate(String(value))
  return String(value)
}

export function taskChangeWindowText(iv: Intervention): string {
  const min = iv.company_edit_start_min || ''
  const max = iv.company_edit_end_max   || ''
  if (min && max) return `Date au plus tôt pour démarrer la tâche : ${fmtDate(min)}. Date au plus tard pour finir la tâche : ${fmtDate(max)}.`
  if (min)        return `Date au plus tôt pour démarrer la tâche : ${fmtDate(min)}.`
  if (max)        return `Date au plus tard pour finir la tâche : ${fmtDate(max)}.`
  return 'Aucune borne de date définie par l’admin.'
}

export function isDateOutsideTaskChangeWindow(iv: Intervention, ds: string): boolean {
  if (!ds) return false
  if (iv.company_edit_start_min && ds < iv.company_edit_start_min) return true
  if (iv.company_edit_end_max   && ds > iv.company_edit_end_max)   return true
  return false
}

export function validateCompanyDateProposal(iv: Intervention, form: TaskChangeForm): string {
  if (form.start && form.end && form.end < form.start) {
    return 'La date de fin ne peut pas être avant la date de début.'
  }
  if (isDateOutsideTaskChangeWindow(iv, form.start)) {
    return 'La date de début proposée doit respecter la fenêtre autorisée par l’admin : ' + taskChangeWindowText(iv)
  }
  if (isDateOutsideTaskChangeWindow(iv, form.end)) {
    return 'La date de fin proposée doit respecter la fenêtre autorisée par l’admin : ' + taskChangeWindowText(iv)
  }
  return ''
}

export function changedFieldsFromForm(iv: Intervention, form: TaskChangeForm): TaskChangeFieldDef[] {
  const baseline = buildRequestFormFromTask(iv)
  return TASK_CHANGE_FIELDS.filter(f => valuesDiffer(baseline[f.key], form[f.key]))
}
