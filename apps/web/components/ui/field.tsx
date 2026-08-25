import { cn } from '@/lib/utils';

/**
 * The one form field in the app.
 *
 * §15 says separation comes from flat colour blocks, not borders — that rule
 * is about cards. A field is the opposite kind of thing: it is the hole in the
 * page you are meant to reach into, and it has to look like one wherever it
 * sits. Fields used to take the surface grey, which made them vanish the
 * moment they landed on a surface card (the route sheet is all of them), so
 * they are now always white with a line around them, on white and on colour
 * blocks alike, and the focus ring is the terracotta.
 */
export const fieldClass = [
  'bg-field text-espresso border-field-border w-full rounded-2xl border px-3.5 py-2.5 text-sm',
  'placeholder:text-muted/60 transition-colors outline-none',
  'hover:border-muted/45 focus:border-primary focus:ring-2 focus:ring-primary/25',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');

/**
 * The same field, for a control that wraps a real input — an "@" prefix, a
 * currency, a search icon. The shell draws the box and takes the focus ring;
 * the input inside it goes transparent and borderless.
 *
 * Written out rather than derived from `fieldClass`, because Tailwind reads
 * these files as text: a class name built at runtime is never generated.
 */
export const fieldShellClass = [
  'bg-field text-espresso border-field-border flex w-full items-center rounded-2xl border px-3.5 text-sm',
  'transition-colors hover:border-muted/45',
  'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25',
].join(' ');

/** The input inside a `fieldShellClass` shell — the shell already is the box. */
export const bareInputClass =
  'text-espresso min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldClass, 'resize-y', className)} {...props} />;
}

/** Native chrome on purpose: the OS arrow is the clearest "this opens" there is. */
export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(fieldClass, 'pr-2.5', className)} {...props} />;
}

/** The small caption above a field — every form in the app writes the same one. */
export function FieldLabel({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('text-muted mb-1.5 block text-[11px] font-semibold', className)}
      {...props}
    />
  );
}

/**
 * Label, control, and the note under it that says when a blank is fine.
 *
 * A `<label>` by default, so tapping the caption puts the cursor in the input
 * — which is the whole point on a phone. Pass `group` when the field holds
 * *buttons* rather than one input: a button is a labelable element, so a
 * `<label>` around a stepper hands every stray click — the caption, the hint,
 * the whitespace — to the first button in it. That is how "ชวนเพิ่มทีหลังได้ตลอด"
 * became a second minus button.
 */
export function Field({
  label,
  hint,
  className,
  group = false,
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  /** The field is a set of controls, not one input — renders a div, not a label. */
  group?: boolean;
  children: React.ReactNode;
}) {
  const Tag = group ? 'div' : 'label';

  return (
    <Tag
      className={cn('block', className)}
      {...(group && typeof label === 'string' ? { role: 'group', 'aria-label': label } : {})}
    >
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {children}
      {hint ? <span className="text-muted mt-1 block text-[11px]">{hint}</span> : null}
    </Tag>
  );
}
