// miniprogram/utils/salary.ts

/**
 * 解析薪资格式，提取薪资范围
 * 支持的格式：
 * - "40-50k"
 * - "40-50k·14薪水"
 * - "项目制"
 * - "兼职"
 * - "面议"
 */
export function parseSalary(salaryStr: string): { min: number; max: number; type: 'range' } | { type: 'special'; value: string } | null {
  if (!salaryStr || typeof salaryStr !== 'string') {
    return null
  }

  const str = salaryStr.trim()
  
  // 处理"项目制/兼职"类型：以"时薪"、"周薪"或"日薪"开头
  if (str.startsWith('时薪') || str.startsWith('周薪') || str.startsWith('日薪')) {
    return { type: 'special', value: str }
  }

  // 提取数字范围，支持 "40-50k" 或 "40-50k·14薪水" 格式
  // 先去掉"·14薪水"这样的后缀
  const cleanStr = str.split('·')[0].trim()
  
  // 匹配 "数字-数字k" 或 "数字-数字K" 格式
  const rangeMatch = cleanStr.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*[kK千]/)
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1])
    const max = parseFloat(rangeMatch[2])
    return { min, max, type: 'range' }
  }

  // 匹配 "数字k以上" 或 "数字K以上" 格式
  const aboveMatch = cleanStr.match(/(\d+(?:\.\d+)?)\s*[kK千]\s*以上/)
  if (aboveMatch) {
    const min = parseFloat(aboveMatch[1])
    return { min, max: Infinity, type: 'range' }
  }

  // 匹配 "数字k以下" 或 "数字K以下" 格式
  const belowMatch = cleanStr.match(/(\d+(?:\.\d+)?)\s*[kK千]\s*以下/)
  if (belowMatch) {
    const max = parseFloat(belowMatch[1])
    return { min: 0, max, type: 'range' }
  }

  // 匹配单个数字 "数字k" 或 "数字K"
  const singleMatch = cleanStr.match(/(\d+(?:\.\d+)?)\s*[kK千]/)
  if (singleMatch) {
    const value = parseFloat(singleMatch[1])
    return { min: value, max: value, type: 'range' }
  }

  return null
}

/**
 * 判断薪资是否匹配筛选条件
 */
export function matchSalary(salaryStr: string, filter: string): boolean {
  if (filter === '全部') {
    return true
  }

  const parsed = parseSalary(salaryStr)
  if (!parsed) {
    return false
  }

  // 处理"项目制/兼职"：以"时薪"、"周薪"或"日薪"开头
  if (filter === '项目制/兼职') {
    const str = salaryStr.trim()
    return str.startsWith('时薪') || str.startsWith('周薪') || str.startsWith('日薪')
  }

  // 处理范围筛选
  if (parsed.type !== 'range') {
    return false
  }

  const { min, max } = parsed

  switch (filter) {
    case '10k以下':
      return max < 10
    case '10-20K':
      return min >= 10 && max <= 20
    case '20-50K':
      return min >= 20 && max <= 50
    case '50K以上':
      return min >= 50
    default:
      return false
  }
}

