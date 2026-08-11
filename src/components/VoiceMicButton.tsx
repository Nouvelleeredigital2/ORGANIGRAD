import { useMemo, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import {
    createVoiceGatewayClient,
    useVoiceCapture,
    type VoiceCapture,
} from '@apps2026/voice-client';

/**
 * Bouton micro Organigrad — premier consommateur du SDK vocal partagé
 * `@apps2026/voice-client` (chantier 4).
 *
 * Les trames PCM captées partent UNIQUEMENT vers le proxy serveur de
 * l'orchestrateur (`{proxyBasePath}/frames`) : aucun jeton fournisseur côté
 * navigateur. Un début de parole pendant une lecture déclenche l'interruption
 * (`{proxyBasePath}/interruption`) — best-effort.
 *
 * BLANC NOMMÉ : le retour de transcription (gateway → texte dans le champ)
 * n'est pas branché tant que le NED Voice Gateway n'est pas configuré côté
 * orchestrateur (NED_VOICE_GATEWAY_URL / NED_VOICE_GATEWAY_TOKEN, A_REMPLIR).
 * Le bouton capte et relaie déjà les trames ; l'état est affiché honnêtement.
 */

export interface VoiceMicButtonProps {
    /** Base du proxy vocal de l'orchestrateur, ex. `${baseUrl}/voice/gateway`. */
    proxyBasePath: string;
    /** Injection de la capture pour les tests ; défaut : useVoiceCapture(). */
    capture?: VoiceCapture;
    /** Injection du transport pour les tests ; défaut : fetch global. */
    fetcher?: typeof fetch;
    /** Notifié quand l'écoute démarre/s'arrête (pour l'UI appelante). */
    onListeningChange?: (listening: boolean) => void;
}

export function VoiceMicButton({ proxyBasePath, capture, fetcher, onListeningChange }: VoiceMicButtonProps) {
    // Hook appelé inconditionnellement (règles des hooks) ; la version injectée
    // par les tests a priorité.
    const hookCapture = useVoiceCapture();
    const active = capture ?? hookCapture;
    const [error, setError] = useState<string | null>(null);
    const gateway = useMemo(
        () => createVoiceGatewayClient({ proxyBasePath, fetcher }),
        [proxyBasePath, fetcher],
    );

    if (!active.supported) return null;

    const stop = () => {
        active.revoke();
        onListeningChange?.(false);
    };

    const start = async () => {
        setError(null);
        try {
            await active.start({
                onAudioFrame: (frame, sampleRate) => {
                    void gateway.postFrames({ pcm: Array.from(frame), sampleRate });
                },
                onEvent: (event) => {
                    if (event.type === 'speech_started') void gateway.postInterruption({ reason: 'barge-in' });
                },
                onError: (err) => setError(err.message),
            });
            onListeningChange?.(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Micro indisponible');
        }
    };

    const listening = active.listening;
    return (
        <button
            type="button"
            onClick={() => (listening ? stop() : void start())}
            aria-label={listening ? "Arrêter la dictée" : 'Dicter au micro'}
            title={error ?? (listening ? "Arrêter la dictée" : 'Dicter au micro (SDK vocal partagé)')}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 8,
                border: '1px solid var(--separator, rgba(0,0,0,0.15))',
                background: listening ? 'var(--system-red)' : 'transparent',
                color: listening ? '#fff' : 'var(--fg-2, currentColor)',
                cursor: 'pointer',
            }}
        >
            {listening ? <Square size={12} strokeWidth={2} /> : <Mic size={13} strokeWidth={1.8} />}
        </button>
    );
}
