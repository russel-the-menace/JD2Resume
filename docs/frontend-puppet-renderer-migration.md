# 前端 Puppet Canonical Renderer 迁移实施规格

> 状态：待实施  
> 目标读者：后续负责 JD2Resume 渲染、分页、在线编辑、PDF 导出和回归测试的工程师  
> 约束：本文件描述的是一次架构迁移，不得在迁移过程中顺手重写简历内容生成、Puppet 排版参数或用户资料逻辑  
> 最终目标：前端当前 Chrome 是唯一分页决策者；在线 Preview 与 PDF 使用同一份 `resumeData + pagePlan + rendererVersion`；后端只复现和验证，不再重新决定分页

---

## 1. 为什么必须进行这次迁移

当前链路如下：

```text
后端 LLM 生成结构化简历
  -> 后端 Puppeteer 打开当前 React 页面
  -> server/puppet-resume/layout.ts 计算 LayoutManifest
  -> 后端返回 resume + layoutManifest
  -> src/App.tsx 再用 React 渲染一次
  -> 前端 Preview 再解释 pageCount 和页面边界
  -> PDF 导出时后端 Puppeteer 又渲染一次
```

该链路至少包含三个渲染时刻：

1. 后端生成阶段的 Puppeteer 渲染。
2. 用户浏览器中的 React Preview 渲染。
3. PDF 导出阶段的 Puppeteer 渲染。

即便三次渲染读取相同数据，只要下列任一条件不同，就可能出现页数或换行差异：

- Chrome 版本不同。
- 操作系统字体不同。
- 字体尚未完成加载。
- 图片尚未完成解码。
- Preview 外层缩放污染了测量结果。
- `scrollHeight` 包含 padding，而后端使用最后一个有效内容块的 bottom。
- 前端 CSS 与后端 Puppeteer 加载的 CSS bundle 版本不同。
- 后端使用 `print` media，前端使用 `screen` media。
- 前端重新计算页数，而不是使用后端清单。
- 旧异步任务晚于新任务完成，并覆盖了新结果。

这不是通过继续添加条件判断能够彻底解决的问题。必须建立唯一 Renderer、唯一 PagePlan 和不可绕过的版本合同。

---

## 2. 最终架构

### 2.1 职责分配

```text
后端
  - JD 解析
  - LLM 简历内容生成
  - 资料与投递证据保存
  - Draft 持久化
  - PDF 复现与最终验证

前端编辑器
  - 用户输入
  - Draft revision 管理
  - Loading 覆盖层
  - Renderer 生命周期管理
  - 保存最后一个有效 PagePlan

前端 Puppet Renderer iframe
  - 使用当前浏览器 Chrome 排版
  - 测量真实 DOM
  - 执行与 Puppet 相同的五轮调节
  - 生成 PagePlan
  - 渲染真正的独立 A4 页面
  - 返回 LayoutReport
```

### 2.2 最终数据流

```text
候选人资料 + JD
  -> 后端 LLM 返回结构化 ResumeData
  -> React Editor 保存 Draft revision
  -> Editor 将不可变 snapshot 发送给同源 Renderer iframe
  -> Renderer 等待字体和图片
  -> Renderer 测量 Puppet DOM
  -> Renderer 执行五轮内的唯一策略
  -> Renderer 生成 PagePlan
  -> Renderer 用 PagePlan 渲染真实多页 DOM
  -> Renderer 校验最终 DOM
  -> Editor 保存 PagePlan + LayoutManifestV2
  -> 移除 Preview Loading
```

PDF 导出链路：

```text
Editor 提交 ResumeData + PagePlan + snapshotHash + rendererVersion
  -> 后端创建短期 RenderSession
  -> Puppeteer 打开同一个 renderer.html
  -> Renderer 进入 replay 模式
  -> 严格按 PagePlan 渲染，不运行分页器
  -> 后端比较 DOM block 分配、页数、溢出和 hash
  -> 校验通过后输出 PDF
```

### 2.3 绝对不变量

以下条件任何一项不满足，都不得显示最终 Preview，也不得导出 PDF：

1. `pagePlan.snapshotHash === currentDraft.snapshotHash`。
2. `pagePlan.revision === currentDraft.revision`。
3. `pagePlan.rendererVersion === loadedRendererVersion`。
4. `pagePlan.pages.length === layoutManifest.pageCount`。
5. DOM 中 `.puppet-page` 数量等于 `pagePlan.pages.length`。
6. 每个预期 block 恰好出现一次。
7. 没有未知 block。
8. 没有 block 超出页面 content box。
9. 没有水平溢出。
10. 没有孤儿标题。
11. 字体已加载且字体 hash 与 Renderer 声明一致。
12. 图片已完成 `decode()`。
13. 页面填充率达到当前 Puppet 阈值。
14. PDF replay 不得改变 PagePlan。
15. 任何过期 revision 的结果不得提交到 React state 或数据库。

---

## 3. Puppet 格式的唯一来源

### 3.1 迁移期间的样式来源

前端 Renderer 只能从以下两个来源建立格式：

1. `reference-project/puppet-resume/src/template.html`
2. 当前已经由用户明确批准的 JD2Resume 覆盖项

禁止从 `modern`、`classic`、`compact` 模板推导生成简历样式。生成简历只使用 Puppet/Profile Renderer。

### 3.2 必须保留的 Puppet 基线

从 `reference-project/puppet-resume/src/template.html` 固定以下有效格式：

```text
A4 物理尺寸：210mm x 297mm
96 DPI 页面尺寸：794px x 1123px
Puppet 有效左右页边距：50px
Puppet 有效上下页边距：40px
内容宽度：694px
字体族：Puppet 中文字体族
body line-height：1.6
header padding-bottom：15px
header margin-bottom：27px
section title font-size：20px
section title margin-bottom：20px
section title margin-top：30px
section title left border：4px
personal intro font-size：14px
personal intro line-height：1.8
education school font-size：16px
education degree font-size：14px
education date font-size：13px
work company/position font-size：16px
work date font-size：13px
work item margin-bottom：25px
work header margin-bottom：10px
responsibility font-size：14px
responsibility line-height：1.7
responsibility margin-bottom：9px
skill title font-size：16px
skill item font-size：14px
skill item line-height：1.6
skill item margin-bottom：9px
```

### 3.3 已批准的项目覆盖项

以下覆盖项来自用户已经确认的产品规则，迁移时必须保留：

- 教育经历单行：学校 + 专业/学历 + 时间。
- 默认全日制不显示；只有非全日制显示括号说明。
- 个人介绍连续一个或多个换行统一渲染为一个固定段落间距。
- 当前固定段落间距为 9px，除非用户后续明确修改。
- 个人介绍只显示 1 至 2 处加深。
- 工作职责不显示加深。
- 每段工作经历只显示 1 至 2 处下划线，每条最多一处。
- 无头像时不得保留头像占位。
- 中文、英文联系方式按现有产品规则过滤空字段。
- 已批准的行高硬下限必须保留。

### 3.4 不允许的样式迁移行为

迁移 PR 中禁止：

- “顺便美化”字体。
- 修改字号来追求视觉效果。
- 修改颜色体系。
- 修改内容顺序。
- 修改技能列数策略。
- 用 `scrollHeight` 替换 Puppet 的有效内容 bottom 口径。
- 同时修改生成 Prompt 和 Renderer。
- 从浏览器默认样式继承关键 margin。
- 使用负 letter-spacing。
- 使用 viewport 字体缩放。
- 使用用户电脑可能不存在的唯一字体而没有自托管备选。

---

## 4. 坐标系统和页面盒模型

### 4.1 单一常量文件

新增：

```text
src/resume-renderer/constants.ts
```

该文件是整个项目唯一允许声明 A4 和质量阈值的位置。必须按以下内容建立，迁移期间不得自行改值：

```ts
export const RENDERER_PROTOCOL = 'jd2resume-puppet-renderer/v1';
export const RENDERER_VERSION = 'puppet-client-v1';

export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;
export const PAGE_MARGIN_TOP_PX = 40;
export const PAGE_MARGIN_RIGHT_PX = 50;
export const PAGE_MARGIN_BOTTOM_PX = 40;
export const PAGE_MARGIN_LEFT_PX = 50;
export const PAGE_CONTENT_WIDTH_PX = 694;
export const PAGE_CONTENT_HEIGHT_PX = 1043;
export const PREVIEW_PAGE_GAP_PX = 34;

export const MIN_PAGE_FILL_RATIO = 0.92;
export const TARGET_BOTTOM_MARGIN_PX = 42;
export const ORPHAN_THRESHOLD_PX = 80;
export const CALIBRATION_STEPS = 8;
export const MAX_TUNING_INTENSITY = 3;
export const MAX_LAYOUT_ATTEMPTS = 5;

export const MIN_PARAGRAPH_LINE_HEIGHT_PX = 20;
export const MIN_RESPONSIBILITY_LINE_HEIGHT_PX = 20;
export const MIN_SKILL_LINE_HEIGHT_PX = 19;

export const INPUT_LAYOUT_DEBOUNCE_MS = 250;
export const MIN_LOADING_VISIBILITY_MS = 120;
export const RENDER_TIMEOUT_MS = 5_000;
export const MAX_STABILIZATION_PASSES = 2;
export const PIXEL_EPSILON = 1;
```

实施要求：

- 删除 `src/App.tsx` 中独立的 `RESUME_PAGE_HEIGHT` 和 `RESUME_PAGE_GAP`。
- 删除 `server/puppet-resume/layout.ts` 中独立的页面和阈值常量。
- 后端 PDF validator 从可共享模块导入相同常量。
- CI 添加 `rg` 检查，阻止在其他文件重新写入 `1123`、`794`、`0.92` 等布局魔法数。

