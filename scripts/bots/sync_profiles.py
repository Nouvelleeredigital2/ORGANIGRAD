"""Plan/apply a verified Organigrad bundle on the qualified legacy reader; never restart."""
import argparse,datetime,hashlib,importlib.util,json,os,re,shutil,sys,urllib.request,urllib.parse
from pathlib import Path
from convert_profiles import IDENTITIES

def digest(data):return hashlib.sha256(data).hexdigest()

def prepare(bundle,root,allowed):
 if root.is_symlink() or not root.is_dir():raise ValueError('Unsafe target directory')
 files=bundle.get('files')
 if not isinstance(files,dict) or set(files)!=set(allowed.values()):raise ValueError('Complete known runtime roster required')
 result={}
 for name,spec in files.items():
  if Path(name).name!=name or allowed.get(spec.get('agent'))!=name:raise ValueError('Unknown identity or filename')
  content=spec.get('content')
  if not isinstance(content,str) or not content.strip() or len(content)>32000:raise ValueError('Invalid content')
  if digest(content.encode())!=spec.get('sha256'):raise ValueError('Bundle checksum mismatch')
  # The legacy loader drops every line whose stripped value starts with '#'.
  lines=[]
  for line in content.split('\n'):
   if re.match(r'^\s*#{1,6}\s+',line):line=re.sub(r'^\s*#{1,6}\s+','',line)
   if line.strip().startswith('#'):line='Texte : '+line
   lines.append(line)
  normalized='\n'.join(lines).strip()+'\n'
  path=root/name
  if path.is_symlink() or not path.is_file():raise ValueError('Existing regular profile required')
  result[name]={'agent':spec['agent'],'sourceSha256':spec['sha256'],'before':digest(path.read_bytes()),
    'after':digest(normalized.encode()),'content':normalized}
 return {'root':str(root.resolve()),'files':result}

def install(plan,root,loader):
 if str(root.resolve())!=plan.get('root') or root.is_symlink():raise ValueError('Target changed')
 files=plan['files']
 if not files:raise ValueError('Empty plan')
 for name,spec in files.items():
  if Path(name).name!=name:raise ValueError('Invalid plan path')
  path=root/name
  if path.is_symlink() or not path.is_file():raise ValueError('Profile disappeared')
  if digest(path.read_bytes())!=spec['before']:raise ValueError('Concurrent edit')
  if digest(spec['content'].encode())!=spec['after']:raise ValueError('Plan content mismatch')
 lock=root.parent/'.personas-deploy.lock'
 lock.mkdir(mode=0o700)
 backup=root.parent/('personas-organigrad-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
 changed=[];owned_temps=[]
 try:
  for name,spec in files.items():
   path=root/name
   if path.is_symlink() or not path.is_file() or digest(path.read_bytes())!=spec['before']:raise ValueError('Concurrent edit after locking')
  backup.mkdir(mode=0o700)
  for name in files:shutil.copy2(root/name,backup/name)
  for name,spec in files.items():
   path=root/name
   if digest(path.read_bytes())!=spec['before']:raise ValueError('Concurrent edit during installation')
   temp=root/(name+'.organigrad-tmp')
   with temp.open('x',encoding='utf-8',newline='\n') as f:
    owned_temps.append(temp);f.write(spec['content'])
   os.chmod(temp,path.stat().st_mode&0o777)
   os.replace(temp,path);owned_temps.remove(temp);changed.append(name)
  for name,spec in files.items():
   if digest((root/name).read_bytes())!=spec['after'] or loader(spec['agent'])!=spec['content'].strip():raise ValueError('Active loader mismatch')
  receipt={'installed':len(files),'backup':str(backup),'restarted':False,
    'files':{name:{k:v for k,v in spec.items() if k!='content'} for name,spec in files.items()}}
  (backup/'manifest.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
  return receipt
 except Exception:
  for name in changed:shutil.copy2(backup/name,root/name)
  raise
 finally:
  for temp in owned_temps:
   if temp.exists() and not temp.is_symlink():temp.unlink()
  lock.rmdir()

class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise ValueError('Redirect refused')

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('mode',choices=['plan','apply'])
 parser.add_argument('--plan',type=Path,required=True)
 parser.add_argument('--root',type=Path,default=Path('/opt/data/pipeline/personas'))
 parser.add_argument('--url',help='Exact qualified HTTPS /api/bots/bundle URL')
 parser.add_argument('--expected-plan-sha256')
 parser.add_argument('--runtime-sha256',required=True)
 args=parser.parse_args()
 if not hasattr(os,'getuid') or os.getuid()!=10000:raise ValueError('Run as the qualified hermes UID 10000')
 runtime=Path('/opt/data/bin/personas_chat.py')
 if runtime.is_symlink() or digest(runtime.read_bytes())!=args.runtime_sha256:raise ValueError('Runtime drift')
 allowed={v[0]:v[1] for v in IDENTITIES.values()}
 if args.mode=='plan':
  u=urllib.parse.urlsplit(args.url or '')
  if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path!='/api/bots/bundle':raise ValueError('Exact qualified HTTPS bundle URL required')
  token=os.environ.get('ORGANIGRAD_BOTS_TOKEN','')
  if not token:raise ValueError('Missing scoped export credential in environment')
  request=urllib.request.Request(args.url,headers={'Authorization':'Bearer '+token})
  with urllib.request.build_opener(NoRedirect).open(request,timeout=30) as response:
   raw=response.read(2_000_001)
   if len(raw)>2_000_000:raise ValueError('Oversized bundle')
  plan=prepare(json.loads(raw),args.root,allowed)
  plan['runtimeSha256']=args.runtime_sha256;plan['sourceUrl']=args.url
  args.plan.write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps({'plan':str(args.plan),'sha256':digest(args.plan.read_bytes()),'files':len(plan['files']),'applied':False}))
 else:
  if digest(args.plan.read_bytes())!=args.expected_plan_sha256:raise ValueError('Reviewed plan checksum required')
  plan=json.loads(args.plan.read_text(encoding='utf-8'))
  if plan.get('runtimeSha256')!=args.runtime_sha256:raise ValueError('Plan targets another runtime')
  if {s['agent']:name for name,s in plan['files'].items()}!=allowed:raise ValueError('Runtime roster mismatch')
  sys.path.insert(0,str(runtime.parent))
  import personas_chat
  if Path(personas_chat.PERSONAS_DIR).resolve()!=args.root.resolve():raise ValueError('Loader directory mismatch')
  print(json.dumps(install(plan,args.root,personas_chat.charger_persona)))

if __name__=='__main__':
 try:main()
 except Exception as exc:
  print('Synchronization failed: '+type(exc).__name__,file=sys.stderr)
  raise SystemExit(1)
