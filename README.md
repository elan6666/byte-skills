# Byte Skills

**让 AI 编码助手按目标选择工作方式，从想法推进到经过验证的结果。**

中文 · [English](README_en.md)

Byte Skills 是一组可组合的 `byte-*` 技能，覆盖讨论、研究、规划、构建、评审，以及长任务交接。简单任务直接完成，复杂任务按实际需要组合能力；不要求固定流水线、角色扮演或完整项目文档。

![Byte Skills 总览：自适应入口连接理解、规划、执行和协作能力](assets/overview.svg)

## 快速开始

需要 Git、Bash、Python 3，以及能够加载本地 `SKILL.md` 的编码助手。安装器和 Relay 脚本使用 Python 标准库。

```bash
git clone https://github.com/elan6666/byte-skills.git
cd byte-skills
./install.sh --all
```

这会安装到 `~/.agents/skills` 和 `~/.codex/skills`。安装后刷新技能列表或重新打开会话；按客户端要求操作。

```text
$byte-do 帮我把这个想法做成可运行的原型，并验证关键流程
$byte-build 修复登录回调，并运行相关测试
$byte-research 比较这三个方案，给出有来源的建议
$byte-auto 完成这个功能，直到关键验收条件通过
```

`byte-do` 是显式的综合入口。任务很明确时，可以直接调用对应技能。

其他安装方式：

```bash
./install.sh                              # 仅安装到 ~/.agents/skills
./install.sh --target ~/.claude/skills     # 指定其他技能目录
./install.sh --all --check                # 检查已安装副本是否一致
```

安装器会替换目标目录中同名的 Byte 技能；请先保存自行修改的版本。支持程度取决于客户端的技能格式和工具能力，跨会话通信与自动化需要相应的运行环境。只有读取 DSH 压缩会话时才需要额外安装 `zstd`。

## 选择技能

| 技能 | 适用场景 |
| --- | --- |
| [byte-do](skills/byte-do/SKILL.md) | 综合任务：选择最小且有用的能力组合 |
| [byte-discuss](skills/byte-discuss/SKILL.md) | 讨论需求、方向和取舍 |
| [byte-brainstorm](skills/byte-brainstorm/SKILL.md) | 提出并比较不同思路 |
| [byte-research](skills/byte-research/SKILL.md) | 查证会影响决策的外部信息 |
| [byte-plan](skills/byte-plan/SKILL.md) | 制定与任务复杂度相称的执行计划 |
| [byte-build](skills/byte-build/SKILL.md) | 实现聚焦改动并验证结果 |
| [byte-review](skills/byte-review/SKILL.md) | 根据代码和证据识别重要问题 |
| [byte-status](skills/byte-status/SKILL.md) | 核实进展、阻塞和下一步 |
| [byte-future](skills/byte-future/SKILL.md) | 保存以后再做的想法 |
| [byte-auto](skills/byte-auto/SKILL.md) | 持续推进已授权目标，直到完成或遇到真实阻塞 |
| [byte-design-supervise](skills/byte-design-supervise/SKILL.md) | Codex 主会话设计与启动，独立会话监督长任务 |
| [byte-relay](skills/byte-relay/SKILL.md) | 跨会话或客户端的身份、所有权与交接记录 |

## 短等待与长任务

![监督模式选择：短等待使用同会话子代理，长任务通过可验证的交接进入监督会话](assets/supervision.svg)

| 情况 | 推荐方式 |
| --- | --- |
| 很快能完成的命令 | 主助手直接执行 |
| 预计约 1 小时以内、能在当前回合完成的测试等待 | 获授权的同会话子代理；主会话保留所有权并核实结果 |
| 预计约 1 小时以上，或需要主会话结束后继续的训练、消融、批处理 | 明确的监督会话与已授权的事件通知或定时检查 |

时长是选择方式的参考。子代理和模型选择受运行环境及用户授权约束；等待时间超出预期时，应重新评估监督方式。

长任务由主会话先确认真实启动，记录运行身份、日志、验收标准和修复范围，再通过 `byte-relay` 交接。监督会话只处理约定范围内的问题，任务结束后交回证据，并停用本次运行的监控。主会话核实结果后推进已授权的下一阶段。

**跨会话消息送达不代表主会话已经恢复执行。** 自动续跑需要双向唤醒路径和实际接手确认。`run_event.py` 可以记录进程退出事件并调用配置的通知器；空闲 Codex 会话能否被唤醒，仍需在目标环境中验证。没有经过验证的事件适配器时，定时检查有一个检查周期的发现延迟。详见[监督流程](skills/byte-design-supervise/references/workflow.md)和[事件桥接说明](skills/byte-relay/references/codex-event-bridge.md)。

## 可恢复的交接

普通工作不需要 `.byte-os/`。需要跨会话恢复或明确交接时，Relay 使用项目内的记录：

```text
.byte-os/coordination/
├── state.json       # 当前所有者、阶段、下一步与验收标准
├── sessions.json    # 会话 ID、客户端、模型来源与 Git 快照
├── handoffs/        # 交接说明和会话摘要
├── receipts/        # 执行、验证与产物证据
└── reviews/         # 需要时生成的评审材料
```

同一份协调状态只有一个写入所有者。消息负责通知；项目文件、代码和运行证据用于核实事实。模型信息只有在有运行时证据时才视为已验证，技能本身不负责切换模型。

```text
$byte-relay 初始化这个项目的交接状态
```

Relay 包含 Codex、Claude Code、DSH 和 ZCode 的本地会话摘要读取支持；摘要不等于实时消息能力。ZCode 的完整会话摘要仍需由其原生工具补充。实现细节见[协调状态说明](skills/byte-relay/references/coordination-schema.md)。

## 维护与验证

```bash
python3 scripts/sync_shared_references.py --check
python3 -m unittest discover -s tests -v
```

保留的回归测试覆盖会话登记与权限、交接、执行收据、进程事件、重复启动防护和失败通知状态。它们在临时目录中运行，不需要模型 API、GPU 或外部账号，也不验证客户端的定时调度或自动唤醒。

修改共享证据约定时，编辑 `shared/evidence-contract.md`，再运行 `python3 scripts/sync_shared_references.py`。每个使用它的技能都携带自己的副本，便于独立安装。

## 许可

[MIT](LICENSE)。项目受团队式工作方式启发，与字节跳动无隶属关系；文中产品与公司名称归各自权利人所有。
