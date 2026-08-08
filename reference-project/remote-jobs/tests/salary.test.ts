// tests/salary.test.ts
import { parseSalary } from '../miniprogram/utils/salary';

describe('Salary Parsing Logic (Frontend)', () => {
  
  test('should return null for empty/invalid inputs', () => {
    expect(parseSalary(null as any)).toBeNull();
    expect(parseSalary(undefined as any)).toBeNull();
    // @ts-ignore
    expect(parseSalary(123)).toBeNull();
  });

  test('should parse standard range "min-max k"', () => {
    expect(parseSalary('20-30k')).toEqual({ min: 20, max: 30, type: 'range' });
    expect(parseSalary('15 - 25 k')).toEqual({ min: 15, max: 25, type: 'range' });
    expect(parseSalary('1.5-2.5k')).toEqual({ min: 1.5, max: 2.5, type: 'range' });
    expect(parseSalary('40-50K')).toEqual({ min: 40, max: 50, type: 'range' });
    expect(parseSalary('5-10千')).toEqual({ min: 5, max: 10, type: 'range' });
  });

  test('should parse special formats (Project/Hourly)', () => {
    expect(parseSalary('时薪100')).toEqual({ type: 'special', value: '时薪100' });
    expect(parseSalary('日薪500')).toEqual({ type: 'special', value: '日薪500' });
    expect(parseSalary('周薪2000')).toEqual({ type: 'special', value: '周薪2000' });
  });

  test('should ignore suffixes like "·14薪"', () => {
    expect(parseSalary('20-30k·14薪')).toEqual({ min: 20, max: 30, type: 'range' });
    expect(parseSalary('20-30k · 16薪')).toEqual({ min: 20, max: 30, type: 'range' });
  });

  // Backend consistency: If regex fails, what happens? 
  // Based on code, returns null.
  test('should return null for unrecognized formats', () => {
    expect(parseSalary('面议')).toBeNull(); // Code doesn't explicitly handle '面议' unless it falls through.
    expect(parseSalary('Salary Negotiable')).toBeNull();
  });
});
