import { useState } from 'react';
import { isBotAvatarUrl } from '../../types/botProfile';

export function BotPortrait({ name, url }: { name: string; url?: string | null }) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const className = 'h-12 w-12 shrink-0 rounded-full object-cover';
    if (isBotAvatarUrl(url) && failedUrl !== url) {
        return <img className={className} src={url} alt={`Portrait de ${name || 'ce bot'}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />;
    }
    return <span aria-label={`Portrait non renseigné pour ${name || 'ce bot'}`} className={`${className} flex items-center justify-center bg-slate-100 font-semibold text-slate-600`}>{name.trim().slice(0, 2).toUpperCase() || '?'}</span>;
}
