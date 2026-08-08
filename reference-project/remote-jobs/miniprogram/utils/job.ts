// miniprogram/utils/job.ts
import type { AppLanguage } from './i18n'

// 统一的翻译映射表
const EN_SALARY: Record<string, string> = {
  '全部': 'All',
  '10k以下': '< 10K',
  '10-20K': '10–20K',
  '20-50K': '20–50K',
  '50K以上': '50K+',
  '项目制/兼职': 'Project/Part-time',
}

const EN_EXP: Record<string, string> = {
  '全部': 'All',
  '经验不限': 'Any',
  '1年以内': '< 1y',
  '1-3年': '1–3y',
  '3-5年': '3–5y',
  '5-10年': '5–10y',
  '10年以上': '10y+',
}

/**
 * 翻译字段值（salary 和 experience）
 * @param value 原始值（中文）
 * @param fieldType 'salary' 或 'experience'
 * @param language 用户语言设置
 * @returns 翻译后的值
 */
export function translateFieldValue(
  value: string,
  fieldType: 'salary' | 'experience',
  language?: AppLanguage | string
): string {
  if (!value || typeof value !== 'string') return value
  
  // 只有 AIEnglish 以及 AIChinese 可能需要特殊处理（但目前 AIChinese 也是中文，原值通常就是中文）
  // 普通 English 模式下，应该保持原汁原味（如果是中文数据就显示中文，如果是英文数据就显示英文）
  // 除非我们认为 Salary/Experience 是 UI 组件的一部分？
  // 根据用户指示："中文、英文只改变跟页面有关系的系统语言。不改变岗位信息，直接读取岗位原文。"
  // 因此，translateFieldValue 仅在 AIEnglish 下生效。
  
  if (language !== 'AIEnglish') return value
  
  const translationMap = fieldType === 'salary' ? EN_SALARY : EN_EXP
  return translationMap[value] || value
}

export type JobItem = {
  _id: string
  createdAt: string
  source_url: string
  salary: string
  source_name: string
  summary: string
  description?: string
  team: string
  title: string
  type: string
  tags: string[]
  displayTags?: string[]
  isSaved?: boolean // 是否为当前用户收藏（由云端函数返回）
}

export type ResolvedSavedJob = JobItem & {
  sourceCollection: string
}

export function normalizeJobTags<T extends { summary?: string; source_name?: string; experience?: string }>(
  item: T,
  language?: AppLanguage | string,
  experience?: string
): {
  tags: string[]
  displayTags: string[]
} {
  let summaryStr = item.summary || ''
  
  // 仅在 AI 模式下尝试使用多语言 summary
  if (language === 'AIEnglish' && (item as any).summary_english) {
    const enSum = (item as any).summary_english
    if (typeof enSum === 'string' && enSum.trim()) {
      summaryStr = enSum
    } else if (Array.isArray(enSum) && enSum.length > 0) {
      summaryStr = enSum.join(',')
    }
  } else if (language === 'AIChinese' && (item as any).summary_chinese) {
    const zhSum = (item as any).summary_chinese
    if (typeof zhSum === 'string' && zhSum.trim()) {
      summaryStr = zhSum
    } else if (Array.isArray(zhSum) && zhSum.length > 0) {
      summaryStr = zhSum.join(',')
    }
  }

  const tags = summaryStr
    .split(/[,，]/)
    .map((t) => t.trim().replace(/[。！!.,，、；;]+$/g, '').trim())
    .filter((t) => t && t.length > 1)

  const displayTags = [...tags]
  
  // 如果提供了 experience，将其插入到倒数第二个位置（在 source_name 之前）
  // 根据语言进行翻译
  if (experience && typeof experience === 'string' && experience.trim()) {
    const experienceTag = translateFieldValue(experience.trim(), 'experience', language)
    displayTags.push(experienceTag)
  }
  
  // AIEnglish 时不插入 source_name 到 tags
  if (language !== 'AIEnglish' && item.source_name && typeof item.source_name === 'string' && item.source_name.trim()) {
    const sourceTag = item.source_name.trim()
    displayTags.push(sourceTag)
  }

  return { tags, displayTags }
}

