# 简历生成性能优化方案

## 1. 文档目标

本文用于指导 JD2Resume 后续的生成性能优化，重点解决完整简历生成超过 120 秒的问题，同时保证以下质量约束不退化：

- 个人信息、真实公司名、学校名和工作时间不得被修改。
- 中文专业技能保持 4 个分类、每类 4 个高信息密度技能点。
- 每段工作经历保持 8 条职责。
- 职责长度、加深、下划线、时间线和补充公司规则继续通过现有校验器。
- 中文和英文继续使用各自的语言路由策略。
- 中文简历生成只走 DeepSeek Gateway；英文简历按 OpenAI、Gemini、DeepSeek 顺序路由。
- 纯文本简历结构化按 OpenAI、Gemini 顺序路由。
- PDF/图片输入按 Gateway OpenAI、Gemini 顺序路由；Gateway 附件先上传为短期文件，再在请求中引用其 file ID，只有支持直接文件输入的 provider 才可参与该链路。
- Gateway 地址、认证值和实际路由参数只存在本地环境配置，不写入本文或公开代码。

本文不是把超时从 120 秒提高到 300 秒的方案。最终目标是让正常请求在 60 秒硬截止前完成，并让 P95 保持在 45 秒以内。

---

## 2. 已观测到的现象

### 2.1 基础链路正常

已验证：

- Gateway 健康检查可正常返回。
- 最小文本请求可正常完成。
- DeepSeek 文本响应能够返回 OpenAI-compatible `choices`。
- Gemini 文本响应当前返回原生 `candidates`，JD2Resume 已兼容两种响应结构。
- TLS 证书问题已经修复，标准证书校验可以通过。

因此，120 秒问题不是“Gateway 完全不可用”，而是完整简历请求的计算量、输出规模、模型档位和超时设计共同造成的。

### 2.2 完整请求的实测证据

使用不含真实个人数据的中文测试资料调用 `/api/generate-resume` 时：

- 客户端 180 秒仍未收到完整 HTTP 响应。
- JD2Resume 日志显示第一个 Gateway provider 在约 `120009ms` 被取消。
- 当时所有后续 provider 复用了已经取消的 `AbortController`，因此在 0-2ms 内立即失败。
- Gateway 的最小请求很快，说明慢点发生在完整简历生成阶段，而不是健康检查、TLS 或基础鉴权阶段。

### 2.3 当前链路的真实调用形态

虽然 `PuppetResumePipeline` 名义上是两阶段管线，但线上生成器会把第一阶段改写为 Single Pass：

```text
Phase 1 prompt
  -> promoteStructurePromptToSinglePass()
  -> 一次生成简介、技能、经历骨架和所有职责
  -> 最多 16,000 output tokens
  -> 校验完整职责
  -> 缓存职责
  -> Phase 2 直接读取缓存
```

也就是说，常规成功路径并不是真正的两次小请求，而是一次非常大的请求。

---

## 3. 根因分析

### 根因 A：Single Pass 把全部复杂度集中在一次请求中

当前 [vite.config.ts](../vite.config.ts) 的 `createPuppetTextGenerator` 在结构阶段执行：

```ts
const singlePass = stage === 'resume-structure';
singlePass ? promoteStructurePromptToSinglePass(prompt) : prompt;
```

而 [singlePass.ts](../server/puppet-resume/singlePass.ts) 的 override 又要求：

- 忽略第一阶段“职责必须为空”的规则。
- 每段经历生成 8 条职责。
- 同时满足长度、数据、锁定字段、加深和下划线要求。
- 返回完整 JSON。

这使模型必须在一次推理中同时完成：

1. 职位标准化。
2. 资历判断。
3. 时间线补足。
4. 个人简介。
5. 4x4 专业技能。
6. 每段经历 8 条高密度职责。
7. 所有格式与锁定字段自检。

任务复杂度和输出长度都集中在一次调用中，任何一项不满足都会让整份结果重试。

