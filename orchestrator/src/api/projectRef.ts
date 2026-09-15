/** Native OrganiGrad project deep link, shared by circuit and non-run services. */
export function nativeProjectRef(appUrl: string | undefined, projectId: string, workspaceId: string) {
 const url=new URL(appUrl??'');
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('UNQUALIFIED_PROJECT_REFERENCE');
 url.searchParams.set('v','projects');url.searchParams.set('project',projectId);url.searchParams.set('workspace',workspaceId);
 return {sourceApp:'organigrad' as const,projectId,workspaceId,canonicalUrl:url.toString()};
}
/** Vérifie qu'une référence rendue par un RPC est exactement la référence native de ce projet (origine, projet, workspace). */
export function assertNativeProjectRef(appUrl: string | undefined, ref: unknown, projectId: string, workspaceId: string): { sourceApp: 'organigrad'; projectId: string; workspaceId: string; canonicalUrl: string } {
 const expected=nativeProjectRef(appUrl,projectId,workspaceId);
 const candidate=ref as {canonicalUrl?:unknown;projectId?:unknown;workspaceId?:unknown;sourceApp?:unknown}|null|undefined;
 if(!candidate||typeof candidate!=='object'||typeof candidate.canonicalUrl!=='string')throw Error('UNQUALIFIED_PROJECT_REFERENCE');
 const configured=new URL(appUrl??'');
 const canonical=new URL(candidate.canonicalUrl);
 if(configured.protocol!=='https:'||canonical.protocol!=='https:'||canonical.origin!==configured.origin||canonical.username||canonical.password||canonical.searchParams.getAll('project').length!==1||canonical.searchParams.get('project')!==projectId||canonical.searchParams.getAll('workspace').length!==1||canonical.searchParams.get('workspace')!==workspaceId||canonical.searchParams.get('v')!=='projects'||candidate.projectId!==projectId||candidate.workspaceId!==workspaceId||candidate.sourceApp!=='organigrad')throw Error('UNQUALIFIED_PROJECT_REFERENCE');
 return {...expected,canonicalUrl:candidate.canonicalUrl};
}
