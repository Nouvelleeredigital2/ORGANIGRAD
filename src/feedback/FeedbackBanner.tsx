import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { FeedbackMessage, FeedbackTone } from './FeedbackContext';

const TONE_CLASSES: Record<FeedbackTone, string> = {
    success: 'bg-green-50/95 border-green-200 text-green-700',
    warning: 'bg-orange-50/95 border-orange-200 text-orange-700',
    error: 'bg-red-50/95 border-red-200 text-red-600',
    info: 'bg-slate-50/95 border-slate-200 text-slate-700',
};

const TONE_ICONS: Record<FeedbackTone, typeof AlertCircle> = {
    success: CheckCircle2,
    warning: AlertCircle,
    error: AlertCircle,
    info: Info,
};

interface FeedbackBannerProps {
    messages: FeedbackMessage[];
    onDismiss: (id: string) => void;
}

/**
 * Pile de messages, en bas et au centre.
 *
 * `role="alert"` pour warning/error (interruption immédiate du lecteur d'écran),
 * `role="status"` pour le reste (annonce polie). `print:hidden` et position fixe
 * hors du conteneur exportable : le bandeau ne doit jamais finir dans un PDF.
 */
export function FeedbackBanner({ messages, onDismiss }: FeedbackBannerProps) {
    if (messages.length === 0) return null;

    return (
        <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col-reverse items-center gap-2 print:hidden">
            {messages.map((m) => {
                const Icon = TONE_ICONS[m.tone];
                const isAlert = m.tone === 'error' || m.tone === 'warning';

                return (
                    <div
                        key={m.id}
                        role={isAlert ? 'alert' : 'status'}
                        className={`flex max-w-xl items-start gap-3 rounded-2xl border px-5 py-4 shadow-xl backdrop-blur-md ${TONE_CLASSES[m.tone]}`}
                    >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="text-xs font-bold leading-relaxed">{m.message}</p>
                        <button
                            type="button"
                            onClick={() => onDismiss(m.id)}
                            aria-label="Fermer le message"
                            className="ml-2 shrink-0 opacity-60 transition-opacity hover:opacity-100"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
