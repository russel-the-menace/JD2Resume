interface DatedExperience {
  company?: string;
  startDate: string;
  endDate: string;
}

interface GapSegment {
  startDate: string;
  endDate: string;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthIndex(value: string, now = currentMonth()): number | null {
  const normalized = value === '至今' || value.toLowerCase() === 'present' ? now : value;
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(normalized);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function tupleKey(exp: DatedExperience): string {
  return [exp.company?.trim() || '', exp.startDate.trim(), exp.endDate.trim()].join('\u0000');
}

function splitSupplemental(
  real: DatedExperience[],
  generated: DatedExperience[],
): DatedExperience[] {
  const realCounts = new Map<string, number>();
  for (const exp of real) {
    const key = tupleKey(exp);
    realCounts.set(key, (realCounts.get(key) || 0) + 1);
  }

  return generated.filter((exp) => {
    const key = tupleKey(exp);
    const count = realCounts.get(key) || 0;
    if (count === 0) return true;
    realCounts.set(key, count - 1);
    return false;
  });
}

/**
 * Validate the deterministic timeline rules after the LLM builds the skeleton.
 * A supplement must cover one calculated gap. It may partially overlap a real
 * interval at a boundary, but it cannot duplicate or fully contain one.
 */
export function validateSupplementTimeline(
  real: DatedExperience[],
  generated: DatedExperience[],
  expectedGaps: GapSegment[],
): string[] {
  const errors: string[] = [];
  const parsedGenerated = generated.map((exp, index) => ({
    exp,
    index,
    start: monthIndex(exp.startDate),
    end: monthIndex(exp.endDate),
  }));

  for (const item of parsedGenerated) {
    if (item.start === null || item.end === null || item.start > item.end) {
      errors.push(`第 ${item.index + 1} 段经历时间格式或顺序无效`);
    }
  }

  for (let index = 1; index < parsedGenerated.length; index++) {
    const previous = parsedGenerated[index - 1];
    const current = parsedGenerated[index];
    if (previous.start !== null && current.start !== null && previous.start < current.start) {
      errors.push('最终工作时间线必须按开始时间从新到旧排列');
      break;
    }
  }

  const supplemental = splitSupplemental(real, generated).map((exp, index) => ({
    exp,
    index,
    start: monthIndex(exp.startDate),
    end: monthIndex(exp.endDate),
  }));
  if (supplemental.length !== expectedGaps.length) {
    errors.push(`补足经历数量必须与空档数一致（expected=${expectedGaps.length}, got=${supplemental.length}）`);
  }

  const parsedReal = real.map((exp) => ({
    exp,
    start: monthIndex(exp.startDate),
    end: monthIndex(exp.endDate),
  }));
  const gapMatches = new Array(expectedGaps.length).fill(0);

  for (const item of supplemental) {
    if (item.start === null || item.end === null || item.start > item.end) continue;

    const matchingGaps = expectedGaps.reduce<number[]>((matches, gap, gapIndex) => {
      const gapStart = monthIndex(gap.startDate);
      const gapEnd = monthIndex(gap.endDate);
      if (gapStart !== null && gapEnd !== null && item.start! <= gapStart && item.end! >= gapEnd) {
        matches.push(gapIndex);
      }
      return matches;
    }, []);

    if (matchingGaps.length !== 1) {
      errors.push(`补足经历 ${item.exp.startDate}-${item.exp.endDate} 必须准确覆盖一个空档区间`);
    } else {
      gapMatches[matchingGaps[0]]++;
    }

    let hasPartialRealOverlap = false;
    const fullyOverlapsReal = parsedReal.some((realItem) => {
      if (realItem.start === null || realItem.end === null) return false;
      const overlapStart = Math.max(item.start!, realItem.start);
      const overlapEnd = Math.min(item.end!, realItem.end);
      if (overlapStart > overlapEnd) return false;
      const coversWholeSupplement = overlapStart === item.start && overlapEnd === item.end;
      const coversWholeReal = overlapStart === realItem.start && overlapEnd === realItem.end;
      if (!coversWholeSupplement && !coversWholeReal) hasPartialRealOverlap = true;
      return coversWholeSupplement || coversWholeReal;
    });
    if (fullyOverlapsReal) {
      errors.push(`补足经历 ${item.exp.startDate}-${item.exp.endDate} 不能与真实经历完全重叠`);
    } else if (parsedReal.length > 0 && !hasPartialRealOverlap) {
      errors.push(`补足经历 ${item.exp.startDate}-${item.exp.endDate} 必须与相邻真实经历部分交叉`);
    }
  }

  gapMatches.forEach((count, index) => {
    if (count !== 1) errors.push(`空档 ${expectedGaps[index].startDate}-${expectedGaps[index].endDate} 必须且只能有一段补足经历`);
  });

  return [...new Set(errors)];
}
