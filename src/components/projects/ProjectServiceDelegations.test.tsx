import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectServiceDelegations } from './ProjectServiceDelegations';
const props={ownerId:'user-a',workspaceId:'workspace-a',projectId:'project-a',accessToken:'user-session',archived:false,blocked:false};
const snapshot={grants:[],keys:[{id:'key-a',name:'Clé Engine',scopes:['node:run']}],nodes:[{id:'node-a',name:'Engine'}]};
const response=(value:unknown,status=200)=>({ok:status===200,status,json:async()=>value}) as Response;
const request=vi.fn();
beforeEach(()=>{sessionStorage.clear();vi.stubGlobal('fetch',request);request.mockReset().mockResolvedValue(response(snapshot));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
function fill(){
 fireEvent.change(screen.getByLabelText('Clé technique'),{target:{value:'key-a'}});
 fireEvent.change(screen.getByLabelText('Responsable dans OrganiGrad'),{target:{value:'node-a'}});
 fireEvent.change(screen.getByLabelText('Identifiant de l’application'),{target:{value:'ned-media-engine'}});
 fireEvent.change(screen.getByLabelText('Espace ou client natif'),{target:{value:'client-a'}});
 fireEvent.change(screen.getByLabelText('Ressource ou capacité native'),{target:{value:'generate-image'}});
 fireEvent.change(screen.getByLabelText('Expiration (30 jours maximum)'),{target:{value:new Date(Date.now()+86400000).toISOString().slice(0,16)}});
 fireEvent.click(screen.getByLabelText('Exécuter une étape attribuée'));
}
it('uses the human session and explicit native identifiers, never asks for a technical secret',async()=>{
 render(<ProjectServiceDelegations {...props}/>);await screen.findByText('Clé Engine');fill();
 fireEvent.click(screen.getByText('Accorder cette autorisation'));
 await waitFor(()=>expect(request).toHaveBeenCalledTimes(3));
 const options=request.mock.calls[1]![1];expect(options.headers.Authorization).toBe('Bearer user-session');
 expect(JSON.parse(options.body)).toMatchObject({apiKeyId:'key-a',nodeId:'node-a',target:{appId:'ned-media-engine',workspaceId:'client-a',resourceId:'generate-image'},actions:['step:execute']});
 expect(sessionStorage.length).toBe(0);
});
it('retains the same creation after an uncertain network reply and reload, scoped to the account',async()=>{
 const rendered=render(<ProjectServiceDelegations {...props}/>);await screen.findByText('Clé Engine');fill();
 request.mockRejectedValueOnce(new Error('Réseau interrompu'));
 fireEvent.click(screen.getByText('Accorder cette autorisation'));await screen.findByText('Réseau interrompu');
 const body=request.mock.calls[1]![1].body;
 rendered.unmount();render(<ProjectServiceDelegations {...props}/>);
 await screen.findByText('Clé Engine');fireEvent.click(screen.getByText('Vérifier la même demande'));
 await waitFor(()=>expect(request).toHaveBeenCalledTimes(5));expect(request.mock.calls[3]![1].body).toBe(body);
 cleanup();render(<ProjectServiceDelegations {...props} ownerId="user-b"/>);await screen.findByText('Clé Engine');
 expect(screen.queryByText('Vérifier la même demande')).toBeNull();
});
it('bounds even an ignored abort, permits retry and ignores the late response',async()=>{
 vi.useFakeTimers();let resolve!:(value:Response)=>void;
 request.mockImplementationOnce(()=>new Promise<Response>(r=>{resolve=r;}));
 render(<ProjectServiceDelegations {...props}/>);
 await act(async()=>{await vi.advanceTimersByTimeAsync(15001);});expect(screen.getByRole('alert').textContent).toContain('Délai dépassé');
 fireEvent.click(screen.getByText('Relire les autorisations'));await act(async()=>{});
 expect(screen.getByText('Clé Engine')).toBeTruthy();
 await act(async()=>{resolve(response({...snapshot,keys:[{id:'old',name:'Ancienne réponse',scopes:[]}]}));});
 expect(screen.queryByText('Ancienne réponse')).toBeNull();
});
it('clears previously visible grants on access denial and suspends actions during rights recheck',async()=>{
 request.mockResolvedValueOnce(response({...snapshot,grants:[{id:'g',api_key_id:'key-a',target:{appId:'engine-secret-context',workspaceId:'a',resourceId:'b'},actions:['execution:read'],expires_at:'2030-01-01T00:00:00Z',revoked_at:null,version:1}]}));
 const rendered=render(<ProjectServiceDelegations {...props}/>);await screen.findByRole('button',{name:'Révoquer engine-secret-context'});
 request.mockResolvedValueOnce(response({},403));fireEvent.click(screen.getByText('Relire les autorisations'));
 await screen.findByRole('alert');expect(screen.queryByText(/engine-secret-context/)).toBeNull();
 rendered.rerender(<ProjectServiceDelegations {...props} blocked/>);
 expect(screen.getByText('Relire les autorisations')).toBeDisabled();
});
it('drops the old payload when editing, but keeps the same creation ID after reload',async()=>{
 const rendered=render(<ProjectServiceDelegations {...props}/>);await screen.findByText('Clé Engine');fill();
 request.mockRejectedValueOnce(new Error('Réponse perdue'));fireEvent.click(screen.getByText('Accorder cette autorisation'));await screen.findByText('Réponse perdue');
 const first=JSON.parse(request.mock.calls[1]![1].body);
 fireEvent.click(screen.getByText('Relire les autorisations'));await screen.findByText('Clé Engine');
 fireEvent.click(screen.getByText('Corriger la saisie en conservant l’identifiant'));
 expect(sessionStorage.getItem(sessionStorage.key(0)!)).not.toContain('generate-image');
 rendered.unmount();render(<ProjectServiceDelegations {...props}/>);await screen.findByText('Clé Engine');
 expect(screen.queryByText('Vérifier la même demande')).toBeNull();fill();fireEvent.change(screen.getByLabelText('Ressource ou capacité native'),{target:{value:'corrected-capability'}});
 fireEvent.click(screen.getByText('Accorder cette autorisation'));
 await waitFor(()=>expect(request).toHaveBeenCalledTimes(6));
 expect(JSON.parse(request.mock.calls[4]![1].body)).toMatchObject({grantId:first.grantId,target:{resourceId:'corrected-capability'}});
});
