import { describe, it, expect } from 'vitest';
import { FixedWindowRateLimiter, unlimitedRateLimiter } from '../src/observability/rateLimiter.js';

describe('FixedWindowRateLimiter', () => {
    it('autorise jusqu\'à max puis bloque dans la fenêtre', () => {
        let t = 1000;
        const rl = new FixedWindowRateLimiter({ max: 2, windowMs: 1000, now: () => t });
        expect(rl.tryConsume('ws')).toBe(true);
        expect(rl.tryConsume('ws')).toBe(true);
        expect(rl.tryConsume('ws')).toBe(false);
    });

    it('réinitialise après la fenêtre', () => {
        let t = 0;
        const rl = new FixedWindowRateLimiter({ max: 1, windowMs: 1000, now: () => t });
        expect(rl.tryConsume('ws')).toBe(true);
        expect(rl.tryConsume('ws')).toBe(false);
        t += 1000;
        expect(rl.tryConsume('ws')).toBe(true);
    });

    it('isole les clés', () => {
        const t = 0;
        const rl = new FixedWindowRateLimiter({ max: 1, windowMs: 1000, now: () => t });
        expect(rl.tryConsume('a')).toBe(true);
        expect(rl.tryConsume('b')).toBe(true);
        expect(rl.tryConsume('a')).toBe(false);
    });

    it('unlimitedRateLimiter autorise toujours', () => {
        for (let i = 0; i < 100; i++) expect(unlimitedRateLimiter.tryConsume('x')).toBe(true);
    });
});
