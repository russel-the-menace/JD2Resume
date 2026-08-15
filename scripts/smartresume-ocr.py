#!/usr/bin/env python3
"""Run SmartResume's local OCR and emit page text as one marked JSON line."""
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1] / 'reference-project' / 'alibaba-smartresume'
sys.path.insert(0, str(PROJECT_ROOT))

from smartresume.data.file_processor import FileProcessor
from smartresume.data.text_extractor import TextExtractor
from smartresume.utils.config import config

config.layout_detection.enabled = False

file_path = Path(sys.argv[1])
processor = FileProcessor(TextExtractor(init_ocr=True))
pages = processor.process_file(str(file_path))
result = []
for index, page in enumerate(pages, start=1):
    lines = []
    for item in page.get('text', []):
        value = item.get('text', '') if isinstance(item, dict) else ''
        if isinstance(value, str) and value.strip():
            lines.append(value.strip())
    result.append({'page': index, 'lines': lines})

print('SMARTRESUME_RESULT:' + json.dumps({'pages': result}, ensure_ascii=False))
