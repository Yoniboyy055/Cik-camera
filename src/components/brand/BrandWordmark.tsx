import wordmarkUrl from '../../brand/gp-logo/gp-wordmark.svg';

interface BrandWordmarkProps {
  className?: string;
}

export default function BrandWordmark({ className }: BrandWordmarkProps) {
  return <img src={wordmarkUrl} alt="GrandProof wordmark" className={className} />;
}