### 根因 B：16,000 output tokens 远高于简历实际需要

当前 `createPuppetTextGenerator` 固定传入：

```ts
maxTokens = 16_000;
```

对于 2-4 段工作经历，合理的最终 JSON 通常不需要 16K 输出 token。过高上限会产生三个问题：

- 推理模型可能规划更久、生成更长。
- 上游更难预估完成时间。
- 输出失控时会一直消耗到较高上限，而不是尽早失败。

建议预算：

| 阶段 | 中文建议 | 英文建议 |
|---|---:|---:|
| 结构、简介、技能 | 3,000 | 4,000 |
| 单段职责 | 1,600 | 2,200 |
| JD 文件抽取 | 4,000 | 4,000 |
| 布局修复 | 4,000 | 5,000 |

这些值是上限，不是必须消耗的目标。

### 根因 C：高质量推理模型被用于正常首轮

当前完整中文生成会优先进入本地配置的中文 Gateway 路由。如果首轮直接选择高推理档模型，模型可能产生大量 reasoning tokens。

最小 DeepSeek 测试已经显示：即使只要求返回 `OK`，也会先生成 reasoning content。完整简历包含大量互相制约的规则，推理时间会显著放大。

正常首轮应使用低延迟模型；高质量模型只应用于：

- 结构校验失败后的单阶段升级。
- 某一段职责质量不达标后的局部升级。
- 用户主动选择“高质量重写”。

### 根因 D：超时层级没有形成清晰预算

当前存在多层超时：

- JD2Resume provider timeout。
- Gateway HTTP 请求 timeout。
- Gateway 到上游 provider 的 timeout。
- 浏览器或调用端 timeout。

之前客户端和 Gateway 都接近 120 秒。相同截止时间会导致客户端先取消，Gateway 可能还在等待上游，最终既拿不到 Gateway 的错误响应，也无法执行有效 fallback。

把两边都提高到 300 秒只会把不可接受的等待延长到 5 分钟。

正确关系应为：

```text
单个上游模型截止 < Gateway 单请求截止 < JD2Resume 阶段截止 < 整体 API 截止
```

建议最终预算：

| 层级 | 结构阶段 | 单段职责阶段 |
|---|---:|---:|
| 单个上游模型 | 12s | 20s |
| Gateway 同 family fallback | 18s | 26s |
| JD2Resume 阶段 | 22s | 32s |
| 完整请求硬截止 | 55s | 55s |

完整请求达到 55 秒后必须返回明确错误或已完成的可用结果，不继续后台占用用户请求。

### 根因 E：重试存在乘法放大风险

当前有三层潜在重试：

1. `requestJsonCompletion(..., maxAttempts = 2)`。
2. `requestFromProviders` 遍历多个 provider。
3. `createPuppetTextGenerator` 外层最多尝试 3 次。

最坏情况下，同一个大 prompt 可能被多次完整生成。即使每次只等 30 秒，总时间也会快速超过用户可接受范围。

Gateway 已负责同 family 内部的 endpoint fallback，因此 Gateway 请求在 JD2Resume 内不应再做两次相同网络重试。

### 根因 F：Gateway 的质量档位依赖模型数组顺序，语义不稳定

Gateway 当前逻辑：

```python
QUALITY = {"extra high": 0, "high": 1, "medium": 2, "light": 3}
return models[min(level, len(models) - 1)]
```

这要求每个模型数组必须严格按“最强到最快”排序。如果某个 family 的数组是 `[flash, pro]`，就会出现：

- Extra High -> flash
- High/Medium/Light -> pro

因此，模型数组顺序一旦与约定不同，质量档位会反转。这个问题不能只依赖人工记忆，应在配置结构中显式表达模型 tier。

### 根因 G：Gateway 的配置项与实现存在偏差

Gateway 环境中存在 `PROVIDER_MAX_ATTEMPTS` 和 `PROVIDER_RETRY_DELAY_MS`，但当前 `gateway.py` 并未读取或执行这两个值。现在实际行为是：每条配置 route 只尝试一次，然后进入下一 route。