export function mapJobs<T extends Record<string, any>>(
  jobs: T[],
  language?: AppLanguage | string
): (T & { tags: string[]; displayTags: string[] })[] {
  const isEng = language === 'AIEnglish' || language === 'English'

  return (jobs || []).map((job) => {
    // 获取 experience 字段
    const experience = job.experience && typeof job.experience === 'string' ? job.experience.trim() : ''
    
    // 薪资处理 (English/AIEnglish 优先用英文版)
    const rawSalary = (isEng && job.salary_english) ? job.salary_english : (job.salary || '')
    const salaryStr = typeof rawSalary === 'string' ? rawSalary.trim() : ''
    const translatedSalary = translateFieldValue(salaryStr, 'salary', language)

    // 来源处理 (English/AIEnglish 优先用英文版)
    const rawSourceName = (isEng && job.source_name_english) ? job.source_name_english : (job.source_name || '')
    const sourceNameStr = typeof rawSourceName === 'string' ? rawSourceName.trim() : ''
    
    // 构造临时对象传递给 normalizeJobTags，确保使用的 source_name 是语言匹配的
    const tempJob = { ...job, source_name: sourceNameStr }
    const { tags, displayTags } = normalizeJobTags(tempJob, language, experience)

    return {
      ...job,
      salary: translatedSalary || salaryStr,
      source_name: sourceNameStr,
      tags,
      displayTags,
    }
  })
}

/**
 * 根据用户语言设置，返回对应的数据库字段名
 * @param userLanguage 用户语言设置：'Chinese'（默认）、'AIChinese'（AI翻译全中文）、'AIEnglish'（AI翻译全英文）
 * @returns 包含 titleField, summaryField, descriptionField, salaryField, sourceNameField 的对象
 */
export function getJobFieldsByLanguage(userLanguage: AppLanguage | string): {
  titleField: string
  summaryField: string
  descriptionField: string
  salaryField: string
  sourceNameField: string
} {
  // AIChinese: 使用 title_chinese, summary_chinese, description_chinese（AI翻译全中文）
  // AIEnglish: 使用 title_english, summary_english, description_english, salary_english, source_name_english（AI翻译全英文）
  // Chinese/English: 使用 title, summary, description, salary, source_name（原始字段）
  if (userLanguage === 'AIChinese') {
    return {
      titleField: 'title_chinese',
      summaryField: 'summary_chinese',
      descriptionField: 'description_chinese',
      salaryField: 'salary',
      sourceNameField: 'source_name',
    }
  } else if (userLanguage === 'AIEnglish') {
    return {
      titleField: 'title_english',
      summaryField: 'summary_english',
      descriptionField: 'description_english',
      salaryField: 'salary_english',
      sourceNameField: 'source_name_english',
    }
  } else {
    return {
      titleField: 'title',
      summaryField: 'summary',
      descriptionField: 'description',
      salaryField: 'salary',
      sourceNameField: 'source_name',
    }
  }
}

/**
 * 将查询结果中的多语言字段映射回标准字段名（title, summary, description, salary, source_name）
 * @param jobData 原始岗位数据（可能包含 title_chinese, title_english 等字段）
 * @param titleField 查询时使用的 title 字段名
 * @param summaryField 查询时使用的 summary 字段名
 * @param descriptionField 查询时使用的 description 字段名
 * @param salaryField 查询时使用的 salary 字段名
 * @param sourceNameField 查询时使用的 source_name 字段名
 * @returns 映射后的岗位数据，统一使用 title, summary, description, salary, source_name
 */
export function mapJobFieldsToStandard(
  jobData: any,
  titleField: string,
  summaryField: string,
  descriptionField: string,
  salaryField?: string,
  sourceNameField?: string
): any {
  if (!jobData) return jobData
  
  // 统一将查询的字段映射回标准字段名
  // 同时保留其它原始字段，以便 job-list 等组件做更灵活的渲染
  return {
    ...jobData,
    salary: salaryField ? (jobData[salaryField] || jobData.salary || '') : (jobData.salary || ''),
    source_name: sourceNameField ? (jobData[sourceNameField] || jobData.source_name || '') : (jobData.source_name || ''),
    title: jobData[titleField] || '',
    summary: jobData[summaryField] || '',
    description: jobData[descriptionField] || '',
  }
}
