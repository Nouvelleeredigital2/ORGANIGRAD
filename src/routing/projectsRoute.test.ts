import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAppRoute, serializeAppRoute } from './appUrl';

afterEach(() => vi.unstubAllEnvs());
describe('projects feature route gate', () => {
    it.each(['', 'false', 'TRUE', '1'])('rejects the projects route when flag is %s', flag => {
        vi.stubEnv('VITE_PROJECTS_ENABLED', flag);
        expect(parseAppRoute('?v=projects').view).toBe('orgchart');
    });
    it('accepts the enabled deep link and preserves invitation and unknown parameters', () => {
        vi.stubEnv('VITE_PROJECTS_ENABLED', 'true');
        const search = '?v=projects&project=22222222-2222-4222-8222-222222222222&workspace=11111111-1111-4111-8111-111111111111&invite=abc&other=ok';
        const route = parseAppRoute(search);
        expect(route.view).toBe('projects');
        expect(route).toMatchObject({ projectId: '22222222-2222-4222-8222-222222222222', workspaceId: '11111111-1111-4111-8111-111111111111' });
        const params = new URLSearchParams(serializeAppRoute(route, search));
        expect(params.get('invite')).toBe('abc');
        expect(params.get('other')).toBe('ok');
        expect(params.get('project')).toBe(route.projectId);
    });
});