必须选择一个明确方向：

- 要么删除未使用配置，避免产生错误预期。
- 要么实现受总 deadline 约束的重试，但最多只对网络瞬断重试一次。

---

## 4. 最终目标与验收指标

### 4.1 性能目标

| 指标 | 目标 | 硬门槛 |
|---|---:|---:|
| 完整生成 P50 | <= 20s | <= 30s |
| 完整生成 P95 | <= 45s | <= 55s |
| 完整生成 P99 | <= 55s | <= 60s |
| 结构阶段 P95 | <= 15s | <= 22s |
| 单段职责 P95 | <= 22s | <= 32s |
| 请求失败率 | < 2% | < 5% |
| 首选 provider 成功率 | > 90% | > 80% |
| 整体 fallback 率 | < 10% | < 20% |

### 4.2 内容质量硬门槛

以下任一失败都不能返回给用户：

- JSON 无法解析。
- 公司名、工作时间或其他锁定字段变化。
- 经历数量与时间线不一致。
- 每段职责不是 8 条。
- 中文专业技能不是 4x4。
- 职责长度不满足渲染范围。
- 加深/下划线标签不合法。
- 出现占位符、拒绝话术或 Unicode 损坏字符。

### 4.3 内容质量评分目标

人工盲评采用 10 分制：

| 维度 | 权重 | 判定重点 |
|---|---:|---|
| 事实与锁定字段 | 30% | 是否保留真实公司、学校、时间和原始职位规则 |
| JD 相关性 | 20% | 是否围绕目标岗位核心职责与能力 |
| 职责含金量 | 20% | 是否包含行动、方法、业务场景和可验证结果 |
| 专业技能质量 | 15% | 是否是能力+场景，而非关键词堆砌 |
| 语言自然度 | 10% | 是否符合中文/英文招聘市场表达习惯 |
| 排版适配 | 5% | 是否稳定落在目标行数和页面密度内 |

优化版本的总分不得低于基线，专业技能维度应至少提高 0.5 分，职责含金量不得下降。

---

## 5. 推荐架构

### 5.1 真正恢复两阶段生成

```text
本地事实与时间线计算
        |
        v
Phase A: 结构、简介、专业技能、经历骨架
        |  低延迟模型，3K-4K tokens，约 12-18s
        v
结构校验与锁定字段校验
        |
        +----失败----> 只重试 Phase A，必要时升级模型
        |
        v
Phase B: 按经历并行生成职责
        |  每段独立，最多并发 3，1.6K-2.2K tokens/段
        v
逐段校验
        |
        +----某段失败----> 只重试该段，必要时升级模型
        |
        v
确定性合并 + 最终全量校验
```

### 5.2 为什么职责应按经历并行

如果有 3 段经历：

- 串行：结构 12s + 3 x 18s = 66s。
- 并行：结构 12s + max(18s, 18s, 18s) = 30s。

并行必须限制并发，建议最多 3。超过 3 段时分批执行，避免同时压垮 Gateway 或触发上游限流。

### 5.3 局部重试而不是整份重试

例如第 3 段职责下划线不合格时：

- 保留已经通过的简介、技能和其他经历。
- 将第 3 段的校验错误作为简短修复提示。
- 只重新生成第 3 段。
- 第二次仍失败才升级模型或 provider family。

这样可同时降低延迟、成本和内容漂移。

### 5.4 Provider 粘性

同一份简历应尽量保持同一 provider family：

- Phase A 首选 family 成功后，Phase B 继续使用同一 family。
- 同一 family 内可以从 fast tier 升级到 quality tier。
- 只有网络、鉴权、限流、服务端错误或连续校验失败时才跨 family。

这样能避免简介、技能与职责的语言风格明显不一致。

---

## 6. JD2Resume 逐文件修改方案

