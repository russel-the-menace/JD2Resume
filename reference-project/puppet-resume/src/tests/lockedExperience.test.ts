import { findMissingLockedExperiences } from '../utils/lockedExperience';

describe('findMissingLockedExperiences', () => {
  const source = [
    { company: 'Acme', startDate: '2020-01', endDate: '2021-01' },
    { company: 'Acme', startDate: '2023-01', endDate: '2024-01' },
  ];

  it('accepts repeated-company stints in any generated order', () => {
    expect(findMissingLockedExperiences(source, [...source].reverse())).toEqual([]);
  });

  it('reports an existing stint whose dates were changed', () => {
    const generated = [source[0], { ...source[1], startDate: '2022-01' }];
    expect(findMissingLockedExperiences(source, generated)).toEqual([source[1]]);
  });

  it('reports an existing company omitted in favor of a supplement', () => {
    const generated = [source[0], { company: 'Generated Co', startDate: '2022-01', endDate: '2023-01' }];
    expect(findMissingLockedExperiences(source, generated)).toEqual([source[1]]);
  });
});
