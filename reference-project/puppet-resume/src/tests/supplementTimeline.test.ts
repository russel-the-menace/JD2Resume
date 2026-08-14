import { validateSupplementTimeline } from '../utils/supplementTimeline';

const real = [
  { company: 'A 公司', startDate: '2020-01', endDate: '2021-01' },
  { company: 'B 公司', startDate: '2022-01', endDate: '2023-01' },
];
const gap = [{ startDate: '2021-02', endDate: '2021-12' }];

describe('validateSupplementTimeline', () => {
  test('rejects a supplement with no real-experience boundary overlap', () => {
    const generated = [
      real[1],
      { company: '补足公司', startDate: '2021-02', endDate: '2021-12' },
      real[0],
    ];
    expect(validateSupplementTimeline(real, generated, gap).join(' ')).toContain('必须与相邻真实经历部分交叉');
  });

  test('allows a partial boundary overlap with a real experience', () => {
    const generated = [
      real[1],
      { company: '补足公司', startDate: '2020-12', endDate: '2021-12' },
      real[0],
    ];
    expect(validateSupplementTimeline(real, generated, gap)).toEqual([]);
  });

  test('rejects a supplement that fully overlaps a real experience', () => {
    const generated = [real[1], { company: '补足公司', startDate: '2020-01', endDate: '2021-12' }, real[0]];
    expect(validateSupplementTimeline(real, generated, gap).join(' ')).toContain('不能与真实经历完全重叠');
  });

  test('rejects multiple supplements for one gap', () => {
    const generated = [
      real[1],
      { company: '补足公司 1', startDate: '2021-02', endDate: '2021-12' },
      { company: '补足公司 2', startDate: '2021-01', endDate: '2021-12' },
      real[0],
    ];
    const errors = validateSupplementTimeline(real, generated, gap).join(' ');
    expect(errors).toContain('补足经历数量必须与空档数一致');
    expect(errors).toContain('必须且只能有一段补足经历');
  });

  test('rejects reverse chronological output', () => {
    const generated = [real[0], { company: '补足公司', startDate: '2021-02', endDate: '2021-12' }, real[1]];
    expect(validateSupplementTimeline(real, generated, gap).join(' ')).toContain('从新到旧排列');
  });
});