以下行号基于本文编写时的 `master`。后续代码移动时应以函数名为准，不应只机械依赖行号。

### 6.1 `server/puppet-resume/singlePass.ts`

#### 当前第 1-10 行

当前 `promoteStructurePromptToSinglePass` 强制第一阶段生成职责。

#### 修改

删除以下导出：

```ts
promoteStructurePromptToSinglePass
structureProjection
bulletProjection
hasCompleteResponsibilities
```

如果需要保留旧行为进行 A/B 测试，应改名为 `legacySinglePass.ts`，并且只能由实验开关引用，不能进入默认路径。

#### 验收

```bash
rg -n "promoteStructurePromptToSinglePass|singlePassResult" vite.config.ts server
```

默认生成路径中结果应为空。

### 6.2 `vite.config.ts` 第 9 行

#### 当前

```ts
import { bulletProjection, hasCompleteResponsibilities, promoteStructurePromptToSinglePass, structureProjection } from './server/puppet-resume/singlePass';
```

#### 修改

删除该 import。若保留实验路径，则只导入一个明确命名的 `legacySinglePassGenerator`，并放在默认关闭的 feature flag 后。

### 6.3 `vite.config.ts` 第 27-28 行

#### 当前

```ts
const PROVIDER_TIMEOUT_MS = 120_000;
const PROVIDER_RETRY_DELAY_MS = 700;
```

#### 建议替换

```ts
const GENERATION_DEADLINE_MS = 55_000;
const STRUCTURE_TIMEOUT_MS = 22_000;
const ROLE_BULLETS_TIMEOUT_MS = 32_000;
const NETWORK_RETRY_DELAY_MS = 350;
const MAX_ROLE_CONCURRENCY = 3;
```

这些是客户端硬上限，不包含任何 Gateway 地址或路由参数。

### 6.4 `vite.config.ts` 第 31-42 行 `Provider`

#### 増加运行时状态

```ts
type ProviderRuntime = {
  provider: Provider;
  affinityKey: string;
  selectedAt: number;
};
```

不要把实际 provider family 或 quality 值硬编码进公开文件；继续通过本地 ignored 环境配置生成 `Provider`。

### 6.5 `vite.config.ts` 第 217-317 行 `requestJsonCompletion`

#### 第 223-224 行

将默认值从：

```ts
maxTokens = 4_000,
maxAttempts = 2,
```

改为：

```ts
maxTokens = 4_000,
maxAttempts = 1,
```

原因：Gateway 已负责同 family 内 endpoint fallback。客户端只对直接 provider 的网络瞬断选择性重试，不应对 Gateway 相同请求重复发送。

#### 第 240-315 行

重试条件应改为：

```ts
const canRetrySameProvider = provider.kind !== 'gateway'
  && attempt + 1 < maxAttempts
  && isTransientNetworkError(error)
  && !signal.aborted;
```

以下错误不在同 provider 原地重试：

- 401/403：立即切换配置或返回配置错误。
- 429：交给 Gateway route fallback；直接 provider 则切下一个 key。
- 输出截断：缩小任务或提高该阶段 token 上限，不原样重试。
- Schema/内容校验失败：由阶段级修复 prompt 处理。

#### 新增 usage 采集

返回值从单纯对象改为：

```ts
type CompletionResult = {
  value: Record<string, unknown>;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  };
  finishReason: string;
};
```

日志只记录数字，不记录 prompt、请求体、认证值或个人信息。

### 6.6 `vite.config.ts` 第 358-415 行 `requestFromProviders`

当前每个 provider 已拥有独立 `AbortController`，这是正确方向，应保留。

#### 第 374 行前新增整体 deadline

```ts
const deadlineAt = Date.now() + timeoutMs;
```

#### 第 375-376 行替换为剩余预算

