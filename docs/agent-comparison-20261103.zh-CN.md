# claude-mem / T3 Code 对比与 Byte 第一轮升级

观察日期：2026-11-03（北京时间）。结论来自固定源码、本地组件运行和 Byte 实际浏览器操作；不是完整产品排行榜。

## 看到了什么差距

| 项目 | 与 Byte 重叠 | 相对 Byte 原版的优势 | 本次证据与限制 |
| --- | --- | --- | --- |
| [claude-mem](https://github.com/thedotmack/claude-mem) | 跨会话延续、项目历史、上下文复用 | 将观测、摘要和搜索做成独立记忆系统，先检索再按需取详情；原 Byte 主要靠 STATE/LESSONS 和任务记录 | 实际执行上游 15 项检索测试，以及 1 项关闭 / 重开数据库的独立探针。确认中文检索、组合词、项目隔离、持久化。没有启用宿主插件、自动观测或 AI 摘要，未证明摘要质量或 token 节省比例。 |
| [T3 Code](https://github.com/pingdotgg/t3code) | 多 Harness、项目与会话聚合、活动历史 | 官方提供可操作 Agent 的多端控制面；历史分页、身份去重及保留实时更新的处理比原 Byte 的短事件列表更完整 | 对原始历史合并模块编译后执行 6 个本地探针，验证分页、去重、跨会话同名 ID、保留新数据、隐藏记录和过期请求处理。没有跑完整桌面 / 手机客户端，也未登录真实模型测试控制、审批或远程连接。 |

“更强”的结论只适用于这些具体功能与代码边界。上游测试通过不代表全产品、所有 Harness 或无人值守流程都已验证。Byte 的工作流验收、明确角色和 Bridge 交接仍应保留；记忆不会替代授权，办公室动画不会替代执行证据。

## 固定版本与可复现检查

- claude-mem `15.9.0`：[`02584c4ac9d92fea45adf5c61e22c546b5738621`](https://github.com/thedotmack/claude-mem/tree/02584c4ac9d92fea45adf5c61e22c546b5738621)。许可 Apache-2.0。
- T3 Code：[`cbd3e149a130f1d99d2d067c77b9889d64e28755`](https://github.com/pingdotgg/t3code/tree/cbd3e149a130f1d99d2d067c77b9889d64e28755)。许可 MIT。
- Byte 基础提交 `7802439a1907bea79267ab40028d7ba3cd9f637d`。办公室此前已存在于未提交工作区（v0.2.0）；此次在同一个 main 工作区增量修改，保留无关改动。该提交号本身不能重建此前未提交的办公室。

claude-mem 原生测试：

```bash
# 在隔离的固定版本 checkout；需要 Bun 和 zod。
CLAUDE_MEM_DATA_DIR=/absolute/isolated/test-data bun test \
  tests/storage/sqlite/memory-unsegmented-search.test.ts \
  tests/services/sqlite/search-empty-input.test.ts
# 15 pass, 0 fail
```

T3 运行的模块是 `packages/client-runtime/src/state/threadHistoryMerge.ts`，
真实依赖 `packages/shared/src/orchestrationV2Timeline.ts`，经 esbuild 去除类型并绑定上述路径；
没有改写上游函数、替换运行逻辑或调用模型。6 个探针不是 T3 的完整测试套件。
本地独立持久化探针、T3 探针、命令输出及固定版本 checkout 位置见本机验收目录；
上游源码仅在该目录中测试，未搬进 Byte 发布代码。

## 已实现的升级

1. **本地项目回忆检索**：新增独立的 `byte-status/scripts/recall.mjs`。
   先返回小索引，按实际 ID 和哈希取详情；支持中文子串和多词共同匹配。
   来源是项目笔记、教训、协调字段、最近 5000 个身份匹配的 Bridge 任务 / 结果摘要。
   每次从持久来源按需重建，删除来源后不会残留第二份永久记忆副本。
2. **来源与预算**：来源路径、任务 ID、内容 SHA-256、字符预算及截断提示。
   先处理私密标签与常见凭证模式；检索结果标明历史数据，不升级为新授权。
   无新增 npm 依赖、外部模型或自动对话注入。
3. **任务台**：按任务名、验收词和状态筛选；查看参与者、验收条件及产物链接。
   产物继续走现有 SHA-256 / 路径检查接口。
4. **任务事件历史**：选定项目 / 任务及其投递消息，按序号加载更早记录，去重并保留已读历史。
   传输、结果、核验和主会话继续仍是不同记录；不伪造实时输出。
5. **像素办公室保留**：新增任务 / 记忆入口，原有人物移动、空闲生活、交接与未知状态规则仍在。
6. **技能接入**：byte-do / byte-status 增加按需检索指导；变更的两个 SKILL.md、独立脚本与参考文档已同步到两处本地技能目录，校验内容一致。技能数量仍为 14。

这是对工作方式的独立实现，不直接复制上游实现代码。不增加自动采集、embedding、后台常驻采集、手机端或远程 Agent 控制。这些是后续可评估方向，不能在当前宣传材料中写成已经完成。

## 验证结果

- Byte Office 原有 22 项检查全部保留通过；新增 11 项，合计 **33 / 33**。
- 覆盖中文检索、组合词、私密内容处理、项目 / 任务隔离、符号链接、未来 schema、预算、来源变化、删除后无残留、跨进程恢复、历史分页、去重及 API 同源边界。
- 两个独立 Node 进程先搜后读同一项目，真实文件哈希与修改时间保持不变。
- 上游数据库与 Byte 测试均使用独立临时数据。未更改真实 Agent 的配置、账号、执行权限、Bridge 状态或训练进程；未创建计时器。
- 实际浏览器：任务状态筛选从 2 条缩到 1 条；任务历史从 40 条增加到 80 条；中文“数据库”命中并展示来源 / 哈希；切换项目清空旧上下文；浏览器检查未见 error/warn。
- 真实 Byte 项目页面读取到 **38 个目录会话**。这代表本地目录元数据；不代表 38 个在线 Agent，也不代表新的跨会话任务实测。

```bash
cd apps/byte-workbench
npm run check
npm test
# 33 pass, 0 fail
```

## 本机交付与范围

- 当前运行入口：`http://127.0.0.1:4329/`，先选项目。只绑定本机，不安装后台服务。
- 启动：从 Byte 仓库运行 `bash scripts/workbench.sh`（默认 4317）。
- 检索说明：[项目回忆](../skills/byte-status/references/project-recall.md)。
- 本机详细证据：本地 `benchmarks/20261103-agent-comparison/` 目录（不随仓库发布）。
- 截图：该目录的 `byte-office-live.png`，是实际本地页面，含目录会话信息；对外取材时只展示必要区域。
- 本文记录对比验收时的本地状态；后续发布版本以 Git 提交为准，Agensi 上架包需单独更新。