### 4.2 显式页面 margin

Puppet 原模板使用 `@page { margin: 40px 50px }`。新 Renderer 使用真实多页 DOM，不能同时使用 DOM padding 和 print margin，否则会双重留白。

新实现必须采用：

```css
@page {
  size: A4;
  margin: 0;
}

.puppet-page {
  box-sizing: border-box;
  width: 794px;
  height: 1123px;
  padding: 40px 50px;
  overflow: hidden;
  background: #fff;
}
```

这在有效视觉上等价于 Puppet 的 `@page margin`，但页面边界完全由 DOM 控制。

禁止：

- `.puppet-page` 有 padding，同时 `@page` 再设置 40px/50px margin。
- 使用 `min-height` 代替固定页面高度。
- 页面使用 `height: auto`。
- Preview 页面依靠 overflow 裁切一条长 DOM。

---

## 5. 目标文件结构

新增以下目录和文件：

```text
renderer.html
src/renderer-main.tsx
src/resume-renderer/
  constants.ts
  types.ts
  schema.ts
  canonicalJson.ts
  snapshotHash.ts
  blockIds.ts
  puppet.css
  PuppetMeasurementDocument.tsx
  PuppetPaginatedDocument.tsx
  PuppetPage.tsx
  PuppetHeader.tsx
  PuppetSummary.tsx
  PuppetEducation.tsx
  PuppetExperience.tsx
  PuppetSkills.tsx
  PuppetCertificates.tsx
  FormattedPuppetText.tsx
  measurement.ts
  blockGraph.ts
  paginate.ts
  quality.ts
  tuning.ts
  rendererMachine.ts
  protocol.ts
  LiveRendererApp.tsx
  ExportRendererApp.tsx
  errors.ts
  telemetry.ts
src/components/resume-preview/
  ResumePreviewFrame.tsx
  ResumePreviewLoading.tsx
  useResumeRenderer.ts
server/puppet-resume/
  exportSession.ts
  replayValidation.ts
```

现有 `src/App.tsx` 过大。本次迁移不得继续把分页逻辑堆进 `App.tsx`。所有新逻辑必须进入上述边界。

---

## 6. 类型合同

### 6.1 Renderer 输入

在 `src/resume-renderer/types.ts` 定义：

```ts
export type RenderRevision = number;

export interface RendererResumeDocument {
  id: string;
  documentName: string;
  language: 'chinese' | 'english';
  data: ResumeData;
  template: 'profile';
  accent: string;
  customSections: string[];
  customContent: Record<string, unknown>;
  sectionOrder: string[];
  sectionOrderCustomized: boolean;
}

export interface RenderSnapshot {
  revision: RenderRevision;
  snapshotHash: string;
  rendererVersion: string;
  document: RendererResumeDocument;
}
```

输入必须是深度不可变 snapshot。发送给 iframe 前使用 `structuredClone`。Renderer 不得持有 Editor 的可变对象引用。

### 6.2 Block 类型

```ts
export type ResumeBlockKind =
  | 'header'
  | 'section-heading'
  | 'summary-paragraph'
  | 'education-entry'
  | 'experience-heading'
  | 'experience-bullet'
  | 'skill-category-heading'
  | 'skill-item'
  | 'certificate-item';

export interface ResumeBlockDescriptor {
  id: string;
  kind: ResumeBlockKind;
  sourcePath: string;
  order: number;
  keepWithNext: number;
  atomic: boolean;
  gapBeforeToken: string;
  gapAfterToken: string;
}

export interface MeasuredResumeBlock extends ResumeBlockDescriptor {
  width: number;
  height: number;
  naturalTop: number;
  naturalBottom: number;
  computedFontSize: number;
  computedLineHeight: number;
}
```

### 6.3 PagePlan

```ts
export interface PagePlanPage {
  pageNumber: number;
  blockIds: string[];
  fillRatio: number;
  usedHeight: number;
  contentHeight: number;
}

export interface LayoutTuningV2 {
  policy: 'spacing-fit' | 'balanced-fit' | 'typography-fit' | 'combined-fit' | 'line-fit';
  sectionGapDelta: number;
  lineHeightDelta: number;
  fontSizeDelta: number;
}

export interface PagePlanV2 {
  schemaVersion: 2;
  revision: number;
  snapshotHash: string;
  rendererVersion: string;
  pageWidth: 794;
  pageHeight: 1123;
  contentWidth: 694;
  contentHeight: 1043;
  tuning: LayoutTuningV2;
  pages: PagePlanPage[];
  blockOrder: string[];
  createdAt: number;
}
```

### 6.4 LayoutReport

```ts
export interface PageQuality {
  pageNumber: number;
  fillRatio: number;
  usedHeight: number;
  overflowX: number;
  overflowY: number;
  orphanBlockIds: string[];
  duplicateBlockIds: string[];
  missingBlockIds: string[];
}

export interface LayoutAttemptReport {
  attempt: number;
  policy: LayoutTuningV2['policy'];
  tuning: LayoutTuningV2;
  pageCount: number;
  targetPageCount: number;
  valid: boolean;
  pages: PageQuality[];
  failureCodes: string[];
}

export interface LayoutReportV2 {
  schemaVersion: 2;
  revision: number;
  snapshotHash: string;
  rendererVersion: string;
  durationMs: number;
  fontFamily: string;
  fontReady: boolean;
  imageCount: number;
  attempts: LayoutAttemptReport[];
  acceptedAttempt: number | null;
  failureCode: string | null;
}
```

禁止使用自由文本错误作为唯一机器判断。所有失败必须有稳定 `failureCode`。

必须实现并稳定使用以下错误码：

```text
RENDERER_NOT_READY
PROTOCOL_MISMATCH
STALE_REVISION
SNAPSHOT_HASH_MISMATCH
FONT_LOAD_FAILED
IMAGE_DECODE_FAILED
MEASUREMENT_ROOT_MISSING
BLOCK_ID_DUPLICATE
BLOCK_ID_MISSING
BLOCK_TOO_TALL
PAGE_OVERFLOW_X
PAGE_OVERFLOW_Y
ORPHAN_HEADING
PAGE_FILL_TOO_LOW
PAGE_COUNT_MISMATCH
LAYOUT_DID_NOT_STABILIZE
LAYOUT_ATTEMPTS_EXHAUSTED
EXPORT_REPLAY_MISMATCH
RENDER_TIMEOUT
```

---

## 7. Snapshot hash

### 7.1 为什么需要 hash

仅比较 revision 不够。刷新、离线恢复、账户冲突或错误的 revision 回退都可能让相同 revision 对应不同内容。

### 7.2 Canonical JSON

新增 `canonicalJson.ts`：

```ts
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(',')}}`;
}
```

实际实现必须额外处理：

- `undefined` 统一删除，不允许序列化为实现相关值。
- `NaN`、`Infinity` 在 schema 层拒绝。
- Date 在进入 Renderer 前已经转成字符串。
- 不把 Preview zoom、scroll position、Loading 状态加入 hash。
- 把 template、accent、sectionOrder、rendererVersion 加入 hash。
- 头像使用最终 data URL 或稳定对象 ID；不能只 hash 文件名。

使用 Web Crypto：

```ts
export async function snapshotHash(document: RendererResumeDocument): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(document));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
```

后端必须实现同样的 canonicalize 测试向量，并在 PDF 导出时重新计算。

---

## 8. 稳定 Block ID

### 8.1 ID 规则

新增 `blockIds.ts`，不得在 JSX 中临时拼接不稳定 index。

必须使用以下 ID 结构：

```text
header
summary.heading
summary.paragraph.0
education.heading
education.<educationId>
experience.heading
experience.<experienceId>.heading
experience.<experienceId>.bullet.0
skills.heading
skills.<normalizedCategoryId>.heading
skills.<normalizedCategoryId>.item.0
certificates.heading
certificate.<certificateId>
```

规则：

- 优先使用持久化 entry ID。
- 数组 index 只允许用于 entry 内部且内容顺序本身就是数据的一部分，例如 bullet index。
- 删除一条经历不能改变其他经历 ID。
- 重排经历只改变 `order`，不能改变 ID。
- 同名技能分类需要稳定消歧 ID，不能只使用标题。
- 所有 ID 在保存 Draft 时生成，不能在 render 时调用 `Date.now()` 或 `Math.random()`。

### 8.2 DOM 属性

每个可分页 block 根元素必须包含：

```tsx
<div
  data-resume-block="true"
  data-block-id={block.id}
  data-block-kind={block.kind}
  data-source-path={block.sourcePath}
/>
```

不得在 block 内再放另一个同级 `data-resume-block=true`，除非父元素只作为非测量容器。

---

## 9. Puppet React 组件迁移

### 9.1 组件只能渲染，不得测量

`PuppetHeader.tsx`、`PuppetSummary.tsx` 等展示组件必须是纯组件：

- 输入相同，DOM 结构相同。
- 组件内部不得读取 window 尺寸。
- 组件内部不得设置布局 state。
- 组件内部不得调用分页函数。
- 组件内部不得保存数据。
- 不得使用随机 key。

### 9.2 FormattedPuppetText

从当前 `src/App.tsx` 抽出 `FormattedPuppetText`，保持已批准规则：

```ts
interface FormattedPuppetTextProps {
  value: string;
  allowBold?: boolean;
  allowUnderline?: boolean;
  maxBold?: number;
  maxUnderline?: number;
}
```

行为必须保持：

- 个人介绍 `allowBold=true, maxBold=2`。
- 个人介绍 `allowUnderline=false`。
- 工作职责 `allowBold=false`。
- 工作职责每段最多两条含 underline，每条 `maxUnderline=1`。
- 技能与证书默认不解释富文本标签。
- 一个或多个连续换行输出一个 `.puppet-paragraph-break`。
- `.puppet-paragraph-break` 固定 9px。
- 不允许 `dangerouslySetInnerHTML`。
- 不允许任意 HTML 标签穿透。

### 9.3 页面结构

Measurement 文档渲染一条自然流，只用于测量：

```tsx
<div className="puppet-measurement-root" aria-hidden="true">
  <PuppetMeasurementDocument snapshot={snapshot} tuning={tuning} />