```ts
const remainingMs = deadlineAt - Date.now();
if (remainingMs <= 0) throw new Error('GENERATION_DEADLINE_EXCEEDED');

const providerBudgetMs = Math.min(
  provider.timeoutMs || remainingMs,
  remainingMs,
);
const controller = new AbortController();
const providerTimeout = setTimeout(() => controller.abort(), providerBudgetMs);
```

这样多个 provider 不会各自完整消耗 22/32 秒，导致总时间叠加。

#### 第 389-398 行校验失败处理

当前 `validate(result)` 返回 false 后会进入下一 provider，但没有记录失败类型。改为抛出：

```ts
throw new Error('OUTPUT_VALIDATION_FAILED');
```

日志中增加：

```ts
stage,
attempt,
providerKind,
durationMs,
errorCode,
```

禁止记录：

```text
endpoint, apiKey, gatewayOptions, prompt, requestBody, profile
```

### 6.7 `vite.config.ts` 第 445-494 行 `createPuppetTextGenerator`

该函数应整体替换，移除通过正则识别 Phase 2 和 Single Pass 缓存的逻辑。

#### 新接口

```ts
type GenerationStage = 'structure' | 'role-bullets' | 'layout-refinement';

type GenerationOptions = {
  stage: GenerationStage;
  maxTokens: number;
  timeoutMs: number;
  affinityKey?: string;
};

type PuppetTextGenerator = (
  prompt: string,
  validator: (text: string) => boolean | Promise<boolean>,
  options: GenerationOptions,
) => Promise<string>;
```

#### 推荐实现骨架

```ts
function createPuppetTextGenerator(providers: Provider[], traceId: string) {
  let affinity: Provider | null = null;

  return async (
    prompt: string,
    validator: (text: string) => boolean | Promise<boolean>,
    options: GenerationOptions,
  ) => {
    const ordered = affinity
      ? [affinity, ...providers.filter((provider) => provider !== affinity)]
      : providers;

    const result = await requestFromProviders(
      ordered,
      'Return valid JSON only. Do not use markdown or add commentary.',
      prompt,
      (value) => validator(JSON.stringify(value)),
      null,
      options.maxTokens,
      options.timeoutMs,
      { traceId, stage: options.stage, attempt: 1 },
    );

    affinity = result.provider;
    return JSON.stringify(result.value);
  };
}
```

实际实现时 `requestFromProviders` 需要返回成功 provider，而不是只返回 JSON。

#### 删除

- `singlePassResult`。
- `/Phase 2/i` 正则识别。
- 外层固定 3 次整阶段重试。
- `16_000` 固定 token 上限。
- `promoteStructurePromptToSinglePass`。

### 6.8 `server/puppet-resume/pipeline.ts` 第 1-15 行

修改 `PuppetTextGenerator` 类型，使调用者显式传入 stage、token 和 timeout，禁止生成器通过 prompt 文本猜测阶段。

### 6.9 `server/puppet-resume/pipeline.ts` 第 154-217 行 Phase A

#### 第 157 行调用改为

```ts
const nonJobResponse = await this.generateText(
  nonJobPrompt,
  structureValidator,
  {
    stage: 'structure',
    maxTokens: isEnglish ? 4_000 : 3_000,
    timeoutMs: 22_000,
  },
);
```

#### 重构校验器

把第 158-216 行匿名 validator 提取为：

```ts
function validateResumeStructure(
  text: string,
  context: StructureValidationContext,
): boolean
```

这样可以：

- 单独单测。
- 在模型失败时得到明确 error code。
- 在结构重试 prompt 中只反馈必要错误，不回传完整隐私数据。

### 6.10 `server/puppet-resume/pipeline.ts` 第 219-267 行 Phase B

当前一次生成所有 `workExperience`。改为每段独立生成。

#### 新增并发工具

```ts
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run()),
  );
  return results;
}
```

#### 替换第 226-267 行

