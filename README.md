# 风机偏航对中台

现场技师登记机组编号与偏航误差（度）；后台 worker 用数据库行锁认领待处理记录，按当前「近阈琥珀带」写入结论：

- `|x| ≤ 合格内界`（默认 ±1.5°）：**合格**（绿）；
- `合格内界 < |x| ≤ 琥珀外界`（默认 ±1.8°）：**近阈**（琥珀），仍属合格、可正常入队，但结论须标「近阈」；
- `|x| > 琥珀外界`：**偏航超差**（红）——只有超出琥珀外缘才算超差。

琥珀带可在「近阈琥珀带」专页调整。改带以 append-only 版本表（`band_configs`）追加新版本，**只作用于之后新认领的单据**；worker 认领单据的同一事务会把当时的内/外界与版本号快照进单据，已被领走的单据此后始终按领单时的界着色与判定。前端为 Lit 组件 + Vite，接口为 Quart + Hypercorn。

## 端口

| 服务 | 地址 |
|------|------|
| 页面 | http://localhost:3199 |
| 接口 | http://localhost:8199 |
| PostgreSQL | localhost:54399（库名 `yawalign`） |

## 账号

| 用户 | 密码 | 权限 |
|------|------|------|
| technician | tech123456 | 可提交、可改带 |
| observer | obs123456 | 只读（可查看琥珀带与改带历史，不可改带） |

## 启动

```bash
cd projects/20-yaw-align-log
docker compose up --build
```

健康检查：`GET http://localhost:8199/api/health` → `{"status":"ok","service":"yaw-align-log"}`。

## 验收

1. 种子数据（默认带 ±1.5°～±1.8°）：机组 W01 误差 0.4°「合格」；机组 W04 误差 −1.6°「近阈」（琥珀，仍合格）；机组 W07 误差 3.2°「偏航超差」。
2. technician 提交新记录后，列表先显示「待处理」，数秒内 worker 处理后变为对应结论。默认带下报 **1.6° 应近阈（非超差）**，报 **2.0° 应偏航超差**。
3. observer 可查看列表、当前琥珀带与改带历史，无提交表单、无改带表单（只读不可改带）。
4. 顶栏「近阈琥珀带」专页展示合格内界 / 琥珀外界 / 超差三档的**内外界样例色**与**改带历史**；总览标签、展开详情标签与样例色**同色同字**，详情注脚写明该单领单时快照的界。
5. 改带（technician）只追加新版本并作用于此后新认领的单据；已被领走的单据颜色/结论保持领单时快照不变（展开可见其快照的带版本号）。

## 接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/band` | 登录 | 当前生效琥珀带 |
| GET | `/api/band/history` | 登录 | 改带历史（新到旧） |
| POST | `/api/band` | technician | 追加新琥珀带版本（`inner_deg` < `outer_deg`） |
| GET/POST | `/api/logs` | 登录 / technician | 列表（含快照界）/ 提交入队 |

## 技术栈

- 后端：Quart、psycopg、`worker.py`（`FOR UPDATE SKIP LOCKED`，认领事务内快照琥珀带）、Hypercorn
- 数据库：`yaw_logs`（单据 + 领单时快照的 `band_id`/内/外界）、`band_configs`（append-only 带版本表）
- 前端：Lit、TypeScript、Vite；生产镜像内 nginx 反代 `/api`
- 镜像源：DaoCloud 基础镜像、清华 PyPI、npmmirror npm
