import shieldUrl from '../../brand/gp-logo/gp-shield.svg';

interface BrandMarkProps {
  className?: string;
}

export default function BrandMark({ className }: BrandMarkProps) {
  return <img src={shieldUrl} alt="GrandProof mark" className={className} />;
}