```ts
const generatedRoles = await mapWithConcurrency(
  workSkeleton,
  3,
  async (experience, index) => {
    const prompt = isEnglish
      ? generateEnglishJobBulletPrompt(promptContext, [experience])
      : generateChineseJobBulletPrompt(promptContext, [experience]);

    return generateAndValidateRoleBullets({
      prompt,
      experience,
      index,
      isEnglish,
      maxCharPerLine,
    });
  },
);
```

#### 局部重试规则

`generateAndValidateRoleBullets` 最多两次：

1. fast tier，正常 prompt。
2. quality tier，只包含第一轮错误摘要和同一段锁定字段。

禁止第三次自动重试。第二次失败后返回明确错误，并保留 traceId。

#### 合并规则

禁止使用模型返回顺序以外的模糊匹配。每个 worker 已绑定确定的 skeleton entry，最终只读取其 `responsibilities`：

```ts
const workExperience = workSkeleton.map((experience, index) => ({
  ...experience,
  responsibilities: generatedRoles[index].responsibilities,
}));
```

### 6.11 `server/puppet-resume/prompts/ChinesePrompt.ts`

职责 prompt 当前包含整个时间线和大量全局规则。按单段生成时应减少重复上下文：

- 保留目标岗位和 JD 核心要求。
- 保留当前段公司、职位、起止时间、业务方向和原始内容。
- 保留职责长度、8 条、数据化、下划线规则。
- 删除其他经历的完整文本。
- 删除已经在 Phase A 完成且与职责无关的个人简介、技能和职位抬头规则。

目标是让单段中文职责 prompt 控制在约 2K-4K input tokens。

### 6.12 `server/puppet-resume/prompts/EnglishPrompt.ts`

执行与中文相同的裁剪。英文职责 output token 上限略高，因为英文职责视觉行宽和 token/字符比例不同。

### 6.13 `vite.config.ts` 第 542-568 行 `resumeHandler`

#### 增加整体硬截止

在第 543 行创建 traceId 后增加：

```ts
const requestController = new AbortController();
const requestTimeout = setTimeout(
  () => requestController.abort(),
  GENERATION_DEADLINE_MS,
);
```

需要把 signal 传入 pipeline 和 generator。`finally` 中始终清理 timer。

#### 失败响应

硬截止返回：

```json
{
  "code": "GENERATION_DEADLINE_EXCEEDED",
  "error": "Resume generation exceeded the service deadline.",
  "traceId": "..."
}
```

不要返回 provider、模型、endpoint 或本地路由信息。

---

## 7. Gateway 逐行修改方案

Gateway 位于 private `custom-api-gateway` 项目。本文仅描述行为，不记录真实入口、认证值或上游密钥。

### 7.1 `gateway.py` 第 22 行

#### 当前

```python
TIMEOUT = float(os.getenv("GATEWAY_TIMEOUT_MS", os.getenv("PROVIDER_TIMEOUT_MS", "300000"))) / 1000
```

#### 问题

300 秒默认值违反 60 秒产品目标。

#### 建议

```python
HARD_TIMEOUT = min(
    float(os.getenv("GATEWAY_HARD_TIMEOUT_MS", "30000")) / 1000,
    35.0,
)
```

单请求可再传 stage deadline，但必须在服务端限制最大值，防止客户端要求无限等待。

### 7.2 `gateway.py` 第 26、54-60 行

#### 当前问题

质量值通过数组索引隐式映射模型，依赖数组顺序。

#### 建议数据结构

把模型配置从逗号数组升级为显式 tier：

```json
{
  "fast": "...",
  "balanced": "...",
  "quality": "..."
}
```

Gateway 只解析 tier，不推断模型能力：

```python
def model_for(tiers: dict[str, str], tier: str) -> str:
    normalized = tier.strip().lower()
    if normalized not in tiers:
        raise ValueError("unsupported model tier")
    return tiers[normalized]
```

如果暂时不能升级配置格式，至少在启动时验证 family 的模型顺序，并为两模型 family 写单元测试。

### 7.3 `gateway.py` 第 91-100 行 `reachable`

