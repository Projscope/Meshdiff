interface SectionHeaderProps {
  tag: string;
  title: string;
  description?: string;
}

export default function SectionHeader({ tag, title, description }: SectionHeaderProps) {
  return (
    <div className="mx-auto mb-12 max-w-xl text-center">
      <span className="mb-3 block text-xs font-semibold uppercase tracking-widest text-emerald-500">
        {tag}
      </span>
      <h2 className="text-3xl font-bold tracking-tight text-white">{title}</h2>
      {description && (
        <p className="mt-3 text-[15px] leading-relaxed text-neutral-400">{description}</p>
      )}
    </div>
  );
}
