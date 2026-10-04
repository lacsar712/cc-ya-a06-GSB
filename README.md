# 风机偏航对中台

现场技师登记机组编号与偏航误差（度）；后台 worker 用数据库行锁认领待处理记录，按当前生效的界限写入「合格」「近阈」或「偏航超差」：合格带 ±1.5°，其外再设一条近阈琥珀带（默认 (1.5°, 1.8°]），超出琥珀带外界才算超差。落入琥珀带的记录仍可入队，结论标「近阈」。worker 认领时把当时生效的琥珀带界限快照写入记录，之后改带只作用于新单。顶栏「近阈琥珀带」专页展示内外界样例色、当前界限与改带历史；technician 可改带，observer 只读不可改带。前端为 Lit 组件 + Vite，接口为 Quart + Hypercorn。

## 端口

| 服务 | 地址 |
|------|------|
| 页面 | http://localhost:3199 |
| 接口 | http://localhost:8199 |
| PostgreSQL | localhost:54399（库名 `yawalign`） |

## 账号

| 用户 | 密码 | 权限 |
|------|------|------|
| technician | tech123456 | 可提交 |
| observer | obs123456 | 只读 |

## 启动

```bash
cd projects/20-yaw-align-log
docker compose up --build
```

健康检查：`GET http://localhost:8199/api/health` → `{"status":"ok","service":"yaw-align-log"}`。

## 验收

1. 种子数据：机组 W01 误差 0.4° 结论「合格」；机组 W07 误差 3.2° 结论「偏航超差」。
2. technician 提交新记录后，列表先显示「待处理」，数秒内 worker 处理后变为对应结论。
3. observer 可查看列表，无提交表单。
4. 顶栏「近阈琥珀带」专页：展示当前界限、内外界样例色与改带历史；technician 有改带表单，observer 只读（`PUT /api/band` 返回 403）。
5. 琥珀带设为 1.5–1.8 时：报 1.6° 结论「近阈」（仍可入队，非超差）；报 2.0° 结论「偏航超差」。
6. 改带仅作用于之后新单：已被领记录仍按领时快照的琥珀界判定；点击记录行展开详情，其结论标签与注脚同列表着色同一套界。

## 技术栈

- 后端：Quart、psycopg、`worker.py`（`FOR UPDATE SKIP LOCKED`）、Hypercorn
- 前端：Lit、TypeScript、Vite；生产镜像内 nginx 反代 `/api`
- 镜像源：DaoCloud 基础镜像、清华 PyPI、npmmirror npm
