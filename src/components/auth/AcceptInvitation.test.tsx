import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock('../../lib/supabase', () => ({
    supabase: { rpc, from },
}));

import { AcceptInvitation } from './AcceptInvitation';

describe('AcceptInvitation', () => {
    beforeEach(() => {
        rpc.mockReset();
        from.mockReset();
        const query = {
            is: () => query,
            maybeSingle: async () => ({ data: null, error: null }),
        };
        from.mockReturnValue({
            select: () => ({
                eq: () => query,
            }),
        });
    });

    it('transmet le workspace retourné par l’acceptation à son parent', async () => {
        rpc.mockResolvedValue({ data: [{ workspace_id: 'workspace-invite', role: 'member' }], error: null });
        const onAccepted = vi.fn();
        render(<AcceptInvitation token="inv-token" onAccepted={onAccepted} onSkip={() => undefined} />);

        fireEvent.click(screen.getByRole('button', { name: /Accepter l'invitation/i }));

        await waitFor(() => expect(onAccepted).toHaveBeenCalledWith('workspace-invite'));
    });
});
