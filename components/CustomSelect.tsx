'use client';

import { Children, isValidElement, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

type Props = { value: string | number; onChange: (event: { target: { value: string } }) => void; children: React.ReactNode; ariaLabel?: string };

export default function CustomSelect({ value, onChange, children, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const options = Children.toArray(children).filter(isValidElement).map(child => {
    const props = child.props as { value?: string | number; children?: React.ReactNode };
    return { value: String(props.value ?? props.children ?? ''), label: props.children };
  });
  const selected = options.find(option => option.value === String(value));

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  return <div className={`custom-select ${open ? 'open' : ''}`} ref={root}>
    <button type="button" className="select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>{selected?.label ?? 'Choose an option'}</span><ChevronDown size={17} />
    </button>
    {open && <div className="select-options" role="listbox" aria-label={ariaLabel}>
      {options.map(option => <button type="button" role="option" aria-selected={option.value === String(value)} key={option.value} onClick={() => { onChange({ target: { value: option.value } }); setOpen(false); }}>
        <span>{option.label}</span>{option.value === String(value) && <Check size={16} />}
      </button>)}
    </div>}
  </div>;
}
