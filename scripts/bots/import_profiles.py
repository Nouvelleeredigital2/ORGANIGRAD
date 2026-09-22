"""Create reviewed profiles through the qualified API; never overwrite existing profiles."""
import argparse,hashlib,json,os,sys,urllib.request,urllib.parse,uuid
from pathlib import Path
from sync_profiles import NoRedirect

class ImportValidationError(ValueError):
 """Fixed, non-sensitive message safe to display to the operator."""

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--profiles',type=Path,required=True);p.add_argument('--sha256',required=True)
 p.add_argument('--api-url',required=True);p.add_argument('--workspace',required=True)
 p.add_argument('--apply',action='store_true');p.add_argument('--link-nodes',action='store_true')
 p.add_argument('--drafts',action='store_true',help='Create new profiles as drafts; preserve existing activation states')
 args=p.parse_args();uuid.UUID(args.workspace)
 raw=args.profiles.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=args.sha256:raise ImportValidationError('Reviewed file checksum required')
 bots=json.loads(raw)['bots']
 if not isinstance(bots,list):raise ImportValidationError('Profiles must be a list')
 seen_ids=set();seen_runtime=set()
 for bot in bots:
  if not isinstance(bot,dict) or not isinstance(bot.get('runtimeId'),str) or not bot['runtimeId']:raise ImportValidationError('Profile identity required')
  try:canonical=str(uuid.UUID(bot['id']))
  except (ValueError,KeyError,TypeError,AttributeError):raise ImportValidationError('Profile UUID required') from None
  if canonical!=bot['id'] or canonical in seen_ids or bot['runtimeId'] in seen_runtime:raise ImportValidationError('Duplicate or noncanonical profile identity')
  seen_ids.add(canonical);seen_runtime.add(bot['runtimeId'])
  if 'enabled' in bot and not isinstance(bot['enabled'],bool):raise ImportValidationError('Profile enabled must be boolean')
  if bot.get('enabled') is True and not args.drafts:raise ImportValidationError('Activation requires verified dependencies: use --drafts to import new profiles as drafts. Existing active profiles will be preserved.')
 u=urllib.parse.urlsplit(args.api_url)
 if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path!='/api':raise ImportValidationError('Qualified HTTPS API origin required')
 if not args.apply:
  print(json.dumps({'profiles':len(bots),'workspace':args.workspace,'applied':False,'drafts':args.drafts,'sourceSha256':args.sha256}));return
 token=os.environ.get('ORGANIGRAD_IMPORT_TOKEN','')
 if not token:raise ValueError('User credential missing in environment')
 opener=urllib.request.build_opener(NoRedirect)
 def request(path,body=None):
  req=urllib.request.Request(args.api_url+path,data=json.dumps(body).encode() if body is not None else None,
    headers={'Authorization':'Bearer '+token,'x-workspace-id':args.workspace,'Content-Type':'application/json'})
  with opener.open(req,timeout=30) as response:return json.load(response)
 existing=request('/bots')['bots'];by_runtime={b['runtimeId']:b for b in existing};by_id={b['id']:b for b in existing}
 if len(by_runtime)!=len(existing) or len(by_id)!=len(existing):raise ImportValidationError('Duplicate identities in existing profiles')
 expected={}
 # Check every collision BEFORE the first write. Existing edits are never replaced.
 for bot in bots:
  if bot['id'] in by_id and by_id[bot['id']]['runtimeId']!=bot['runtimeId']:raise ImportValidationError('Existing UUID belongs to another runtime')
  if bot['runtimeId'] in by_runtime:
   old=by_runtime[bot['runtimeId']]
   if old['id']!=bot['id']:raise ImportValidationError('Existing runtime has a different historical UUID')
   comparison={**bot}
   if args.drafts:
    if not isinstance(old.get('enabled'),bool):raise ImportValidationError('Existing activation state is invalid')
    comparison['enabled']=old['enabled']
   if any(old.get(k)!=v for k,v in comparison.items()):raise ImportValidationError('Existing profile differs; review in Organigrad')
   expected[bot['runtimeId']]=comparison
  else:expected[bot['runtimeId']]={**bot,'enabled':False}
 receipts=[]
 receipt_path=args.profiles.with_name('import-receipt.json')
 def save():receipt_path.write_text(json.dumps({'workspace':args.workspace,'sourceSha256':args.sha256,'drafts':args.drafts,'results':receipts},indent=2),encoding='utf-8')
 for bot in bots:
  existed=bot['runtimeId'] in by_runtime
  receipt={'runtimeId':bot['runtimeId'],'id':bot['id'],'alreadyPresent':existed,'state':'request_started','linked':False}
  receipts.append(receipt);save()
  stage='request'
  try:
   comparison=expected[bot['runtimeId']]
   result=by_runtime[bot['runtimeId']] if existed else request('/bots',comparison)['bot']
   stage='verification'
   receipt.update(receivedId=result.get('id'),state='received');save()
   if any(result.get(k)!=v for k,v in comparison.items()):raise ImportValidationError('Server response differs, including expected UUID or draft state')
   if hashlib.sha256(result['compiledPrompt'].encode()).hexdigest()!=result['compiledSha256']:raise ImportValidationError('Compiled checksum mismatch')
   receipt.update(state='verified',enabled=result.get('enabled'),sha256=result['compiledSha256']);save()
   if args.link_nodes:
    stage='link'
    node=request('/bots/'+result['id']+'/link-node',{})['node']
    if node['id']!=result['id']:raise ImportValidationError('Linked node differs')
    receipt['linked']=True;save()
  except Exception as exc:
   receipt['error']={'stage':stage,'type':type(exc).__name__};save();raise
  print(bot['runtimeId'],'verified',flush=True)

if __name__=='__main__':
 try:main()
 except Exception as exc:
  reason=str(exc) if isinstance(exc,ImportValidationError) else type(exc).__name__
  print('Import stopped: '+reason+'; any completed rows remain recorded',file=sys.stderr)
  raise SystemExit(1)