</div>
```

最终 Preview 渲染真实页面：

```tsx
<main
  className="puppet-document"
  data-renderer-version={RENDERER_VERSION}
  data-snapshot-hash={pagePlan.snapshotHash}
  data-page-count={pagePlan.pages.length}
>
  {pagePlan.pages.map((page) => (
    <PuppetPage key={page.pageNumber} page={page} snapshot={snapshot} />
  ))}
</main>
```

最终页面不得通过 `translateY(-pageIndex * 1123)` 复制并裁切长 DOM。每个 Page 必须只渲染属于自己的 block。

---

## 10. 字体和图片稳定

### 10.1 字体

当前 Puppet 字体栈在 macOS 和 Linux 会选择不同字体，这是 Preview/PDF 差异的主要风险。

切换前必须完成一次字体决策：

1. 从 Puppet 已允许字体中选择一个可合法自托管的中文字体，例如 Source Han Sans CN/Noto Sans CJK SC。
2. 将 WOFF2 资产存入 `public/fonts/puppet/`。
3. 在 `puppet.css` 中使用 `@font-face`。
4. Renderer 的第一字体必须是该自托管字体。
5. Preview 和后端 Puppeteer必须请求相同字体 URL。
6. 字体请求失败视为布局失败，不能静默使用系统 fallback 生成最终版本。

示例：

```css
@font-face {
  font-family: 'JD2Resume Puppet Sans';
  src: url('/fonts/puppet/puppet-sans-sc.woff2') format('woff2');
  font-style: normal;
  font-weight: 400 800;
  font-display: block;
}
```

`font-display: block` 是为了避免先用 fallback 测量后再换字体。

Renderer 开始测量前：

```ts
await document.fonts.load('14px "JD2Resume Puppet Sans"');
await document.fonts.ready;
if (!document.fonts.check('14px "JD2Resume Puppet Sans"')) {
  throw new RendererError('FONT_LOAD_FAILED');
}
```

### 10.2 图片

```ts
export async function waitForImages(root: ParentNode): Promise<void> {
  const images = [...root.querySelectorAll('img')];
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => reject(new Error('IMAGE_DECODE_FAILED')), { once: true });
      });
    }
    await image.decode();
  }));
}
```

要求：

- 头像尺寸必须在 CSS 中预先固定。
- 无头像时 DOM 中不得生成空图片。
- 图片失败不得继续测量。
- 调整中用户更换头像时，旧 decode promise 的结果必须因 revision 过期而丢弃。

---

## 11. 测量实现

### 11.1 Measurement Root

```css
.puppet-measurement-host {
  position: fixed;
  top: 0;
  left: -100000px;
  width: 794px;
  visibility: hidden;
  pointer-events: none;
  contain: layout style;
}
```

禁止使用 `display: none`，否则 rect 为 0。

Measurement Root 不允许：

- 被 Preview zoom transform 包裹。
- 被 editor width 影响。
- 使用百分比视口宽度。
- 使用异步外部 CSS 未等待加载。

### 11.2 测量时序

每次 revision 依次执行：

```text
1. schema 校验 snapshot
2. 校验 revision 是否仍为最新
3. 写入 Measurement DOM
4. 等待字体
5. 等待图片
6. requestAnimationFrame
7. requestAnimationFrame
8. 读取所有 block rect
9. 读取关键 computed style
10. 再次校验 revision
11. 进入分页
```

两个 animation frame 不得换成固定 `setTimeout`。

### 11.3 block 高度与外部 gap 分离

不要依赖 margin collapsing。每个 block wrapper 内部包含自身内容，block 之间的 gap 由 token 显式计算。

```ts
interface GapTable {
  sectionBefore: number;
  headingAfter: number;
  entryBefore: number;
  bulletBefore: number;
  skillCategoryBefore: number;
}
```

分页模拟时使用：

```ts
requiredHeight = gapBefore(block, previousBlock, tuning) + block.height;
```

Page 顶部第一个 block 的 leading gap 按 Puppet 的页面折叠规则归零。该规则必须在 `gapBefore()` 中实现，不得散落在组件 CSS。

### 11.4 oversized block

如果 `block.height > PAGE_CONTENT_HEIGHT_PX`：

- 不允许裁切。
- 不允许缩放整个 block。
- 返回 `BLOCK_TOO_TALL`。
- 报告 block ID、sourcePath、height 和允许高度。
- 初次 AI 生成允许进入内容微调步骤。
- 手工编辑不得让 LLM 自动改写用户文本。

---

## 12. Block 约束图

新增 `blockGraph.ts`，集中表达不可拆规则。

### 12.1 Header

- `header` 只允许在第一页。
- header 不允许拆分。
- header 高度超过页面直接失败。

### 12.2 Section heading

- section heading `keepWithNext=1`。
- heading 与下一实际内容必须同页。
- 空 section 不渲染 heading。

### 12.3 个人介绍

- 以段落为原子 block。
- 不允许在段落文字中间拆分。
- 第一段与 section heading 同页。
- 连续换行不产生多个空 block。

### 12.4 教育经历

- 单条教育经历为原子 block。
- 学校、专业/学历、时间在同一 block。
- 教育 block 不允许跨页。

### 12.5 工作经历

- entry heading 是独立 block。
- entry heading `keepWithNext=1`，必须和第一条职责同页。
- 每条职责是原子 block。
- 工作经历允许在职责之间分页。
- 严格沿用 Puppet 行为，不自动在续页重复公司标题，除非后续用户明确批准。
- 不允许 bullet 中间分页。

### 12.6 技能

- category heading `keepWithNext=1`。
- 每条 skill item 是原子 block。
- category 可在 item 之间分页。
- 续页不重复 category heading，保持 Puppet 兼容行为。

### 12.7 证书

- 每个证书是原子 block。
- 允许在证书之间分页。
- 证书 section heading 与第一个证书同页。

---

## 13. 分页算法

### 13.1 迁移阶段不得发明新页数策略

第一版前端分页必须兼容当前 `server/puppet-resume/layout.ts`：

```text
PAGE_HEIGHT = 1123
MIN_PAGE_FILL_RATIO = 0.92
TARGET_BOTTOM_MARGIN = 42
CALIBRATION_STEPS = 8
MAX_TUNING_INTENSITY = 3
MIN_PARAGRAPH_LINE_HEIGHT = 20
MIN_RESPONSIBILITY_LINE_HEIGHT = 20
MIN_SKILL_LINE_HEIGHT = 19
```

五个策略及顺序必须原样迁移：

```ts
export const PUPPET_TUNING_STRATEGIES = [
  { id: 'spacing-fit', sectionGapDelta: 14, lineHeightDelta: 0, fontSizeDelta: 0 },
  { id: 'balanced-fit', sectionGapDelta: 8, lineHeightDelta: 4, fontSizeDelta: 0 },
  { id: 'typography-fit', sectionGapDelta: 2, lineHeightDelta: 2, fontSizeDelta: 1 },
  { id: 'combined-fit', sectionGapDelta: 10, lineHeightDelta: 5, fontSizeDelta: 0.8 },
  { id: 'line-fit', sectionGapDelta: 0, lineHeightDelta: 6, fontSizeDelta: 0 },
] as const;
```

迁移完成且双跑 100% 对齐之前，禁止修改这些数值。

### 13.2 自然测量

```ts
const natural = await measureWithTuning(NATURAL_TUNING);
const targetPageCount = Math.max(1, Math.round(natural.contentBottom / A4_HEIGHT_PX));
const targetBottom = targetPageCount * A4_HEIGHT_PX - TARGET_BOTTOM_MARGIN_PX;
const direction = natural.contentBottom <= targetBottom ? 1 : -1;
```

该计算是兼容层。不得在迁移时擅自改成经历数量硬编码或简单 `Math.ceil(scrollHeight / 1123)`。

### 13.3 每个策略的 8 步校准

迁移 `calibrateStrategy` 的二分逻辑，且将 DOM 操作改为 Renderer 内部 CSS variables：

```ts
for (let step = 0; step < CALIBRATION_STEPS; step += 1) {
  assertCurrentRevision();
  const intensity = step === 0 ? 1 : (lower + upper) / 2;
  const tuning = scaledTuning(strategy, direction, intensity);
  const measurement = await measureWithTuning(tuning);
  const plan = paginateBlocks(measurement, tuning);
  const quality = await validateRenderedPlan(snapshot, plan, tuning);
  recordAttemptStep();
  updateBinarySearchBounds();
}
```

同一策略内部的 8 次强度测量不是五次“独立调整”。五次独立调整指五个策略 ID，不能重复。

### 13.4 greedy page assignment

分页主循环必须是纯函数，不能直接操作 DOM：

```ts
for (const group of constrainedGroups) {
  const required = heightWithGaps(group, currentPage, tuning);
  if (required <= currentPage.remainingHeight) {
    appendGroup(currentPage, group);
    continue;
  }

  if (currentPage.blockIds.length === 0) {
    throw new RendererError('BLOCK_TOO_TALL', group);
  }

  currentPage = createNextPage();
  const retryRequired = heightWithGaps(group, currentPage, tuning);
  if (retryRequired > currentPage.remainingHeight) {
    throw new RendererError('BLOCK_TOO_TALL', group);
  }
  appendGroup(currentPage, group);
}
```

要求：

- 不能丢 block。
- 不能重复 block。
- 不能为了命中页数截断最后的 block。
- 不能把 overflow hidden 当成成功。
- 不能生成空的中间页。
- 最后一页为空时必须删除，并记录原因。

兼容 Puppet 的填充率不能简单使用 `usedHeight / PAGE_CONTENT_HEIGHT_PX`。当前后端以整张 A4 页面坐标计算内容 bottom，因此必须同时保存两种指标：

```ts
const contentFillRatio = usedHeight / PAGE_CONTENT_HEIGHT_PX;
const puppetAbsoluteBottom = PAGE_MARGIN_TOP_PX + usedHeight;
const puppetFillRatio = Math.min(1, puppetAbsoluteBottom / A4_HEIGHT_PX);
```

迁移和 legacy parity 使用 `puppetFillRatio`；产品诊断可以额外显示 `contentFillRatio`，但不能混用两个字段。`PagePlanPage.fillRatio` 在 schema v2 中明确代表 `puppetFillRatio`。

### 13.5 最终 DOM 二次验证

PagePlan 只是模拟结果。必须用 PagePlan 生成最终 DOM 后再次读取真实 rect。

二次验证内容：

```text
实际页面数
每页 content box
每个 block 的 pageNumber
每个 block top/bottom/left/right
每页实际 fillRatio
标题与后续 block 的页面关系
computed font-size/line-height
页面 scrollWidth/clientWidth
页面 scrollHeight/clientHeight
```

模拟和最终 DOM 差异超过 `PIXEL_EPSILON=1px` 时：

1. 最多允许重新测量一次。
2. 第二次仍不稳定，返回 `LAYOUT_DID_NOT_STABILIZE`。
3. 不允许无限 ResizeObserver 循环。

---

## 14. 五轮策略和失败行为

### 14.1 五个策略必须唯一

```ts
const attemptedPolicies = new Set<string>();
for (const strategy of PUPPET_TUNING_STRATEGIES) {
  if (attemptedPolicies.has(strategy.id)) {
    throw new Error(`Duplicate layout strategy: ${strategy.id}`);
  }
  attemptedPolicies.add(strategy.id);
  // calibrate and validate
}
```

### 14.2 初次 AI 生成与手工编辑的区别

初次 AI 生成：

- 可以在五种布局策略均失败后，请求一次后端内容微调。
- 内容微调必须携带精确 block ID 和目标长度。
- 微调后视为新的 Draft revision，重新从自然测量开始。
- 内容微调次数仍受产品整体限制，不能无限循环。

手工编辑：

- 不允许 LLM 自动改写用户刚输入的文字。
- 可以自然增加页数。
- 可以在硬下限内调整间距、行高和字号。
- 仍失败则保留 Draft，Preview 保持 Loading 错误态。

### 14.3 五轮失败

失败后：

- 不保存无效 PagePlan。
- 不覆盖最后一个有效 PagePlan。
- Draft 继续保存，避免丢数据。
- Preview 保持遮罩。
- 导出按钮禁用。
- 显示用户可理解错误，不展示内部 JSON。
- 完整 LayoutReport 写入本地诊断日志和测试输出。

---

## 15. Renderer iframe 协议

### 15.1 为什么使用 iframe

- 使用用户当前 Chrome，避免后端网络往返。
- 隔离编辑器 CSS 与 Puppet CSS。
- 保证测量根和 Preview 使用同一 document/font environment。
- 同一 Renderer bundle 可供后端 export replay 使用。

### 15.2 renderer.html

新增根目录 `renderer.html`，只加载：

```html
<div id="renderer-root"></div>
<script type="module" src="/src/renderer-main.tsx"></script>
```

不得加载主应用 `App.tsx`，不得初始化账户数据库，不得读取编辑器 localStorage。

Vite build 必须配置 multi-page input，确保生产环境输出该入口。

### 15.3 消息类型

`protocol.ts`：

```ts
export type EditorToRendererMessage =
  | {
      protocol: typeof RENDERER_PROTOCOL;
      kind: 'RENDER';
      requestId: string;
      snapshot: RenderSnapshot;
    }
  | {
      protocol: typeof RENDERER_PROTOCOL;
      kind: 'CANCEL';
      requestId: string;
      revision: number;
    };

