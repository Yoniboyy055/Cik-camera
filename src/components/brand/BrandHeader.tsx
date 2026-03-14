import BrandMark from './BrandMark';

interface BrandHeaderProps {
  compact?: boolean;
  subtitle?: string;
}

export default function BrandHeader({ compact = false, subtitle }: BrandHeaderProps) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-16 h-16 bg-brand-primary rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-primary/20">
        <BrandMark className="w-8 h-8" />
      </div>
      <h1 className={`${compact ? 'text-xl' : 'text-2xl'} font-bold text-brand-text`}>GrandProof</h1>
      <p className="text-brand-text-muted text-sm mt-1">Verified Field Evidence Platform</p>
      <p className="text-[11px] text-brand-text-muted/90">Capture. Verify. Prove.</p>
      {subtitle ? <p className="text-brand-text-muted text-sm mt-2">{subtitle}</p> : null}
    </div>
  );
}
