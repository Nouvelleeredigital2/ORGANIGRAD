import unittest
from convert_profiles import convert,split_sections

class ConversionTests(unittest.TestCase):
 def fixture(self):
  titles=['Mission','Personnalité et relation','Recherche documentaire','Veille','Livrables et méthode','Limites et accès','Méthode de conseil 4.0','Contexte utile 4.0']
  return '# Hannah — fiche de persona\n\nMarque : Nature & Tech.\n'+''.join('\n## '+t+'\n\n'+t+' contenu.\n' for t in titles)+'\n## Dialogue métier 4.0\n\nSOUVENIR_FICTIF\n'
 def test_preserves_sections_and_excludes_fiction(self):
  bot=convert('hannah',self.fixture(),'- PubMed — https://pubmed.ncbi.nlm.nih.gov/ — méthode et limites')
  self.assertIn('Limites et accès contenu.',bot['limits'])
  self.assertIn('Méthode de conseil 4.0 contenu.',bot['method'])
  self.assertNotIn('SOUVENIR_FICTIF',str(bot))
  self.assertEqual(bot['sources'][0]['url'],'https://pubmed.ncbi.nlm.nih.gov/')
  self.assertEqual(bot['fileName'],'Hannah.txt')
  self.assertEqual(bot['id'],'e91c51da-aa09-507e-8dea-b23dc23e8a75')
 def test_unknown_or_missing_section_requires_review(self):
  with self.assertRaises(ValueError):convert('hannah',self.fixture()+'\n## Règle nouvelle\nNe pas perdre.', '')
  with self.assertRaises(ValueError):convert('hannah',self.fixture().replace('## Mission','## Mission absente'), '')
 def test_nested_heading_stays_in_method(self):
  self.assertIn('### Détail',split_sections('## Méthode\nTexte\n### Détail\nRéserve')['Méthode'])
 def test_identity_is_allowlisted(self):
  with self.assertRaises(ValueError):convert('../bad',self.fixture(),'')

if __name__=='__main__':unittest.main()
