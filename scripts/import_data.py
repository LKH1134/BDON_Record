"""Read the current workbook, preserving numeric song/string IDs. No packages needed."""
from pathlib import Path
from datetime import datetime, timezone
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'

def read_workbook(path):
    with zipfile.ZipFile(path) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(e.itertext()) for e in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        result = {}
        for sheet in ET.fromstring(archive.read('xl/workbook.xml')).findall('s:sheets/s:sheet', NS):
            target = rels[sheet.get(REL)]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            rows = []
            for row in ET.fromstring(archive.read(target)).findall('s:sheetData/s:row', NS):
                cells = {}
                for cell in row.findall('s:c', NS):
                    column = re.match(r'[A-Z]+', cell.get('r'))[0]
                    value = cell.find('s:v', NS)
                    text = value.text if value is not None else None
                    kind = cell.get('t')
                    if kind == 's': text = shared[int(text)]
                    elif kind == 'inlineStr': text = ''.join(cell.find('s:is', NS).itertext())
                    elif kind not in ('str', 'e', 'b') and text is not None:
                        text = float(text)
                        if text.is_integer(): text = int(text)
                    if cell.find('s:f', NS) is not None and text is None:
                        raise ValueError('Formula without cached value: ' + cell.get('r'))
                    cells[column] = text
                rows.append(cells)
            result[sheet.get('name')] = rows
        return result

def main():
    workbook = read_workbook(ROOT / 'Data.xlsx')
    strings = []
    string_ids = set()
    for row in workbook['Strings'][1:]:
        if row.get('A') is None: continue
        key, original, translated = row['A'], row.get('B'), row.get('C')
        if not isinstance(key, int) or key in string_ids or not isinstance(original, str) or not original.strip():
            raise ValueError('Invalid or duplicate string ID: ' + str(key))
        string_ids.add(key)
        strings.append({'id': key, 'original': original, 'translated': translated or None})
    songs = []
    song_ids = set()
    for row in workbook['Songs'][1:]:
        if row.get('A') is None: continue
        key, name_id = row['A'], row.get('B')
        if not isinstance(key, int) or key in song_ids or name_id not in string_ids:
            raise ValueError('Invalid song or string reference: ' + str(key))
        levels = {name: row.get(column) for name, column in [('expert','D'),('hard','E'),('normal','F'),('easy','G')]}
        if any(not isinstance(level, int) or not 1 <= level <= 50 for level in levels.values()):
            raise ValueError('Invalid difficulty: ' + str(key))
        if not isinstance(row.get('C'), str) or not row['C'].strip():
            raise ValueError('Missing band: ' + str(key))
        song_ids.add(key)
        songs.append({'id': key, 'nameId': name_id, 'band': row['C'], 'levels': levels})
    if not songs: raise ValueError('Workbook contains no songs')
    data = {'source': 'Data.xlsx', 'generatedAt': datetime.now(timezone.utc).isoformat(), 'songs': songs, 'strings': strings}
    output = ROOT / 'data' / 'catalog.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(songs)} songs and {len(strings)} strings from Data.xlsx.')

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(f'Import failed: {error}', file=sys.stderr)
        sys.exit(1)
