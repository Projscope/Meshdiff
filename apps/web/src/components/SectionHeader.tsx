interface SectionHeaderProps {
  tag: string;
  title: string;
  description?: string;
}

export default function SectionHeader({ tag, title, description }: SectionHeaderProps) {
  return (
    <div className="mx-auto mb-12 text-center">
      <span className="mb-3 block text-xs font-semibold uppercase tracking-widest text-accent-fg-400">
        {tag}
      </span>
      <h2 className="font-display text-3xl font-bold tracking-tight text-ink-50">{title}</h2>
      {description && (
        <p className="mt-3 text-[15px] leading-relaxed text-ink-400">{description}</p>
      )}
    </div>
  );
}
