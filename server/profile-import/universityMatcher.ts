import fs from 'node:fs';
import path from 'node:path';

export type UniversityRecord = {
  chineseName: string;
  englishName: string;
  isTop: boolean;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function readCsv(fileName: string, isTop: boolean): UniversityRecord[] {
  const file = path.join(path.dirname(new URL(import.meta.url).pathname), 'data', fileName);
  const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, '').split(/\r?\n/u).filter(Boolean);
  const headers = parseCsvLine(lines.shift() || '');
  const indexOf = (name: string) => headers.findIndex((header) => header === name);
  const chineseIndex = indexOf('中文名');
  const englishIndex = indexOf('外文名');
  const flag = (cells: string[], name: string) => cells[indexOf(name)] === '是';
  return lines.flatMap((line) => {
    const cells = parseCsvLine(line);
    const chineseName = cells[chineseIndex]?.trim() || '';
    if (!chineseName) return [];
    return [{
      chineseName,
      englishName: cells[englishIndex]?.trim() || '',
      isTop,
      is985: isTop && flag(cells, '985'),
      is211: isTop && flag(cells, '211'),
      isDoubleFirstClass: isTop && flag(cells, '双一流'),
    }];
  });
}

const universities = [
  ...readCsv('domestic-top.csv', true),
  ...readCsv('domestic-non-top.csv', false),
];

function comparable(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[\s·.,，。:：;；()（）[\]{}《》<>「」『』/_\\-]/g, '');
}

function editDistance(first: string, second: string): number {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= second.length; column += 1) {
      const above = previous[column];
      previous[column] = first[row - 1] === second[column - 1]
        ? diagonal
        : Math.min(diagonal, previous[column - 1], above) + 1;
      diagonal = above;
    }
  }
  return previous[second.length];
}

function matchScore(input: string, canonical: string): number {
  if (input === canonical) return 10_000;
  if (canonical.includes(input) || input.includes(canonical)) {
    // Avoid treating very short fragments such as “大学” as a school name.
    return input.length >= 4 ? 8_000 + Math.min(input.length, canonical.length) : -1;
  }
  if (input.length < 5 || canonical.length < 5) return -1;
  const distance = editDistance(input, canonical);
  const threshold = Math.max(1, Math.floor(Math.min(input.length, canonical.length) * 0.18));
  return distance <= threshold ? 6_000 - distance * 100 + canonical.length : -1;
}

export function resolveDomesticUniversity(rawName: string): { school: string; schoolEn: string } {
  const original = rawName.trim();
  const input = comparable(original);
  if (!input) return { school: '', schoolEn: '' };
  let best: UniversityRecord | undefined;
  let bestScore = -1;
  for (const university of universities) {
    const score = matchScore(input, comparable(university.chineseName));
    if (score > bestScore) {
      best = university;
      bestScore = score;
    }
  }
  if (!best) return { school: original, schoolEn: '' };
  const suffix = best.is985 ? '985' : best.is211 ? '211' : best.isDoubleFirstClass ? '双一流' : '';
  return {
    school: suffix ? `${best.chineseName}(${suffix})` : best.chineseName,
    schoolEn: best.englishName,
  };
}