export type RendererToEditorMessage =
  | { protocol: string; kind: 'READY'; rendererVersion: string }
  | { protocol: string; kind: 'RENDER_STARTED'; requestId: string; revision: number }
  | {
      protocol: string;
      kind: 'RENDER_SUCCEEDED';
      requestId: string;
      revision: number;
      snapshotHash: string;
      pagePlan: PagePlanV2;
      report: LayoutReportV2;
    }
  | {
      protocol: string;
      kind: 'RENDER_FAILED';
      requestId: string;
      revision: number;
      snapshotHash: string;
      failureCode: string;
      report: LayoutReportV2;
    };
```

### 15.4 安全与顺序

Parent：

- 只接受 `event.source === iframe.contentWindow`。
- 只接受 `event.origin === window.location.origin`。
- 只接受协议版本完全匹配。
- 只接受当前 requestId/revision/hash。

Renderer：

- 只接受 `event.source === window.parent`。
- 只接受同源消息。
- schema 校验 snapshot。
- 每次新 RENDER 取消旧 AbortController。

禁止使用 `postMessage(message, '*')`。

---

## 16. Renderer 状态机

`rendererMachine.ts` 使用明确状态，不使用多个互相推断的 boolean：

```ts
type RendererState =
  | { status: 'booting' }
  | { status: 'idle'; rendererVersion: string }
  | { status: 'measuring'; requestId: string; revision: number }
  | { status: 'tuning'; requestId: string; revision: number; attempt: number }
  | { status: 'validating'; requestId: string; revision: number }
  | { status: 'ready'; requestId: string; revision: number; pagePlan: PagePlanV2 }
  | { status: 'failed'; requestId: string; revision: number; failureCode: string };
```

允许转换：

```text
booting -> idle
idle -> measuring
ready -> measuring
failed -> measuring
measuring -> tuning
tuning -> validating
validating -> ready
measuring/tuning/validating -> failed
measuring/tuning/validating -> measuring（仅新 revision 取消旧任务后）
```

禁止：

- failed 直接变 ready 而没有新 render。
- 旧 revision 把新 state 改回 ready。
- 同时存在两个 measuring task。

---

## 17. Editor 行为逐项规定

### 17.1 文本输入

行为：

1. input/textarea 本地 state 立即更新，不等待 Renderer。
2. Draft revision 立即加 1。
3. Preview 立即覆盖 Loading。
4. 启动 250ms debounce。
5. 250ms 内继续输入则取消 timer，保持同一个 Loading，不闪烁。
6. 停止输入后生成 snapshot/hash。
7. 发送 RENDER。
8. 只有 SUCCEEDED 且 revision/hash 匹配才移除 Loading。

### 17.2 日期、下拉框、checkbox

- change 后立即增加 revision。
- 不等待 250ms，下一 animation frame 发 RENDER。
- 多个同一事件循环内的更新合并一次。

### 17.3 添加、删除、重排经历

- 操作完成立即进入 Loading。
- 先确保稳定 ID 已保存。
- 删除经历后 PagePlan 中存在旧 ID 必须视为 stale，不能复用。
- 拖动过程中不排版；pointer up 后只排一次。

### 17.4 模板和字体

- 生成简历只允许 Puppet/Profile Renderer。
- 切换至其他编辑器模板时，不得把非 Puppet CSS 用于生成简历最终 PDF。
- 如果产品仍保留模板切换，PagePlan 必须包含 template ID，切换后 hash 改变并完整重排。

### 17.5 颜色

- 如果只改变 color，不改变 border width/font/spacing，可直接更新 iframe CSS variable。
- 仍需增加 snapshot revision 并保存。
- 可以跳过测量，但必须生成新的 snapshotHash/PagePlan metadata。
- 实现复杂时优先完整快速重排，不允许 hash 与颜色不一致。

### 17.6 头像

- 文件大小校验保持现有规则。
- data URL 更新后立即 Loading。
- Renderer 等待 decode。
- decode 失败返回错误，不能展示半加载头像。

### 17.7 Zoom、Pan、窗口 Resize

- Zoom 和 Pan 属于 Preview 外壳，不进入 snapshotHash。
- 不重新分页。
- 页面固定 794x1123，只调整外层 transform。
- 窗口 Resize 只重新计算 fit scale。
- DPR 变化不得改变 Measurement Root CSS pixel 尺寸。

### 17.8 导入资料

- 导入分模块过程中不连续触发 Renderer。
- Import 全部合并并保存后只增加一次 Draft revision。
- 英文资料按需生成完成后单独产生英文 Draft revision。

### 17.9 自动保存

- Draft 保存和 PagePlan 保存分开。
- Draft 可以处于 `layoutStatus=dirty/failed`。
- 只有 SUCCEEDED 才保存 `layoutStatus=valid` 和 PagePlan。
- 远程保存冲突时先处理 account snapshot revision，不能用旧 PagePlan覆盖新 Draft。

### 17.10 刷新

刷新后：

1. 加载 Draft。
2. 如果 PagePlan hash/version 完全匹配，可先显示保存的有效页面。
3. 后台快速 replay 验证。
4. 如果不匹配，立即 Loading 并重排。
5. 不允许根据旧 `layoutManifest.pageCount` 伪造页面。

---

## 18. Preview Loading 规格

新增 `ResumePreviewLoading.tsx`。

### 18.1 DOM

```tsx
<div className="resume-preview-loading" role="status" aria-live="polite">
  <LoaderCircle aria-hidden="true" />
  <span>Updating preview</span>
