import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

const docker=readFileSync(new URL('../../Dockerfile',import.meta.url),'utf8');
it('copies frontend vendor tarballs before the locked installation',()=>{
 const vendor=docker.indexOf('COPY vendor/ ./vendor/');
 expect(vendor).toBeGreaterThanOrEqual(0);
 expect(vendor).toBeLessThan(docker.indexOf('RUN npm ci'));
});
it('provides explicit public build parameters with pilot flags off by default',()=>{
 for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VITE_ORCHESTRATOR_URL','VITE_PROJECTS_ENABLED','VITE_PRIVATE_PROJECTS_ENABLED']){
  expect(docker).toContain('ARG '+key);
  expect(docker).toContain('ENV '+key+'=$'+key);
 }
 expect(docker).toContain('ARG VITE_PROJECTS_ENABLED=false');
 expect(docker).toContain('ARG VITE_PRIVATE_PROJECTS_ENABLED=false');
});
