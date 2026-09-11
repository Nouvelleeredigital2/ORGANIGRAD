"""Create reviewed profiles through the qualified API; never overwrite existing profiles."""
import argparse,hashlib,json,os,sys,urllib.request,urllib.parse,uuid
from pathlib import Path
from sync_profiles import NoRedirect

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--profiles',type=Path,required=True);p.add_argument('--sha256',required=True)
 p.add_argument('--api-url',required=True);p.add_argument('--workspace',required=True)
 p.add_argument('--apply',action='store_true');p.add_argument('--link-nodes',action='store_true')
 args=p.parse_args();uuid.UUID(args.workspace)
 raw=args.profiles.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=args.sha256:raise ValueError('Reviewed file checksum required')
 bots=json.loads(raw)['bots']
 u=urllib.parse.urlsplit(args.api_url)
 if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path!='/api':raise ValueError('Qualified HTTPS API origin required')
 if not args.apply:
  print(json.dumps({'profiles':len(bots),'workspace':args.workspace,'applied':False}));return
 token=os.environ.get('ORGANIGRAD_IMPORT_TOKEN','')
 if not token:raise ValueError('User credential missing in environment')
 opener=urllib.request.build_opener(NoRedirect)
 def request(path,body=None):
  req=urllib.request.Request(args.api_url+path,data=json.dumps(body).encode() if body is not None else None,
    headers={'Authorization':'Bearer '+token,'x-workspace-id':args.workspace,'Content-Type':'application/json'})
  with opener.open(req,timeout=30) as response:return json.load(response)
 existing=request('/bots')['bots'];by_runtime={b['runtimeId']:b for b in existing}
 # Check every collision BEFORE the first write. Existing edits are never replaced.
 for bot in bots:
  if bot['runtimeId'] in by_runtime:
   old=by_runtime[bot['runtimeId']]
   if any(old.get(k)!=v for k,v in bot.items() if k!='id'):raise ValueError('Existing profile differs; review in Organigrad')
 receipts=[]
 receipt_path=args.profiles.with_name('import-receipt.json')
 def save():receipt_path.write_text(json.dumps({'workspace':args.workspace,'results':receipts},indent=2),encoding='utf-8')
 for bot in bots:
  existed=bot['runtimeId'] in by_runtime
  receipt={'runtimeId':bot['runtimeId'],'id':bot['id'],'alreadyPresent':existed,'state':'request_started','linked':False}
  receipts.append(receipt);save()
  result=by_runtime[bot['runtimeId']] if existed else request('/bots',bot)['bot']
  receipt.update(id=result['id'],state='received');save()
  if any(result.get(k)!=v for k,v in bot.items() if k!='id'):raise ValueError('Server response differs')
  if hashlib.sha256(result['compiledPrompt'].encode()).hexdigest()!=result['compiledSha256']:raise ValueError('Compiled checksum mismatch')
  receipt.update(state='verified',sha256=result['compiledSha256']);save()
  if args.link_nodes:
   node=request('/bots/'+result['id']+'/link-node',{})['node']
   if node['id']!=result['id']:raise ValueError('Linked node differs')
   receipt['linked']=True;save()
  print(bot['runtimeId'],'verified',flush=True)

if __name__=='__main__':
 try:main()
 except Exception as exc:
  print('Import stopped: '+type(exc).__name__+'; any completed rows remain recorded',file=sys.stderr)
  raise SystemExit(1)
