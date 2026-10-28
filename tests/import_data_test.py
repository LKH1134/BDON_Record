"""Workbook-to-catalog contract; run through catalog.test.mjs in npm test."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.import_data import ROOT, build_catalog, read_workbook


class ImportDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workbook = read_workbook(ROOT / 'Data.xlsx')

    def test_workbook_category_and_shifted_levels(self):
        data = build_catalog(self.workbook)
        self.assertEqual(len(data['songs']), 93)
        self.assertEqual(len(data['strings']), 93)
        self.assertEqual(data['songs'][0], {
            'id': 101001, 'nameId': 2001, 'band': 'MyGO!!!!!', 'category': '오리지널',
            'levels': {'expert': 25, 'hard': 20, 'normal': 13, 'easy': 9}})
        self.assertEqual(next(s for s in data['songs'] if s['nameId'] == 2092), {
            'id': 102007, 'nameId': 2092, 'band': 'MyGO!!!!!', 'category': '커버',
            'levels': {'expert': 26, 'hard': 20, 'normal': 14, 'easy': 7}})
        self.assertEqual(next(s for s in data['songs'] if s['nameId'] == 2093), {
            'id': 202007, 'nameId': 2093, 'band': 'Ave Mujica', 'category': '커버',
            'levels': {'expert': 25, 'hard': 17, 'normal': 11, 'easy': 7}})

    def test_rejects_malformed_ids_and_classification(self):
        for changes in [
            {'A': 1001}, {'A': 101000}, {'A': 1010001}, {'A': 103001},
            {'A': 103001, 'D': None}, {'A': 201999}, {'D': '커버'}, {'D': None},
            {'C': ''}, {'C': 'Ave Mujica'}, {'A': 601002}, {'B': 9999},
            {'E': 51}, {'E': 1.5}, {'H': None}]:
            with self.subTest(changes=changes):
                workbook = deepcopy(self.workbook)
                workbook['Songs'][1].update(changes)
                with self.assertRaises(ValueError):
                    build_catalog(workbook)

    def test_duplicate_ids_and_old_header_are_rejected(self):
        for sheet, row in [('Songs', 1), ('Strings', 1)]:
            workbook = deepcopy(self.workbook)
            workbook[sheet].append(deepcopy(workbook[sheet][row]))
            with self.subTest(sheet=sheet), self.assertRaises(ValueError):
                build_catalog(workbook)
        workbook = deepcopy(self.workbook)
        workbook['Songs'][0]['D'] = 'Expert'
        with self.assertRaises(ValueError):
            build_catalog(workbook)

    def test_numeric_order_and_other_band(self):
        workbook = deepcopy(self.workbook)
        workbook['Songs'][1:] = reversed(workbook['Songs'][1:])
        data = build_catalog(workbook)
        self.assertEqual([s['id'] for s in data['songs']], sorted(s['id'] for s in data['songs']))
        self.assertEqual(data['songs'][-1]['id'], 601001)
        self.assertEqual(data['songs'][-1]['band'], 'CRYCHIC')
        self.assertEqual(data['songs'][-1]['category'], '오리지널')


if __name__ == '__main__':
    unittest.main()
