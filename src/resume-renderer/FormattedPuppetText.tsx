import type { ReactNode } from 'react';

export function FormattedPuppetText({ value, allowBold = false, allowUnderline = false, maxBold = 0, maxUnderline = 0 }: { value: string; allowBold?: boolean; allowUnderline?: boolean; maxBold?: number; maxUnderline?: number }) {
  let boldCount = 0; let underlineCount = 0;
  return <>{value.split(/(<b>.*?<\/b>|<u>.*?<\/u>)/gi).map((token, index): ReactNode => {
    const bold = /^<b>(.*?)<\/b>$/i.exec(token); if (bold) { boldCount += 1; return allowBold && boldCount <= maxBold ? <strong key={index}>{bold[1]}</strong> : bold[1]; }
    const underline = /^<u>(.*?)<\/u>$/i.exec(token); if (underline) { underlineCount += 1; return allowUnderline && underlineCount <= maxUnderline ? <u key={index}>{underline[1]}</u> : underline[1]; }
    return token;
  })}</>;
}