</div>
```

中文界面使用“正在排版”。

### 18.2 行为

- 覆盖整个 Preview page area，不覆盖左侧编辑器。
- `preview-panel` 设置 `aria-busy=true`。
- Loading 出现时 Export disabled。
- 保留上一个有效 Preview 在遮罩下，防止布局跳白。
- Loading 至少显示 120ms，防止闪烁。
- 如果新任务在 120ms 内完成，延迟到 120ms 后原子揭示。
- 连续输入期间不重复卸载/挂载 Loading。
- 成功时一次性替换整个 PagePlan，不逐页更新。
- 失败时遮罩变为错误态，并提供 Retry。

### 18.3 禁止行为

- Loading 时显示未经验证的新页面。
- 一页一页闪现。
- 输入框被 disabled。
- 用全屏 cursor wait。
- 失败后自动回退并假装当前 Preview 对应最新 Draft。

---

## 19. 持久化迁移

当前 `server/persistence.ts` 以 `account_snapshots.payload` 保存整个账户 JSON，不需要立即增加 SQL 表，但必须升级 document schema。

### 19.1 Library version

将 `LIBRARY_VERSION` 从 2 升级到 3。

新 document：

```ts
interface ResumeDocumentV3 extends ResumeDocumentV2 {
  renderState: {
    schemaVersion: 2;
    status: 'dirty' | 'rendering' | 'valid' | 'failed';
    draftRevision: number;
    currentSnapshotHash: string;
    rendererVersion: string;
    pagePlan: PagePlanV2 | null;
    layoutReport: LayoutReportV2 | null;
    lastValidSnapshotHash: string;
    lastValidAt: number;
  };
  legacyLayoutManifest?: LayoutManifest;
}
```

### 19.2 V2 -> V3 migration

对每份旧简历：

- 完整保留 `data`。
- 完整保留投递证据。
- 完整保留 template/accent/order。
- 将旧 `layoutManifest` 移到 `legacyLayoutManifest` 或保持兼容读取。
- `renderState.status='dirty'`。
- `pagePlan=null`。
- 打开时由前端生成新 PagePlan。
- 迁移不能调用 LLM。
- 迁移不能删除旧 layout manifest，直到回滚窗口结束。

### 19.3 payload 大小

`server/persistence.ts` 当前限制 16MB。PagePlan 只保存 block ID、页面分配和报告摘要：

- 不保存每个字符坐标。
- 不保存 HTML snapshot。
- 不保存截图。
- 完整调试 rect 只进入本地测试日志，不进入账户 payload。

---

## 20. 后端生成接口迁移

当前 `vite.config.ts` 的 `/api/generate-resume` 在内容生成后调用：

```ts
const layoutManifest = await resolvePuppetLayout(origin, renderDocument);
```

迁移必须分阶段。

### 20.1 双跑阶段

后端仍计算 legacy manifest，但 API 同时返回：

```json
{
  "resume": {},
  "legacyLayoutManifest": {},
  "layoutAuthority": "dual-run"
}
```

前端 Renderer 计算 PagePlan，然后比较：

```text
page count
tuning policy
tuning deltas
fill ratios
orphan result
```

差异只记录，不影响用户，直到门槛达成。

### 20.2 切换阶段

API 不再等待 Puppeteer布局：

```json
{
  "resume": {},
  "layoutAuthority": "client-puppet-v1",
  "layoutStatus": "pending"
}
```

前端收到内容后显示 Loading，直到生成有效 PagePlan。

### 20.3 清理阶段

满足删除门槛后：

- 从生成接口删除 `resolvePuppetLayout`。
- 保留后端 replay validator。
- `server/puppet-resume/layout.ts` 不再包含分页决策。
- 将 PDF 相关代码迁入 `replayValidation.ts`。

---

## 21. PDF replay 实现

### 21.1 请求合同

`POST /api/export-pdf`：

```ts
interface ExportPdfRequest {
  document: RendererResumeDocument;
  pagePlan: PagePlanV2;
  snapshotHash: string;
  rendererVersion: string;
}
```

后端先执行：

1. schema 校验。
2. 重新 canonicalize document。
3. 重新计算 hash。
4. 比较请求 hash。
5. 比较 PagePlan hash/version。
6. 拒绝 dirty/failed layout。

### 21.2 RenderSession

不要继续把整个账户塞进 Puppeteer localStorage。新增短期 session：

```ts
interface ExportRenderSession {
  token: string;
  document: RendererResumeDocument;
  pagePlan: PagePlanV2;
  expiresAt: number;
  consumed: boolean;
}
```

单机当前实现可使用内存 Map：

- token 使用 `randomUUID()` 加高熵随机值。
- TTL 60 秒。
- 只读一次。
- 读取后标记 consumed。
- 每分钟清理过期 token。
- API 不向日志输出文档内容。

Puppeteer 打开：

```text
/renderer.html?mode=export&session=<token>
```

### 21.3 后端不得重新分页

Export Renderer：

- 直接读取 PagePlan。
- 每个 `.puppet-page` 渲染指定 blockIds。
- 不调用 `paginate()`。
- 不调用 tuning search。
- 不更改 page count。

### 21.4 replay 校验

后端读取 DOM：

```ts
interface ReplayResult {
  rendererVersion: string;
  snapshotHash: string;
  pageCount: number;
  pages: Array<{
    pageNumber: number;
    blockIds: string[];
    overflowX: number;
    overflowY: number;
  }>;
}
```

严格比较：

- pageCount 完全相同。
- 每页 blockIds 顺序完全相同。
- 没有 overflow。
- hash/version 完全相同。

任何差异返回 `EXPORT_REPLAY_MISMATCH`，禁止自动重新分页。

### 21.5 Chrome 版本

当前 `layout.ts` 会搜索系统 Chrome。清理时改为固定版本：

- CI 和生产使用 Puppeteer 对应的固定 Chromium。
- 或显式配置 `PUPPETEER_EXECUTABLE_PATH` 并在启动日志打印版本。
- 不允许静默选择不同系统浏览器。
- PDF metadata 记录 rendererVersion 和 Chrome major version。

---

## 22. 性能实现

### 22.1 目标

```text
输入响应：< 16ms，不被布局阻塞
普通单页布局：< 100ms
常规两三页布局：< 300ms
复杂多页布局：< 800ms
iframe 启动后 READY：< 500ms
Loading 原子揭示：< 50ms
```

### 22.2 优化顺序

先保证正确，再优化。禁止在 parity 未通过前做测量缓存。

正确后按顺序优化：

1. iframe 常驻，不重复创建。
2. 字体只加载一次。
3. 只替换 Measurement snapshot。
4. 相同 snapshotHash 读取 PagePlan cache。
5. 只有影响 layout 的字段触发测量。
6. 合并同一 animation frame 内的多次更新。
7. 取消 stale task。
8. 最后才考虑 block 局部测量缓存。

### 22.3 不能做的“优化”

- 使用 Canvas 估算替代真实 DOM。
- 只按字符数估算高度。
- 使用 Web Worker测量 DOM；Worker 没有真实布局。
- 为了速度跳过字体等待。
- 在 Loading 下先展示未校验结果。
- 缓存 key 不包含 rendererVersion/template/accent。

---

## 23. 测试设计

### 23.1 新增脚本

```text
scripts/verify-renderer-contract.mts
scripts/verify-renderer-pagination.mts
scripts/verify-renderer-concurrency.mts
scripts/verify-renderer-pdf-parity.mts
scripts/verify-renderer-migration.mts
```

package scripts：

```json
{
  "check:renderer-contract": "tsx scripts/verify-renderer-contract.mts",
  "check:renderer-pagination": "tsx scripts/verify-renderer-pagination.mts",
  "check:renderer-concurrency": "tsx scripts/verify-renderer-concurrency.mts",
  "check:renderer-parity": "tsx scripts/verify-renderer-pdf-parity.mts",
  "check:renderer-migration": "tsx scripts/verify-renderer-migration.mts"
}
```

### 23.2 纯函数单元测试

覆盖：

- canonical JSON key 顺序。
- snapshot hash 测试向量。
- block ID 稳定性。
- gap 计算。
- keepWithNext 分组。
- greedy page assignment。
- oversized block。
- 空 section。
- 空最后一页删除。
- 五个策略唯一。
- 8 步二分边界。
- stale revision 丢弃。

### 23.3 DOM 边界 fixture

至少建立：

```text
minimal-one-page-cn
minimal-one-page-en
exact-boundary-minus-1px
exact-boundary-plus-1px
two-page-summary-split
two-page-experience-split
orphan-section-heading
orphan-experience-heading
long-unbroken-url
long-english-word
mixed-cjk-latin
avatar-loaded
avatar-delayed
font-delayed
font-failed
seven-page-long-resume
certificate-wrap
education-long-one-line
```

### 23.4 行为测试

必须断言：

- 输入时左侧没有卡顿。
- Layout 开始立即覆盖 Loading。
- 连续输入期间 Loading 不闪。
- 旧 revision 成功不会揭示 Preview。
- 最新 revision 成功才揭示。
- 失败后 Export disabled。
- Retry 产生新 requestId。
- Zoom 不触发重排。
- Resize 不改变 page count。
- 图片 decode 前不测量。
- 字体失败不显示最终页面。

### 23.5 Preview/PDF parity

对每个 fixture：

1. 前端生成 PagePlan。
2. 保存 blockIds 和 page count。
3. 后端 replay。
4. 比较每页 blockIds。
5. 导出 PDF。
6. 使用 PDF parser 比较页数。
7. 比较 PDF 文本是否完整。
8. 对关键 fixture 截图像素比较。

通过条件：

```text
page count：100% 相同
page block membership：100% 相同
block order：100% 相同
missing/duplicate block：0
overflow：0
关键坐标差异：<= 1px
```

### 23.6 真实数据库回归

迁移工具只读获取现有账户简历：

- 不输出个人正文到日志。
- 只记录 resume ID hash、旧页数、新页数、策略、差异码。
- 不覆盖数据库。
- 至少覆盖当前 `junling` 的真实生成简历。
- 所有现有生成简历差异率必须为 0 才能切换 authority。

---

## 24. 双跑与 Feature Flag

### 24.1 Feature flags

```text
VITE_CLIENT_PUPPET_RENDERER=off|shadow|on
PUPPET_LAYOUT_AUTHORITY=server|dual|client
PUPPET_EXPORT_REPLAY=off|on
```

定义：

- `off/server`：完全旧行为。
- `shadow/dual`：用户仍看旧结果，前端新 Renderer 后台计算并记录差异。
- `on/client`：前端 PagePlan 是唯一 authority。

### 24.2 Shadow 模式

Shadow 模式不能：

- 改变用户 Preview。
- 改变保存数据。
- 改变 PDF。
- 阻塞生成。

Shadow 模式只记录：

```text
resumeIdHash
snapshotHash
legacyPageCount
clientPageCount
legacyPolicy
clientPolicy
fillRatioDelta
orphanDifference
durationMs
rendererVersion
```

### 24.3 切换门槛

必须同时满足：

- 自动化测试全部通过。
- 现有数据库生成简历页数一致率 100%。
- block 丢失/重复为 0。
- Preview/PDF parity 100%。
- 中文、英文 fixture 全通过。
- macOS Chrome 和生产 Chromium 回放通过。
- 失败回滚演练通过。
- Loading 和 stale revision 测试通过。

---

## 25. 分阶段实施顺序

### Phase 0：冻结和基线

行为：

1. 保存当前真实简历的 legacy manifest。
2. 保存当前 PDF 页数。
3. 保存关键截图。
4. 冻结 Puppet CSS 参数。
5. 确认自托管字体。
6. 建立 fixture。

禁止修改生产 authority。

推荐提交：

```text
ci(renderer): capture Puppet layout baselines
```

### Phase 1：共享合同

新增 constants、types、schema、hash、block IDs，不改 UI。

验收：

- 类型检查通过。
- hash 前后端测试向量一致。
- 无现有行为变化。

推荐提交：

```text
feat(renderer): add canonical Puppet contracts
```

### Phase 2：纯 Puppet React Renderer

将 Profile/Puppet 展示组件从 `App.tsx` 抽离。此阶段仍然渲染连续文档，不实现分页。

验收：

- 与现有 Puppet/Profile 截图一致。
- 字体、行高、教育单行、强调规则一致。
- App.tsx 不再拥有格式化文本和 Puppet section JSX。

推荐提交：

```text
style(renderer): port the approved Puppet presentation
```

### Phase 3：Measurement 和 PagePlan

实现测量、block graph、分页、quality、tuning。

验收：

- 纯函数测试通过。
- fixture 页数与 legacy 一致。
- 五策略和阈值未改变。

推荐提交：

```text
feat(renderer): add deterministic client pagination
```

### Phase 4：iframe 和 Loading

实现 renderer.html、协议、状态机、Preview Loading。

验收：

- 编辑不阻塞。
- stale revision 不覆盖。
- Loading 行为全部通过。
- Preview 渲染真正独立页面。

推荐提交：

```text
feat(resume): add canonical live Puppet preview
```

### Phase 5：Shadow 双跑

保留后端 layout authority，新前端后台计算。

验收：

- 所有真实简历差异为 0。
- 性能达到目标。
- 不改变用户结果。

推荐提交：

```text
ci(renderer): verify client and server layout parity
```

### Phase 6：切换 Preview authority

前端 PagePlan 成为 Preview 唯一来源；保存 V3 renderState。

验收：

- 服务端 2 页/前端 3 页问题不可能发生。
- 工具栏页数来自 PagePlan。
- DOM 页面数来自 PagePlan。
- Loading 未完成时不展示新 Draft。

推荐提交：

```text
feat(resume): make client Puppet layout authoritative
```

### Phase 7：PDF replay

后端按照 PagePlan 复现和校验。

验收：

- 后端不运行分页器。
- 不允许页数变化。
- 所有 fixture Preview/PDF 相同。

推荐提交：

```text
feat(pdf): replay canonical client page plans
```

### Phase 8：清理旧后端决策

仅在观察窗口和回滚演练完成后：

- 删除生成接口中的 `resolvePuppetLayout`。
- 删除 Puppeteer seed localStorage 逻辑。
- 删除前端长 DOM裁切分页。
- 删除旧 layout authority 分支。
- 保留 replay validation 和 legacy document migration。

推荐提交：

```text
perf(resume): remove duplicate server layout calculation
```

---

## 26. 逐文件改动清单

### `src/App.tsx`

最终必须移出：

- `RESUME_PAGE_HEIGHT`
- `RESUME_PAGE_GAP`
- `normalizeLayoutManifest` 的 V2 逻辑
- `PreviewPanel` 内的 contentHeight/pageCount 推断
- `ResumeStage` 内与内容分页耦合的逻辑
- `ResumePage`
- `ResumeContentSection`
- `ExperienceEntries`
- `EducationEntries`
- `ProfileSkills`
- `FormattedPuppetText`

最终保留：

- Editor state。
- Draft revision。
- Preview 外层 zoom/pan。
- iframe host。
- Loading 状态。
- 保存和账户同步入口。

### `src/styles.css`

最终移出：

- `.resume-page` 及 Puppet/Profile 内容样式。
- `.resume-pages`、`.resume-sheet-content` 的长 DOM裁切方案。
- Puppet print CSS。

最终保留：

- 编辑器 UI。
- Preview panel 外壳。
- zoom/pan 外层。
- Loading overlay。

Puppet 内容样式全部迁入独立 `puppet.css`。

### `server/puppet-resume/layout.ts`

迁移初期保留作为 legacy oracle。

最终拆分：

- 删除 `resolvePuppetLayout`。
- 删除 `applyTuning`。
- 删除 server-side strategy search。
- 删除 localStorage seed。
- `renderPuppetPdf` 改为 `renderPdfFromPagePlan`。
- `assess` 改为 replay-only validator，不计算新 page count。

### `vite.config.ts`

生成接口：

- dual 阶段返回 legacy manifest。
- client authority 阶段不调用 Puppeteer layout。

PDF 接口：

- 要求 PagePlanV2/hash/version。
- 创建 RenderSession。
- 打开 renderer.html export mode。
- replay 校验后输出 PDF。

Build 配置：

- 增加 renderer.html multi-page entry。
- 确保 renderer CSS bundle 可被 Preview 和 Puppeteer共同加载。

### `server/persistence.ts`

短期不改 SQL 结构。

需要：

- 接受 V3 document payload。
- 继续使用 revision CAS。
- 保证 16MB 限制有测试。
- 冲突响应不能丢失有效 PagePlan。

### `scripts/verify-ui.mts`

迁移时拆出 Renderer 专项测试，避免单个脚本继续膨胀。

保留 UI 行为测试；分页算法、并发、PDF parity 移到新脚本。

---

## 27. 删除条件

任何旧代码都不能“写完新代码后立即删除”。删除必须满足：

```text
[ ] Shadow 模式已运行
[ ] 所有现有生成简历页数相同
[ ] 所有 block membership 相同
[ ] Preview/PDF parity 100%
[ ] 导出失败路径已验证
[ ] 数据 V2->V3 迁移已验证
[ ] Feature Flag 回滚已演练
[ ] 生产 Chromium 已固定
[ ] 自托管字体已上线
[ ] 监控无未知失败码
```

删除后再次运行全套测试和真实数据库只读回放。

---

## 28. 回滚方案

### 28.1 代码回滚

Feature Flag 切回：

```text
VITE_CLIENT_PUPPET_RENDERER=off
PUPPET_LAYOUT_AUTHORITY=server
PUPPET_EXPORT_REPLAY=off
```

### 28.2 数据回滚

- V3 document 必须保留 `legacyLayoutManifest`。
- V2 reader 在回滚窗口内继续存在。
- 回滚只切 authority，不回写或删除 Draft。
- 不执行 destructive SQL rollback。

### 28.3 触发回滚的条件

- Preview/PDF 页数不一致。
- block 丢失或重复。
- 字体大面积失败。
- Renderer timeout 比例超过阈值。
- PDF replay mismatch。
- 账户 payload 保存失败率上升。

---

## 29. 日志与隐私

允许记录：

```text
traceId
accountId hash
resumeId hash
revision
snapshotHash
rendererVersion
durationMs
pageCount
attemptCount
policy
failureCode
blockId
pixel metrics
Chrome version
```

禁止记录：

- 姓名。
- 邮箱和手机号。
- 工作职责正文。
- JD 全文。
- 头像 data URL。
- PDF 内容。

---

## 30. Code review 强制检查项

每个迁移 PR 的 reviewer 必须回答：

```text
[ ] 是否改变了 Puppet 基线参数？如果是，是否有用户明确批准？
[ ] 是否新增了重复的 A4/阈值魔法数？
[ ] 是否可能让旧 revision 覆盖新 revision？
[ ] 是否在字体或图片未 ready 时测量？
[ ] 是否存在 display:none 测量？
[ ] 是否存在长 DOM裁切伪分页？
[ ] 是否可能丢失或重复 block？
[ ] 是否把用户手工文字交给 LLM 自动改写？
[ ] 是否在 Preview 未 valid 时允许导出？
[ ] PDF 是否可能重新决定页数？
[ ] snapshotHash 是否覆盖所有布局输入？
[ ] 是否提供失败报告和回滚路径？
[ ] 是否添加对应 fixture/并发/parity 测试？
[ ] commit 类型是否属于 fix/style/feat/perf/build/ci/revert？
```

---

## 31. 最终 Definition of Done

本次优化只有同时满足以下条件才算完成：

1. LLM 生成完成后，后端不再为 Preview 计算分页。
2. 用户当前 Chrome 完成测量和分页。
3. Measurement DOM 和 Preview DOM 使用同一 Renderer document、字体和 CSS。
4. Preview 使用真实独立 Page DOM，不使用长条裁切。
5. 编辑过程中 Preview 全面 Loading，成功后原子揭示。
6. 连续输入不会产生 stale layout 覆盖。
7. PagePlan 与 Draft 使用 revision/hash 严格绑定。
8. 手工编辑不会被 LLM 自动改写。
9. PDF 严格 replay PagePlan，不重新分页。
10. Preview/PDF block membership 100% 相同。
11. 所有真实现存生成简历迁移成功。
12. V2 数据可无损迁移到 V3。
13. Feature Flag 回滚通过。
14. 旧 server layout authority 已在门槛满足后干净删除。
15. 前端只保留 Puppet/Profile 生成格式，不混入其他模板排版规则。

---

## 32. 实施者开始编码前的最后检查

开始 Phase 1 前必须确认：

```text
[ ] 已运行 npm run check:types
[ ] 已运行 npm run check:puppet
[ ] 已运行 npm run check:layout
[ ] 已运行 npm run check:ui
[ ] 已保存当前真实 2 页简历基线
[ ] 已保存 7 页 fixture 基线
[ ] 已确认字体方案
[ ] 已确认 Feature Flag 默认 off
[ ] 已确认没有未提交的用户改动被覆盖
[ ] 已确认本次 PR 只做一个迁移阶段
```

没有完成上述检查，不得开始删除或切换现有分页逻辑。

---

## 33. 核心模块代码骨架

本节不是可选示例。实施者应保持同等职责边界；允许调整命名，不允许把职责重新合并进 `App.tsx`。

### 33.1 `useResumeRenderer.ts`

该 hook 只负责任务调度、Loading 和结果提交，不实现测量或分页。

```ts
interface UseResumeRendererInput {
  document: RendererResumeDocument;
  revision: number;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onValidPlan: (pagePlan: PagePlanV2, report: LayoutReportV2) => void;
}

