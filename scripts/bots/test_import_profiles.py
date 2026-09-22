import hashlib,io,json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from import_profiles import main

class ImportTests(unittest.TestCase):
 def run_import(self,source,existing=None,returned=None,drafts=True,fail_post=False):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  path=Path(self.temp.name)/'profiles.json';path.write_text(json.dumps({'bots':source}))
  sha=hashlib.sha256(path.read_bytes()).hexdigest();calls=[]
  class Opener:
   def open(self,request,timeout):
    calls.append(request)
    if request.data is not None and fail_post:raise RuntimeError('request interrupted')
    result={'bots':existing or []} if request.data is None else {'bot':returned}
    return io.BytesIO(json.dumps(result).encode())
  args=['import','--profiles',str(path),'--sha256',sha,'--workspace','e91c51da-aa09-507e-8dea-b23dc23e8a75','--api-url','https://example.invalid/api','--apply']+(['--drafts'] if drafts else [])
  self.calls=calls;self.path=path
  with patch.object(sys,'argv',args),patch.dict(os.environ,{'ORGANIGRAD_IMPORT_TOKEN':'test-only'}),patch('urllib.request.build_opener',return_value=Opener()),patch('sys.stdout',new_callable=io.StringIO):main()
  return calls,json.loads(path.with_name('import-receipt.json').read_text())

 def profile(self,**overrides):
  return {'id':'e91c51da-aa09-507e-8dea-b23dc23e8a75','runtimeId':'hannah','mission':'a','enabled':True,**overrides}

 def returned(self,bot):
  return {**bot,'compiledPrompt':'text','compiledSha256':hashlib.sha256(b'text').hexdigest()}

 def test_draft_mode_preserves_original_file_checksum_and_requests_disabled_new_bot(self):
  source=self.profile();calls,receipt=self.run_import([source],returned=self.returned({**source,'enabled':False}))
  self.assertFalse(json.loads(calls[1].data)['enabled']);self.assertTrue(json.loads(self.path.read_text())['bots'][0]['enabled'])
  self.assertTrue(receipt['drafts']);self.assertEqual(receipt['sourceSha256'],hashlib.sha256(self.path.read_bytes()).hexdigest())

 def test_active_import_without_explicit_draft_mode_is_rejected_before_network(self):
  with self.assertRaisesRegex(ValueError,'--drafts'):self.run_import([self.profile()],drafts=False)
  self.assertEqual(self.calls,[])

 def test_existing_active_bot_is_preserved_without_write_in_draft_mode(self):
  bot=self.profile();calls,receipt=self.run_import([bot],existing=[self.returned(bot)])
  self.assertEqual(len(calls),1);self.assertTrue(receipt['results'][0]['alreadyPresent']);self.assertTrue(receipt['results'][0]['enabled'])

 def test_runtime_and_uuid_collisions_are_never_ignored(self):
  bot=self.profile()
  for existing in [{**bot,'id':'00000000-0000-4000-8000-000000000001'},{**bot,'runtimeId':'another-bot'},{**bot,'mission':'Existing edit'}]:
   with self.assertRaises(ValueError):self.run_import([bot],existing=[self.returned(existing)])
   self.assertEqual(len(self.calls),1)

 def test_duplicate_source_id_is_rejected_before_network(self):
  bot=self.profile()
  with self.assertRaises(ValueError):self.run_import([bot,{**bot,'runtimeId':'other'}])
  self.assertEqual(self.calls,[])

 def test_partial_failure_preserves_first_verified_draft(self):
  first=self.profile();second=self.profile(id='00000000-0000-4000-8000-000000000001',runtimeId='second')
  with self.assertRaises(ValueError):self.run_import([first,second],returned=self.returned({**first,'enabled':False}))
  rows=json.loads(self.path.with_name('import-receipt.json').read_text())['results']
  self.assertEqual(rows[0]['state'],'verified');self.assertEqual(rows[1]['id'],second['id']);self.assertIn('error',rows[1])

 def test_response_identity_cannot_overwrite_expected_identity(self):
  bot=self.profile();wrong={**bot,'enabled':False,'id':'00000000-0000-4000-8000-000000000001'}
  with self.assertRaises(ValueError):self.run_import([bot],returned=self.returned(wrong))
  receipt=json.loads(self.path.with_name('import-receipt.json').read_text());row=receipt['results'][0]
  self.assertEqual(row['id'],bot['id']);self.assertEqual(row['receivedId'],wrong['id']);self.assertEqual(row['error']['stage'],'verification')

 def test_interrupted_draft_post_records_mode_and_partial_state(self):
  with self.assertRaises(RuntimeError):self.run_import([self.profile()],fail_post=True)
  receipt=json.loads(self.path.with_name('import-receipt.json').read_text())
  self.assertTrue(receipt['drafts']);self.assertEqual(receipt['results'][0]['state'],'request_started');self.assertEqual(receipt['results'][0]['error']['stage'],'request')
 def test_link_failure_keeps_created_row_in_receipt(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'profiles.json';bot={'id':'e91c51da-aa09-507e-8dea-b23dc23e8a75','runtimeId':'hannah','mission':'a'}
   path.write_text(json.dumps({'bots':[bot]}));sha=hashlib.sha256(path.read_bytes()).hexdigest()
   returned={**bot,'enabled':False,'compiledPrompt':'text','compiledSha256':hashlib.sha256(b'text').hexdigest()}
   class Opener:
    def open(self,request,timeout):
     if request.full_url.endswith('/link-node'):raise RuntimeError('link failed')
     result={'bots':[]} if request.data is None else {'bot':returned}
     return io.BytesIO(json.dumps(result).encode())
   args=['import','--profiles',str(path),'--sha256',sha,'--workspace',bot['id'],'--api-url','https://example.invalid/api','--apply','--link-nodes']
   with patch.object(sys,'argv',args),patch.dict(os.environ,{'ORGANIGRAD_IMPORT_TOKEN':'test-only'}),patch('urllib.request.build_opener',return_value=Opener()):
    with self.assertRaises(RuntimeError):main()
   receipt=json.loads(path.with_name('import-receipt.json').read_text())['results'][0]
   self.assertEqual(receipt['id'],bot['id']);self.assertEqual(receipt['state'],'verified');self.assertFalse(receipt['linked'])
 def test_dry_run_never_opens_network(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'profiles.json';path.write_text('{"bots":[]}')
   args=['import','--profiles',str(path),'--sha256',hashlib.sha256(path.read_bytes()).hexdigest(),'--workspace','e91c51da-aa09-507e-8dea-b23dc23e8a75','--api-url','https://example.invalid/api']
   with patch.object(sys,'argv',args),patch('urllib.request.build_opener') as network,patch('sys.stdout',new_callable=io.StringIO):main()
   network.assert_not_called()

if __name__=='__main__':unittest.main()