每次真实请求前先发送 HEAD 最多增加 8 秒，并且某些上游可能对 HEAD 响应慢或行为特殊。

建议：

- 对 route 健康状态做 15-30 秒 TTL 缓存。
- 健康 route 不在每个请求前重复 HEAD。
- 最近一次网络失败后才重新探测。
- 健康检查最多 1.5 秒。

### 7.4 `gateway.py` 第 103-115、118-134 行

`urllib` 会等待完整 body，不能给客户端提供首字节进度。第一阶段优化不要求立即实现 streaming，但应增加：

- 上游开始时间。
- 首字节时间（切换到支持 streaming 的客户端后）。
- 完成时间。
- response bytes。
- finish reason 和 token usage（存在时）。

日志不能包含 prompt、request body、个人信息或认证值。

### 7.5 `gateway.py` 第 165-181 行

增加请求级字段：

```json
{
  "stage": "structure | role-bullets | layout-refinement",
  "deadline_ms": 18000
}
```

这些字段在发往上游前必须移除。服务端使用：

```python
remaining = min(request_deadline, HARD_TIMEOUT)
```

每个 route fallback 都使用剩余预算，不能重新获得完整 timeout。

### 7.6 `gateway.py` 第 174-190 行

当前 fallback 条件基本合理：

- 401/403：下一个 route。
- 429：下一个 route。
- 5xx：下一个 route。
- unreachable：下一个 route。

需要补充：

- timeout：下一个 route，但受同一总 deadline 限制。
- malformed response：返回 502 或下一个 route。
- 4xx 参数错误：立即返回，不切 route。

### 7.7 Gemini 响应标准化

当前 direct Gemini 返回原生 `candidates`，其他 provider 返回 OpenAI `choices`。JD2Resume 已兼容，但 Gateway 对外宣称 OpenAI-compatible，最好在 Gateway 内统一：

```json
{
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "..." },
    "finish_reason": "stop"
  }],
  "usage": {}
}
```

统一后，客户端不再需要 `gatewayResponseShape`，可以删除一条兼容分支。

---

## 8. 测试方案

### 8.1 单元测试

#### `scripts/verify-puppet-pipeline.mts`

现有测试第 89-132 行已经验证真正的两阶段调用：

- 第一次 prompt 是 Phase 1。
- 第二次 prompt 是 Phase 2。
- 最终职责每段 8 条。

需要新增：

1. 默认 generator 不得向 Phase 1 添加 Single Pass override。
2. 三段经历职责生成同时开始，而不是依次开始。
3. 最大并发不超过 3。
4. 某一段失败时只重试该段。
5. 其他段输出保持逐字不变。
6. 第二次失败后停止，不进行第三次全量重试。

### 8.2 Provider fallback 测试

新增 `scripts/verify-provider-routing.mts`：

- Provider A 在 50ms 后超时。
- Provider B 在 20ms 后成功。
- 断言 B 使用新的 `AbortController`。
- 断言总耗时小于总 deadline。
- 断言同 endpoint 网络不可达时可以跳过重复 endpoint。
- 断言 validation failure 被记录为独立错误类型。

### 8.3 Gateway 合约测试

不使用真实简历，测试三类最小请求：

- Chat-compatible success。
- Gemini native success，直到 Gateway 完成统一响应后移除该分支。
- 401、429、5xx、timeout fallback。
- quality/tier 映射。
- deadline 剩余预算。

严禁在测试 fixture 中写真实 endpoint、key 或个人数据。

### 8.4 性能基准数据集

至少 60 组脱敏 fixture：

| 类型 | 数量 |
|---|---:|
| 中文技术岗位 | 10 |
| 中文运营/市场 | 10 |
| 中文职能/招聘/财务 | 10 |
| 英文技术岗位 | 10 |
| 英文业务岗位 | 10 |
| PDF/图片导入后生成 | 10 |

经历数量覆盖：

- 2 段：20 组。
- 3 段：20 组。
- 4-6 段：20 组。