interface UseResumeRendererResult {
  status: 'booting' | 'idle' | 'rendering' | 'ready' | 'failed';
  isCovered: boolean;
  failureCode: string | null;
  retry: () => void;
}

export function useResumeRenderer(input: UseResumeRendererInput): UseResumeRendererResult {
  const { document, revision, iframeRef, onValidPlan } = input;
  const [status, setStatus] = useState<UseResumeRendererResult['status']>('booting');
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const latestRef = useRef<{ requestId: string; revision: number; hash: string } | null>(null);
  const debounceRef = useRef<number | null>(null);
  const loadingStartedAtRef = useRef(0);

  const postRender = useCallback(async () => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;

    const immutableDocument = structuredClone(document);
    const hash = await snapshotHash(immutableDocument);
    const requestId = crypto.randomUUID();
    latestRef.current = { requestId, revision, hash };
    loadingStartedAtRef.current = performance.now();
    setStatus('rendering');
    setFailureCode(null);

    const message: EditorToRendererMessage = {
      protocol: RENDERER_PROTOCOL,
      kind: 'RENDER',
      requestId,
      snapshot: {
        revision,
        snapshotHash: hash,
        rendererVersion: RENDERER_VERSION,
        document: immutableDocument,
      },
    };
    frame.contentWindow.postMessage(message, window.location.origin);
  }, [document, iframeRef, revision]);

  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    setStatus((current) => current === 'booting' ? current : 'rendering');
    debounceRef.current = window.setTimeout(() => void postRender(), INPUT_LAYOUT_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [postRender]);

  useEffect(() => {
    const receive = async (event: MessageEvent<RendererToEditorMessage>) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.protocol !== RENDERER_PROTOCOL) return;

      if (event.data.kind === 'READY') {
        if (event.data.rendererVersion !== RENDERER_VERSION) {
          setStatus('failed');
          setFailureCode('PROTOCOL_MISMATCH');
          return;
        }
        setStatus((current) => current === 'booting' ? 'idle' : current);
        return;
      }

      const latest = latestRef.current;
      if (!latest) return;
      if (event.data.requestId !== latest.requestId) return;
      if (event.data.revision !== latest.revision) return;
      if (event.data.snapshotHash !== latest.hash) return;

      if (event.data.kind === 'RENDER_FAILED') {
        setStatus('failed');
        setFailureCode(event.data.failureCode);
        return;
      }

      if (event.data.kind !== 'RENDER_SUCCEEDED') return;
      const remainingLoadingTime = Math.max(
        0,
        MIN_LOADING_VISIBILITY_MS - (performance.now() - loadingStartedAtRef.current),
      );
      if (remainingLoadingTime > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingLoadingTime));
      }

      if (latestRef.current?.requestId !== latest.requestId) return;
      onValidPlan(event.data.pagePlan, event.data.report);
      setStatus('ready');
    };

    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [iframeRef, onValidPlan]);

  const retry = useCallback(() => void postRender(), [postRender]);
  return {
    status,
    isCovered: ['booting', 'rendering', 'failed'].includes(status),
    failureCode,
    retry,
  };
}
```

实现时必须补充：

- unmount 时发送 CANCEL。
- RENDER_TIMEOUT_MS timer。
- READY 前的 pending render。
- 文本输入与立即型控件的不同调度入口；不能所有行为都固定 250ms。
- 保存回调错误处理。

### 33.2 Renderer 接收消息

```ts
const activeControllerRef = { current: null as AbortController | null };
let activeRequestId = '';

