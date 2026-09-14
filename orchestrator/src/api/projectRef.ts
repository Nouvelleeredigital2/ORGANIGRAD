/** Native OrganiGrad project deep link, shared by circuit and non-run services. */
export function nativeProjectRef(appUrl: string | undefined, projectId: string, workspaceId: string) {
 const url=new URL(appUrl??'');
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('UNQUALIFIED_PROJECT_REFERENCE');
 url.searchParams.set('v','projects');url.searchParams.set('project',projectId);url.searchParams.set('workspace',workspaceId);
 return {sourceApp:'organigrad' as const,projectId,workspaceId,canonicalUrl:url.toString()};
}
