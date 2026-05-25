import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrchestratorConfig } from './useOrchestratorConfig';

describe('useOrchestratorConfig', () => {
    beforeEach(() => localStorage.clear());

    it('config par défaut vide → isConfigured false', () => {
        const { result } = renderHook(() => useOrchestratorConfig());
        expect(result.current.config).toEqual({ baseUrl: '', apiKey: '' });
        expect(result.current.isConfigured).toBe(false);
    });

    it('save() persiste et marque comme configuré', () => {
        const { result } = renderHook(() => useOrchestratorConfig());
        act(() => {
            result.current.save({ baseUrl: 'http://o/api', apiKey: 'ok_x' });
        });
        expect(result.current.isConfigured).toBe(true);
        // Recharge dans une autre instance → la persistance fonctionne
        const { result: r2 } = renderHook(() => useOrchestratorConfig());
        expect(r2.current.config.baseUrl).toBe('http://o/api');
        expect(r2.current.config.apiKey).toBe('ok_x');
    });

    it('clear() vide la configuration', () => {
        const { result } = renderHook(() => useOrchestratorConfig());
        act(() => result.current.save({ baseUrl: 'http://o', apiKey: 'k' }));
        act(() => result.current.clear());
        expect(result.current.isConfigured).toBe(false);
        expect(localStorage.getItem('organigrad_orchestrator_config_v1')).toBeNull();
    });

    it('ignore le JSON corrompu', () => {
        localStorage.setItem('organigrad_orchestrator_config_v1', 'not-json');
        const { result } = renderHook(() => useOrchestratorConfig());
        expect(result.current.config).toEqual({ baseUrl: '', apiKey: '' });
    });
});