window.addEventListener('message', async (event: MessageEvent<EditorToRendererMessage>) => {
  if (event.origin !== window.location.origin) return;
  if (event.source !== window.parent) return;
  if (event.data?.protocol !== RENDERER_PROTOCOL) return;

  if (event.data.kind === 'CANCEL') {
    if (event.data.requestId === activeRequestId) activeControllerRef.current?.abort();
    return;
  }

  const parsed = parseRenderMessage(event.data);
  if (!parsed.ok) {
    postFailure(event.data.requestId, event.data.snapshot?.revision ?? -1, 'PROTOCOL_MISMATCH');
    return;
  }

  activeControllerRef.current?.abort();
  const controller = new AbortController();
  activeControllerRef.current = controller;
  activeRequestId = parsed.value.requestId;

  postStarted(parsed.value);
  try {
    const result = await runCanonicalLayout(parsed.value.snapshot, controller.signal);
    if (controller.signal.aborted || activeRequestId !== parsed.value.requestId) return;
    postSuccess(parsed.value, result);
  } catch (error) {
    if (controller.signal.aborted || activeRequestId !== parsed.value.requestId) return;
    postFailure(parsed.value.requestId, parsed.value.snapshot.revision, rendererFailureCode(error));
  }
});
```

每一个 `await` 返回后都必须检查 `signal.aborted`，尤其是：

- hash 校验后。
- 字体等待后。
- 图片等待后。
- 每轮策略测量后。
- 最终 DOM validation 后。

### 33.3 `runCanonicalLayout()`

```ts
export async function runCanonicalLayout(
  snapshot: RenderSnapshot,
  signal: AbortSignal,
): Promise<{ pagePlan: PagePlanV2; report: LayoutReportV2 }> {
  const startedAt = performance.now();
  assertNotAborted(signal);
  assertRendererVersion(snapshot.rendererVersion);
  assertSnapshotSchema(snapshot);

  const calculatedHash = await snapshotHash(snapshot.document);
  assertNotAborted(signal);
  if (calculatedHash !== snapshot.snapshotHash) {
    throw new RendererError('SNAPSHOT_HASH_MISMATCH');
  }

  await ensureCanonicalFont();
  assertNotAborted(signal);

  const natural = await measureSnapshot(snapshot, NATURAL_TUNING, signal);
  const targetPageCount = Math.max(1, Math.round(natural.contentBottom / A4_HEIGHT_PX));
  const targetBottom = targetPageCount * A4_HEIGHT_PX - TARGET_BOTTOM_MARGIN_PX;
  const direction = natural.contentBottom <= targetBottom ? 1 : -1;
  const reports: LayoutAttemptReport[] = [];
  const attemptedPolicies = new Set<string>();

  for (const [index, strategy] of PUPPET_TUNING_STRATEGIES.entries()) {
    assertNotAborted(signal);
    if (attemptedPolicies.has(strategy.id)) {
      throw new RendererError('LAYOUT_ATTEMPTS_EXHAUSTED', { duplicatePolicy: strategy.id });
    }
    attemptedPolicies.add(strategy.id);

    const candidate = await calibrateStrategy({
      snapshot,
      strategy,
      direction,
      targetBottom,
      targetPageCount,
      signal,
    });
    const validation = await validateRenderedPlan(snapshot, candidate.pagePlan, candidate.tuning, signal);
    const attemptReport = buildAttemptReport(index + 1, strategy.id, candidate, validation);
    reports.push(attemptReport);

    if (!attemptReport.valid) continue;
    return {
      pagePlan: candidate.pagePlan,
      report: {
        schemaVersion: 2,
        revision: snapshot.revision,
        snapshotHash: snapshot.snapshotHash,
        rendererVersion: snapshot.rendererVersion,
        durationMs: performance.now() - startedAt,
        fontFamily: validation.fontFamily,
        fontReady: true,
        imageCount: validation.imageCount,
        attempts: reports,
        acceptedAttempt: index + 1,
        failureCode: null,
      },
    };
  }

  throw new RendererError('LAYOUT_ATTEMPTS_EXHAUSTED', { attempts: reports });
}
```

### 33.4 `measureSnapshot()`

```ts
export async function measureSnapshot(
  snapshot: RenderSnapshot,
  tuning: LayoutTuningV2,
  signal: AbortSignal,
): Promise<MeasurementResult> {
  const host = getMeasurementHostOrThrow();
  const root = createRoot(host);
  try {
    root.render(<PuppetMeasurementDocument snapshot={snapshot} tuning={tuning} />);
    await afterTwoAnimationFrames();
    assertNotAborted(signal);
    await ensureCanonicalFont();
    await waitForImages(host);
    await afterTwoAnimationFrames();
    assertNotAborted(signal);

    const blockElements = [...host.querySelectorAll<HTMLElement>('[data-resume-block="true"]')];
    if (!blockElements.length) throw new RendererError('MEASUREMENT_ROOT_MISSING');

    const rootRect = getMeasurementDocumentRoot(host).getBoundingClientRect();
    const seen = new Set<string>();
    const blocks = blockElements.map((element, order) => {
      const id = element.dataset.blockId || '';
      if (!id || seen.has(id)) throw new RendererError('BLOCK_ID_DUPLICATE', { id });
      seen.add(id);
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        ...descriptorFromElement(element, order),
        width: rect.width,
        height: rect.height,
        naturalTop: rect.top - rootRect.top,
        naturalBottom: rect.bottom - rootRect.top,
        computedFontSize: Number.parseFloat(style.fontSize) || 0,
        computedLineHeight: Number.parseFloat(style.lineHeight) || 0,
      };
    });

    return {
      blocks,
      contentBottom: blocks.reduce((max, block) => Math.max(max, block.naturalBottom), 0),
      expectedBlockIds: expectedBlockIds(snapshot.document),
      tuning,
    };
  } finally {
    root.unmount();
    host.replaceChildren();
  }
}
```

实际 React root 不应在每次测量创建；性能阶段应将 root 常驻。但第一版先保证 finally 清理和正确性。

### 33.5 `paginateBlocks()`

```ts
export function paginateBlocks(
  measurement: MeasurementResult,
  tuning: LayoutTuningV2,
): PagePlanV2 {
  assertUniqueBlocks(measurement.blocks);
  const groups = buildConstrainedGroups(measurement.blocks);
  const pages: MutablePage[] = [createMutablePage(1)];

  for (const group of groups) {
    let page = pages[pages.length - 1];
    let requiredHeight = groupHeight(group, page, tuning);

    if (requiredHeight > PAGE_CONTENT_HEIGHT_PX && page.blockIds.length === 0) {
      throw new RendererError('BLOCK_TOO_TALL', { blockIds: group.blockIds, requiredHeight });
    }

    if (requiredHeight > page.remainingHeight) {
      page = createMutablePage(pages.length + 1);
      pages.push(page);
      requiredHeight = groupHeight(group, page, tuning);
    }

    if (requiredHeight > page.remainingHeight) {
      throw new RendererError('BLOCK_TOO_TALL', { blockIds: group.blockIds, requiredHeight });
    }

    appendGroup(page, group, requiredHeight);
  }

  removeTrailingEmptyPages(pages);
  if (pages.some((page, index) => page.blockIds.length === 0 && index < pages.length - 1)) {
    throw new RendererError('PAGE_COUNT_MISMATCH', { reason: 'empty-middle-page' });
  }

  const immutablePages = pages.map((page) => finalizePage(page));
  const assigned = immutablePages.flatMap((page) => page.blockIds);
  assertSameBlockMultiset(measurement.expectedBlockIds, assigned);

  return {
    schemaVersion: 2,
    revision: 0, // 调用者必须覆盖为 snapshot.revision
    snapshotHash: '', // 调用者必须覆盖为 snapshot.snapshotHash
    rendererVersion: RENDERER_VERSION,
    pageWidth: A4_WIDTH_PX,
    pageHeight: A4_HEIGHT_PX,
    contentWidth: PAGE_CONTENT_WIDTH_PX,
    contentHeight: PAGE_CONTENT_HEIGHT_PX,
    tuning,
    pages: immutablePages,
    blockOrder: assigned,
    createdAt: Date.now(),
  };
}
```

`paginateBlocks()` 只能按 block 和约束产生自然分页，不能为了命中 `targetPageCount` 丢弃、缩放或移动内容。调用方在 `LayoutAttemptReport` 中比较 `pagePlan.pages.length` 与 `targetPageCount`；不同则本轮 `valid=false`，继续下一个调节结果。

不要把示例中的 revision/hash 空值带到最终实现。更好的最终签名是直接传入 snapshot metadata，类型上不允许空值。

### 33.6 `validateRenderedPlan()`

```ts
export async function validateRenderedPlan(
  snapshot: RenderSnapshot,
  pagePlan: PagePlanV2,
  tuning: LayoutTuningV2,
  signal: AbortSignal,
): Promise<FinalDomValidation> {
  renderPaginatedDocument(snapshot, pagePlan, tuning);
  await afterTwoAnimationFrames();
  await ensureCanonicalFont();
  await waitForImages(documentRoot());
  await afterTwoAnimationFrames();
  assertNotAborted(signal);

  const pages = [...document.querySelectorAll<HTMLElement>('.puppet-page')];
  if (pages.length !== pagePlan.pages.length) {
    throw new RendererError('PAGE_COUNT_MISMATCH');
  }

  const actualBlockIds: string[] = [];
  const pageQualities = pages.map((page, pageIndex) => {
    const contentBox = getPageContentBox(page);
    const blocks = [...page.querySelectorAll<HTMLElement>('[data-resume-block="true"]')];
    const orphanBlockIds: string[] = [];
    let usedHeight = 0;
    let overflowX = 0;
    let overflowY = 0;

    blocks.forEach((block, blockIndex) => {
      const id = block.dataset.blockId || '';
      actualBlockIds.push(id);
      const rect = block.getBoundingClientRect();
      usedHeight = Math.max(usedHeight, rect.bottom - contentBox.top);
      overflowX = Math.max(overflowX, rect.right - contentBox.right, contentBox.left - rect.left, 0);
      overflowY = Math.max(overflowY, rect.bottom - contentBox.bottom, contentBox.top - rect.top, 0);
      if (isHeadingBlock(block) && !headingHasRequiredNextBlock(blocks, blockIndex)) {
        orphanBlockIds.push(id);
      }
    });

    return {
      pageNumber: pageIndex + 1,
      fillRatio: Math.min(1, (PAGE_MARGIN_TOP_PX + usedHeight) / A4_HEIGHT_PX),
      usedHeight,
      overflowX,
      overflowY,
      orphanBlockIds,
      duplicateBlockIds: [],
      missingBlockIds: [],
    };
  });

  assertSameBlockMultiset(pagePlan.blockOrder, actualBlockIds);
  assertLineHeightFloors(documentRoot());
  return finalizeDomValidation(pageQualities);
}
```

### 33.7 Editor 提交有效 PagePlan

```ts
function commitValidRenderResult(documentId: string, result: RenderSucceededMessage) {
  updateLibrary((library) => {
    const document = library.resumes.find((item) => item.id === documentId);
    if (!document) return library;
    if (document.renderState.draftRevision !== result.revision) return library;
    if (document.renderState.currentSnapshotHash !== result.snapshotHash) return library;

    return updateDocument(library, documentId, (current) => ({
      ...current,
      renderState: {
        ...current.renderState,
        status: 'valid',
        rendererVersion: result.pagePlan.rendererVersion,
        pagePlan: result.pagePlan,
        layoutReport: compactLayoutReportForPersistence(result.report),
        lastValidSnapshotHash: result.snapshotHash,
        lastValidAt: Date.now(),
      },
    }));
  });
}
```

这里必须在同一个 state updater 内再次比较 revision/hash，不能只在 message handler 外比较。

### 33.8 PDF replay handler

```ts
async function exportPdfHandler(request: IncomingMessage, response: ServerResponse) {
  const input = parseExportPdfRequest(await readJsonBody(request));
  const calculatedHash = serverSnapshotHash(input.document);
  if (calculatedHash !== input.snapshotHash) return sendExportError(response, 409, 'SNAPSHOT_HASH_MISMATCH');
  if (input.pagePlan.snapshotHash !== input.snapshotHash) return sendExportError(response, 409, 'SNAPSHOT_HASH_MISMATCH');
  if (input.pagePlan.rendererVersion !== input.rendererVersion) return sendExportError(response, 409, 'PROTOCOL_MISMATCH');

  const session = renderSessions.create({
    document: input.document,
    pagePlan: input.pagePlan,
    expiresAt: Date.now() + 60_000,
  });

  const browser = await browserPool.acquire();
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/renderer.html?mode=export&session=${encodeURIComponent(session.token)}`, {
      waitUntil: 'networkidle0',
      timeout: 10_000,
    });
    await page.waitForFunction(() => document.documentElement.dataset.renderStatus === 'ready');
    const replay = await readReplayResult(page);
    assertReplayMatchesPlan(replay, input.pagePlan, input.snapshotHash, input.rendererVersion);
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    sendPdf(response, pdf);
  } catch (error) {
    sendExportError(response, 500, rendererFailureCode(error));
  } finally {
    renderSessions.delete(session.token);
    await browserPool.release(browser);
  }
}
```

生产实现中 browser pool 返回的应是 browser/page lease，避免一个请求关闭共享 Browser。该资源模型必须有独立并发测试。
