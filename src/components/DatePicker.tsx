import { trapDialogFocus } from './dialogFocus'
import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { displayDate, shiftSchoolDate } from '../lib/historyDates'

export function DatePicker({ id, label, value, onChange, invalid }: { id: string; label: string; value: string; onChange: (value: string) => void; invalid?: boolean }) {
  const [open, setOpen] = useState(false)
  return <div><label id={`${id}-label`} htmlFor={id}>{label}</label><button id={id} type="button" className="date-trigger numeric" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-invalid={invalid} aria-describedby={invalid ? 'history-range-error' : undefined} onClick={event => { event.currentTarget.focus(); setOpen(true) }}><span id={`${id}-value`}>{displayDate(value)}</span><CalendarDays size={16} aria-hidden="true" /></button>{open && <CalendarDialog label={label} value={value} onChange={onChange} close={() => setOpen(false)} />}</div>
}
function CalendarDialog({ label, value, onChange, close }: { label: string; value: string; onChange: (value: string) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [month, setMonth] = useState(value.slice(0, 7))
  const [focused, setFocused] = useState(value)
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const element = dialog.current!
    element.showModal()
    element.querySelector<HTMLButtonElement>(`[data-date="${value}"]`)?.focus()
    return () => { element.close(); trigger?.focus() }
  }, [value])
  useEffect(() => { dialog.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus() }, [focused])
  const first = `${month}-01`
  const offset = (new Date(`${first}T12:00Z`).getUTCDay() + 6) % 7
  const monthLabel = new Intl.DateTimeFormat('es-EC', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${first}T12:00Z`))
  const moveMonth = (direction: number) => { const date = new Date(`${first}T12:00Z`); date.setUTCMonth(date.getUTCMonth() + direction); setMonth(date.toISOString().slice(0, 7)) }
  return <dialog ref={dialog} onKeyDown={trapDialogFocus} className="date-dialog" aria-labelledby="calendar-title" onCancel={event => { event.preventDefault(); close() }}>
    <div className="dialog-heading"><h2 id="calendar-title">{label}: selecciona una fecha</h2><button type="button" className="icon-button" aria-label="Cerrar calendario" onClick={close}><X size={18} /></button></div>
    <div className="calendar-month"><button type="button" className="icon-button" aria-label="Mes anterior" onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button><strong aria-live="polite">{monthLabel}</strong><button type="button" className="icon-button" aria-label="Mes siguiente" onClick={() => moveMonth(1)}><ChevronRight size={18} /></button></div>
    <div className="calendar-weekdays" aria-hidden="true">{['Lu','Ma','Mi','Ju','Vi','Sá','Do'].map(day => <span key={day}>{day}</span>)}</div>
    <div className="calendar-days" aria-label={monthLabel}>{Array.from({ length: 42 }, (_, i) => {
      const date = shiftSchoolDate(first, i - offset)
      return <button type="button" key={date} data-date={date} className={`${date.slice(0, 7) !== month ? 'other-month' : ''}${date === value ? ' selected' : ''}`} aria-label={displayDate(date)} aria-pressed={date === value} tabIndex={date === focused || (focused.slice(0, 7) !== month && date === first) ? 0 : -1} onClick={() => { onChange(date); close() }} onKeyDown={event => {
        const movement = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]
        if (movement !== undefined) { event.preventDefault(); const next = shiftSchoolDate(date, movement); setFocused(next); setMonth(next.slice(0, 7)) }
        if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); const day = (new Date(`${date}T12:00Z`).getUTCDay() + 6) % 7; const next = shiftSchoolDate(date, event.key === 'Home' ? -day : 6 - day); setFocused(next); setMonth(next.slice(0, 7)) }
      }}>{Number(date.slice(-2))}</button>
    })}</div>
  </dialog>
}
