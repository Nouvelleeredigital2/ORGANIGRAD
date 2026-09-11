import hashlib,io,json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from import_profiles import main

class ImportTests(unittest.TestCase):
 def test_link_failure_keeps_created_row_in_receipt(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'profiles.json';bot={'id':'e91c51da-aa09-507e-8dea-b23dc23e8a75','runtimeId':'hannah','mission':'a'}
   path.write_text(json.dumps({'bots':[bot]}));sha=hashlib.sha256(path.read_bytes()).hexdigest()
   returned={**bot,'compiledPrompt':'text','compiledSha256':hashlib.sha256(b'text').hexdigest()}
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
