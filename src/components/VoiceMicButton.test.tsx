import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceMicButton } from './VoiceMicButton';
import type { VoiceCapture } from '@apps2026/voice-client';

function makeCapture(overrides: Partial<VoiceCapture> = {}): VoiceCapture {
    return {
        supported: true,
        listening: false,
        muted: false,
        start: vi.fn().mockResolvedValue(undefined),
        pushToTalkStart: vi.fn().mockResolvedValue(undefined),
        pushToTalkEnd: vi.fn(),
        mute: vi.fn(),
        unmute: vi.fn(),
        revoke: vi.fn(),
        ...overrides,
    };
}

describe('VoiceMicButton', () => {
    it("ne rend rien quand la capture micro n'est pas supportée (feature-detect honnête)", () => {
        const { container } = render(
            <VoiceMicButton proxyBasePath="http://localhost:3001/api/voice/gateway" capture={makeCapture({ supported: false })} />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('démarre la capture au clic et route les trames PCM vers le proxy paramétré', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
        const capture = makeCapture();
        render(
            <VoiceMicButton
                proxyBasePath="http://localhost:3001/api/voice/gateway"
                capture={capture}
                fetcher={fetcher}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /dicter/i }));
        await waitFor(() => expect(capture.start).toHaveBeenCalledOnce());

        // Simule une trame émise par la capture : elle doit partir vers LE proxy de l'app.
        const options = (capture.start as ReturnType<typeof vi.fn>).mock.calls[0]![0];
        options.onAudioFrame?.(new Float32Array([0.1]), 16_000);
        await waitFor(() =>
            expect(fetcher).toHaveBeenCalledWith(
                'http://localhost:3001/api/voice/gateway/frames',
                expect.objectContaining({ method: 'POST' }),
            ),
        );
    });

    it("arrête l'écoute au second clic (revoke) sans casser l'UI", async () => {
        const capture = makeCapture({ listening: true });
        render(<VoiceMicButton proxyBasePath="/api/voice/gateway" capture={capture} />);

        fireEvent.click(screen.getByRole('button', { name: /arrêter/i }));
        expect(capture.revoke).toHaveBeenCalledOnce();
    });
});