### 8.5 每次记录字段

```text
traceId
language
sourceType
stage
experienceCount
providerFamilyAlias
modelTier
inputTokens
outputTokens
reasoningTokens
latencyMs
validationResult
retryCount
fallbackCount
errorCode
```

不要记录：

```text
name, phone, email, company content, prompt, response body, endpoint, apiKey
```

### 8.6 A/B 评估

基线 A：当前 Single Pass。

实验 B：Phase A + 并行 per-role Phase B。

控制变量：

- 相同脱敏输入。
- 相同 prompt 版本。
- 相同语言路由。
- temperature 保持 0.2。
- 每个 fixture 至少运行 3 次，降低上游抖动影响。

通过条件：

- B 的 P95 <= 45 秒。
- B 的失败率不高于 A。
- B 的总质量分不低于 A。
- B 的职责含金量和专业技能得分不低于 A。
- B 的平均重试 token 比 A 至少降低 30%。

---

## 9. 分阶段实施顺序

### P0：立即止血

1. 恢复真正两阶段，关闭默认 Single Pass。
2. 将 Phase A 限制为 3K/4K token。
3. 将 Phase B 限制为单段 1.6K/2.2K token。
4. 首轮使用 fast tier。
5. 设置 55 秒整体硬截止。
6. 禁止整份请求自动重试 3 次。

预期收益：P95 从超过 120 秒下降到 40-60 秒区间。

### P1：并行和局部修复

1. 职责按经历并行，最大并发 3。
2. 只重试失败经历。
3. 同 family 模型升级。
4. 引入 provider affinity。

预期收益：2-4 段经历 P95 进入 25-45 秒区间。

### P2：Gateway deadline 和 tier 标准化

1. 请求级 stage/deadline。
2. 明确 fast/balanced/quality tier。
3. 健康检查 TTL 缓存。
4. Gemini 响应统一为 OpenAI-compatible。

预期收益：减少长尾、错误 fallback 和客户端兼容分支。

### P3：体验优化

1. 支持阶段进度事件。
2. Phase A 完成后可先显示简介和技能。
3. 职责按段落逐步填充。
4. 用户可以取消正在生成的请求。

这一步改善感知速度，但不能替代 P0-P2 的真实延迟优化。

---

## 10. 灰度与回滚

### 灰度开关

使用本地/服务端 feature flag，不包含真实路由值：

```text
RESUME_PIPELINE_MODE=two-phase-parallel
```

允许值：

- `legacy-single-pass`
- `two-phase-sequential`
- `two-phase-parallel`

### 上线顺序

1. 测试环境 100%。
2. 生产 10%，观察 24 小时。
3. 生产 50%，观察 P95、失败率和质量抽检。
4. 生产 100%。

### 自动回滚条件

以下任一持续 15 分钟则回滚：

- P95 > 55 秒。
- 失败率 > 5%。
- 锁定字段错误率 > 0。
- 职责或技能结构失败率 > 2%。
- 上游 fallback 率 > 30%。

回滚只切换 pipeline mode，不回滚大学匹配、OCR、渲染或用户数据结构。

---

## 11. 推荐的最终决策

1. 不接受 300 秒作为正常超时。
2. 默认关闭 Single Pass。
3. Phase A 使用低延迟模型，Phase B 按经历并行。
4. 只有失败段落升级模型，不整份升级。
5. 总请求 55 秒硬截止。
6. Gateway 使用显式模型 tier，不再靠数组位置推断质量。
7. Gateway 和 JD2Resume 共享 deadline 概念，但各自保留少量返回错误的时间余量。
8. 用脱敏基准数据同时评估延迟、失败率、token 成本和内容质量，任何性能提升都不能牺牲锁定字段与专业技能质量。

这套方案的核心不是“让模型跑得更久”，而是缩小每次任务、并行独立工作、只修复失败局部，并给整个请求设置不可突破的产品级截止时间。
