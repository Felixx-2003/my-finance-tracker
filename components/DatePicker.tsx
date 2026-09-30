'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

type Props = { value: string; onChange: (event: { target: { value: string } }) => void; ariaLabel?: string };
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const display = (value: string) => value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : 'Choose date';

export default function DatePicker({ value, onChange, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => value ? new Date(`${value}T12:00:00`) : new Date());
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = (first.getDay()+6)%7;
  const days = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
  const choose = (date: Date) => { onChange({ target: { value: iso(date) } }); setOpen(false); };
  const shift = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth()+delta, 1));
  return <div className={`date-picker ${open?'open':''}`} ref={root}>
    <button type="button" className="date-trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setMonth(value ? new Date(`${value}T12:00:00`) : new Date()); setOpen(!open); }}><CalendarDays size={17}/><span>{display(value)}</span></button>
    {open && <div className="calendar-popover" role="dialog" aria-label="Choose date">
      <div className="calendar-head"><button type="button" aria-label="Previous month" onClick={()=>shift(-1)}><ChevronLeft size={18}/></button><strong>{new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'}).format(month)}</strong><button type="button" aria-label="Next month" onClick={()=>shift(1)}><ChevronRight size={18}/></button></div>
      <div className="calendar-grid">{['M','T','W','T','F','S','S'].map((day,i)=><span key={i} className="calendar-weekday">{day}</span>)}{Array.from({length:start},(_,i)=><span key={`blank-${i}`}/>)}{Array.from({length:days},(_,i)=>{const day=i+1;const date=new Date(month.getFullYear(),month.getMonth(),day);const key=iso(date);return <button type="button" key={key} className={`${value===key?'selected':''} ${iso(new Date())===key?'today':''}`} aria-label={new Intl.DateTimeFormat('en-GB',{dateStyle:'full'}).format(date)} aria-pressed={value===key} onClick={()=>choose(date)}>{day}</button>})}</div>
      <button type="button" className="calendar-today" onClick={()=>choose(new Date())}>Today</button>
    </div>}
  </div>;
}
