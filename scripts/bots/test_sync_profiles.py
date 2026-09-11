import hashlib,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from sync_profiles import prepare,install

class SyncTests(unittest.TestCase):
 def fixture(self,root):
  (root/'Hannah.txt').write_text('ancien',encoding='utf-8')
  content='Hannah\n## Mission\nRester précise\n#NatureTech'
  return {'files':{'Hannah.txt':{'agent':'hannah','content':content,'sha256':hashlib.sha256(content.encode()).hexdigest()}}}
 def test_headings_and_hashtags_survive_legacy_loader(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);plan=prepare(self.fixture(root),root,{'hannah':'Hannah.txt'})
   text=plan['files']['Hannah.txt']['content']
   self.assertIn('Mission',text);self.assertIn('#NatureTech',text)
   self.assertFalse(any(l.strip().startswith('#') for l in text.splitlines()))
 def test_bad_hash_and_traversal_fail_before_writes(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);bundle=self.fixture(root)
   bundle['files']['Hannah.txt']['sha256']='0'*64
   with self.assertRaises(ValueError):prepare(bundle,root,{'hannah':'Hannah.txt'})
   self.assertEqual((root/'Hannah.txt').read_text(),'ancien')
   bundle['files']['../outside.txt']=bundle['files'].pop('Hannah.txt')
   with self.assertRaises(ValueError):prepare(bundle,root,{'hannah':'Hannah.txt'})
 def test_concurrent_edit_is_not_overwritten(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);plan=prepare(self.fixture(root),root,{'hannah':'Hannah.txt'})
   (root/'Hannah.txt').write_text('autre session')
   with self.assertRaises(ValueError):install(plan,root,lambda agent:'')
   self.assertEqual((root/'Hannah.txt').read_text(),'autre session')
 def test_loader_failure_rolls_back_all_files(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);plan=prepare(self.fixture(root),root,{'hannah':'Hannah.txt'})
   with self.assertRaises(ValueError):install(plan,root,lambda agent:'différent')
   self.assertEqual((root/'Hannah.txt').read_text(),'ancien')
 def test_success_keeps_backup_and_returns_receipt(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);plan=prepare(self.fixture(root),root,{'hannah':'Hannah.txt'})
   result=install(plan,root,lambda agent:(root/'Hannah.txt').read_text(encoding='utf-8').strip())
   self.assertEqual((Path(result['backup'])/'Hannah.txt').read_text(),'ancien')
   self.assertEqual(result['installed'],1)
 def test_does_not_delete_another_installers_temporary_file(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);plan=prepare(self.fixture(root),root,{'hannah':'Hannah.txt'})
   temp=root/'Hannah.txt.organigrad-tmp';temp.write_text('other owner')
   with self.assertRaises(FileExistsError):install(plan,root,lambda agent:'')
   self.assertEqual(temp.read_text(),'other owner')

if __name__=='__main__':unittest.main()
