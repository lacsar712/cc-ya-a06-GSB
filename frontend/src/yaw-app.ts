import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

type LogRow = {
  id: number;
  turbine_code: string;
  yaw_err_deg: number;
  status: string;
  verdict: string | null;
  reason: string | null;
  band_inner_deg: number | null;
  band_outer_deg: number | null;
  created_by: string;
  created_at: string;
  processed_at: string | null;
};

type BandSetting = {
  id: number;
  inner_deg: number;
  outer_deg: number;
  changed_by: string;
  changed_at: string;
};

type BandInfo = {
  current: BandSetting | null;
  history: BandSetting[];
};

type Session = {
  token: string;
  username: string;
  role: string;
};

type View = "logs" | "band";

@customElement("yaw-align-app")
export class YawAlignApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      box-sizing: border-box;
      padding: 1.5rem;
      max-width: 960px;
      margin: 0 auto;
    }
    h1 {
      margin: 0;
      font-size: 1.4rem;
      color: #38bdf8;
    }
    .sub {
      color: #94a3b8;
      margin-bottom: 1.5rem;
    }
    .topbar {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1.25rem;
    }
    .tabs {
      display: flex;
      gap: 0.4rem;
      flex: 1;
    }
    .tabs button {
      background: transparent;
      border: 1px solid #334155;
      color: #94a3b8;
      font-weight: 600;
    }
    .tabs button.active {
      background: #0284c7;
      border-color: #0284c7;
      color: #fff;
    }
    .who {
      color: #94a3b8;
      font-size: 0.85rem;
    }
    section {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
      border: 1px solid #334155;
    }
    label {
      display: block;
      font-size: 0.85rem;
      color: #cbd5e1;
      margin-bottom: 0.25rem;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 0.5rem 0.65rem;
      border-radius: 6px;
      border: 1px solid #475569;
      background: #0f172a;
      color: #f1f5f9;
      margin-bottom: 0.75rem;
    }
    button {
      cursor: pointer;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: none;
      background: #0284c7;
      color: #fff;
      font-weight: 600;
    }
    button.secondary {
      background: #475569;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    th,
    td {
      text-align: left;
      padding: 0.5rem 0.4rem;
      border-bottom: 1px solid #334155;
    }
    th {
      color: #94a3b8;
      font-weight: 600;
    }
    tbody tr {
      cursor: pointer;
    }
    tbody tr:hover {
      background: #273549;
    }
    tbody tr.selected {
      background: #2d3f58;
    }
    .tag {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .ok {
      background: #14532d;
      color: #86efac;
    }
    .amber {
      background: #92400e;
      color: #fde68a;
    }
    .bad {
      background: #7f1d1d;
      color: #fca5a5;
    }
    .pending {
      background: #713f12;
      color: #fde68a;
    }
    .err {
      color: #f87171;
      margin-top: 0.5rem;
    }
    .msg-ok {
      color: #4ade80;
      margin-top: 0.5rem;
    }
    .row-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .footnote {
      margin-top: 0.75rem;
      padding-top: 0.6rem;
      border-top: 1px dashed #475569;
      color: #94a3b8;
      font-size: 0.85rem;
    }
    .strip {
      display: flex;
      height: 2.4rem;
      border-radius: 6px;
      overflow: hidden;
      margin: 0.75rem 0 0.35rem;
    }
    .seg {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.78rem;
      white-space: nowrap;
      overflow: hidden;
      padding: 0 0.3rem;
    }
    .seg.ok {
      background: #14532d;
      color: #86efac;
    }
    .seg.amber {
      background: #92400e;
      color: #fde68a;
    }
    .seg.bad {
      background: #7f1d1d;
      color: #fca5a5;
    }
    .marks {
      color: #94a3b8;
      font-size: 0.8rem;
      margin-bottom: 0.75rem;
    }
    .samples {
      display: flex;
      gap: 1.25rem;
      flex-wrap: wrap;
      align-items: center;
      font-size: 0.85rem;
      color: #cbd5e1;
    }
    .band-now {
      font-size: 1.05rem;
      color: #fde68a;
      font-weight: 600;
    }
    .hint {
      color: #94a3b8;
      font-size: 0.85rem;
    }
    .kv {
      color: #cbd5e1;
      font-size: 0.9rem;
      margin: 0.15rem 0;
    }
  `;

  @state() private session: Session | null = null;
  @state() private logs: LogRow[] = [];
  @state() private band: BandInfo | null = null;
  @state() private view: View = "logs";
  @state() private selectedId: number | null = null;
  @state() private loginUser = "technician";
  @state() private loginPass = "tech123456";
  @state() private turbineCode = "";
  @state() private yawErr = "";
  @state() private bandInner = "";
  @state() private bandOuter = "";
  @state() private error = "";
  @state() private bandMsg = "";
  @state() private loading = false;

  connectedCallback() {
    super.connectedCallback();
    const raw = localStorage.getItem("yaw_session");
    if (raw) {
      try {
        this.session = JSON.parse(raw) as Session;
        void this.refreshAll();
        this._pollTimer = window.setInterval(() => void this.refreshAll(), 2000);
      } catch {
        localStorage.removeItem("yaw_session");
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
    }
  }

  private _pollTimer?: number;

  private authHeaders(): HeadersInit {
    return this.session
      ? { Authorization: `Bearer ${this.session.token}` }
      : {};
  }

  private async refreshAll() {
    await Promise.all([this.refreshLogs(), this.refreshBand()]);
  }

  private async refreshLogs() {
    if (!this.session) return;
    try {
      const res = await fetch("/api/logs", { headers: this.authHeaders() });
      if (res.status === 401) {
        this.logout();
        return;
      }
      if (!res.ok) return;
      this.logs = (await res.json()) as LogRow[];
    } catch {
      /* ignore transient network errors */
    }
  }

  private async refreshBand() {
    if (!this.session) return;
    try {
      const res = await fetch("/api/band", { headers: this.authHeaders() });
      if (!res.ok) return;
      this.band = (await res.json()) as BandInfo;
    } catch {
      /* ignore transient network errors */
    }
  }

  private async login() {
    this.error = "";
    this.loading = true;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.loginUser,
          password: this.loginPass,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error = data.detail || "登录失败";
        return;
      }
      this.session = {
        token: data.access_token,
        username: data.username,
        role: data.role,
      };
      localStorage.setItem("yaw_session", JSON.stringify(this.session));
      await this.refreshAll();
      this._pollTimer = window.setInterval(() => void this.refreshAll(), 2000);
    } catch {
      this.error = "无法连接接口";
    } finally {
      this.loading = false;
    }
  }

  private logout() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this.session = null;
    this.logs = [];
    this.band = null;
    this.selectedId = null;
    localStorage.removeItem("yaw_session");
  }

  private get isWriter() {
    return this.session?.role === "writer";
  }

  private async submitLog() {
    this.error = "";
    this.loading = true;
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({
          turbine_code: this.turbineCode,
          yaw_err_deg: Number(this.yawErr),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error = data.detail || "提交失败";
        return;
      }
      this.turbineCode = "";
      this.yawErr = "";
      await this.refreshLogs();
    } catch {
      this.error = "提交时网络异常";
    } finally {
      this.loading = false;
    }
  }

  private async saveBand() {
    this.error = "";
    this.bandMsg = "";
    const inner = Number(this.bandInner);
    const outer = Number(this.bandOuter);
    if (!Number.isFinite(inner) || !Number.isFinite(outer)) {
      this.error = "内界、外界必须是数字";
      return;
    }
    if (inner <= 0) {
      this.error = "内界必须大于 0";
      return;
    }
    if (outer <= inner) {
      this.error = "外界必须大于内界";
      return;
    }
    this.loading = true;
    try {
      const res = await fetch("/api/band", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({ inner_deg: inner, outer_deg: outer }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.error = data.detail || "改带失败";
        return;
      }
      this.band = data as BandInfo;
      this.bandInner = "";
      this.bandOuter = "";
      this.bandMsg = "已保存新琥珀带：仅作用于之后新单，已被领记录仍按领时快照。";
    } catch {
      this.error = "改带时网络异常";
    } finally {
      this.loading = false;
    }
  }

  private verdictClass(row: LogRow) {
    if (row.status === "pending") return "pending";
    if (row.verdict === "合格") return "ok";
    if (row.verdict === "近阈") return "amber";
    if (row.verdict === "偏航超差") return "bad";
    return "";
  }

  /** 总览与详情共用同一渲染，保证同色同字。 */
  private verdictTag(row: LogRow) {
    if (row.status === "pending") {
      return html`<span class="tag pending">待处理</span>`;
    }
    if (!row.verdict) return html`—`;
    return html`<span class="tag ${this.verdictClass(row)}">${row.verdict}</span>`;
  }

  private get selectedRow(): LogRow | null {
    return this.logs.find((r) => r.id === this.selectedId) ?? null;
  }

  private fmtTime(s: string | null) {
    if (!s) return "—";
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleString("zh-CN", { hour12: false });
  }

  private renderLogin() {
    return html`
      <h1>风机偏航对中台</h1>
      <p class="sub">现场技师提交偏航误差，后台 worker 认领后给出合格、近阈或偏航超差结论。</p>
      <section>
        <label>用户名</label>
        <input
          .value=${this.loginUser}
          @input=${(e: Event) =>
            (this.loginUser = (e.target as HTMLInputElement).value)}
        />
        <label>密码</label>
        <input
          type="password"
          .value=${this.loginPass}
          @input=${(e: Event) =>
            (this.loginPass = (e.target as HTMLInputElement).value)}
        />
        <button ?disabled=${this.loading} @click=${this.login}>登录</button>
        ${this.error ? html`<p class="err">${this.error}</p>` : null}
      </section>
    `;
  }

  private renderTopbar() {
    return html`
      <div class="topbar">
        <h1>风机偏航对中台</h1>
        <div class="tabs">
          <button
            class=${this.view === "logs" ? "active" : ""}
            @click=${() => (this.view = "logs")}
          >
            对中记录
          </button>
          <button
            class=${this.view === "band" ? "active" : ""}
            @click=${() => {
              this.view = "band";
              this.error = "";
              void this.refreshBand();
            }}
          >
            近阈琥珀带
          </button>
        </div>
        <span class="who">
          ${this.session?.username}（${this.isWriter ? "可提交" : "只读"}）
        </span>
        <button class="secondary" @click=${this.logout}>退出</button>
      </div>
    `;
  }

  private renderDetail(row: LogRow) {
    return html`
      <section>
        <h2 style="margin-top:0;font-size:1.1rem;">
          记录详情 #${row.id} · 机组 ${row.turbine_code}
        </h2>
        <p class="kv">偏航误差：${row.yaw_err_deg}°　结论：${this.verdictTag(row)}</p>
        <p class="kv">说明：${row.reason ?? "—"}</p>
        <p class="kv">
          提交人：${row.created_by}　提交时间：${this.fmtTime(row.created_at)}　处理时间：${this.fmtTime(row.processed_at)}
        </p>
        <p class="footnote">
          ${row.status === "pending"
            ? "注脚：待认领——worker 认领时将按当时生效的琥珀带判定，并把领时快照写入本记录。"
            : row.band_inner_deg != null && row.band_outer_deg != null
              ? `注脚（与列表着色同一套界，认领时快照）：合格 |误差| ≤ ${row.band_inner_deg}°；` +
                `近阈 ${row.band_inner_deg}° < |误差| ≤ ${row.band_outer_deg}°；` +
                `超差 |误差| > ${row.band_outer_deg}°`
              : "注脚：历史记录无琥珀带快照。"}
        </p>
      </section>
    `;
  }

  private renderLogsView() {
    const selected = this.selectedRow;
    return html`
      ${this.isWriter
        ? html`
            <section>
              <h2 style="margin-top:0;font-size:1.1rem;">提交偏航记录</h2>
              <label>机组编号</label>
              <input
                placeholder="例如 W12"
                .value=${this.turbineCode}
                @input=${(e: Event) =>
                  (this.turbineCode = (e.target as HTMLInputElement).value)}
              />
              <label>偏航误差（度，可正可负）</label>
              <input
                type="number"
                step="0.1"
                .value=${this.yawErr}
                @input=${(e: Event) =>
                  (this.yawErr = (e.target as HTMLInputElement).value)}
              />
              <button ?disabled=${this.loading} @click=${this.submitLog}>
                提交（进入待认领队列）
              </button>
              ${this.error ? html`<p class="err">${this.error}</p>` : null}
              <p class="hint">落入琥珀带的误差仍可入队，结论标「近阈」；超出琥珀带外界才算超差。</p>
            </section>
          `
        : null}

      <section>
        <div class="row-actions" style="margin-bottom:0.5rem;">
          <h2 style="margin:0;font-size:1.1rem;flex:1;">对中记录</h2>
          <button class="secondary" ?disabled=${this.loading} @click=${this.refreshLogs}>
            刷新列表
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>机组</th>
              <th>误差°</th>
              <th>状态</th>
              <th>结论</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            ${this.logs.map(
              (row) => html`
                <tr
                  class=${row.id === this.selectedId ? "selected" : ""}
                  @click=${() =>
                    (this.selectedId = row.id === this.selectedId ? null : row.id)}
                >
                  <td>${row.id}</td>
                  <td>${row.turbine_code}</td>
                  <td>${row.yaw_err_deg}</td>
                  <td>
                    <span class="tag ${row.status === "pending" ? "pending" : "ok"}">
                      ${row.status === "pending" ? "待处理" : "已完成"}
                    </span>
                  </td>
                  <td>${this.verdictTag(row)}</td>
                  <td>${row.reason ?? "—"}</td>
                </tr>
              `
            )}
          </tbody>
        </table>
        <p class="hint">点击行查看详情；详情的结论与注脚和本表着色同一套界。</p>
      </section>

      ${selected ? this.renderDetail(selected) : null}
    `;
  }

  private renderBandView() {
    const cur = this.band?.current ?? null;
    const history = this.band?.history ?? [];
    return html`
      <section>
        <h2 style="margin-top:0;font-size:1.1rem;">当前生效的近阈琥珀带</h2>
        ${cur
          ? html`
              <p class="band-now">
                合格带 ±${cur.inner_deg}° ｜ 琥珀带 (${cur.inner_deg}°, ${cur.outer_deg}°] ｜ 外界 ±${cur.outer_deg}°
              </p>
              <div class="strip">
                <div class="seg ok" style="flex:${cur.inner_deg}">
                  合格 |x| ≤ ${cur.inner_deg}°
                </div>
                <div class="seg amber" style="flex:${cur.outer_deg - cur.inner_deg}">
                  近阈 ${cur.inner_deg}° &lt; |x| ≤ ${cur.outer_deg}°
                </div>
                <div class="seg bad" style="flex:${cur.inner_deg * 0.8}">
                  超差 |x| &gt; ${cur.outer_deg}°
                </div>
              </div>
              <p class="marks">
                内界 ${cur.inner_deg}°（绿→琥珀）｜ 外界 ${cur.outer_deg}°（琥珀→红）
              </p>
              <div class="samples">
                <span>样例色：</span>
                <span><span class="tag ok">合格</span> 例 ${(cur.inner_deg * 0.8).toFixed(1)}°</span>
                <span><span class="tag amber">近阈</span> 例 ${((cur.inner_deg + cur.outer_deg) / 2).toFixed(1)}°</span>
                <span><span class="tag bad">偏航超差</span> 例 ${(cur.outer_deg * 1.2).toFixed(1)}°</span>
              </div>
              <p class="hint">
                改带仅作用于之后新单；已被领的记录仍按领时快照的琥珀界。
                本带由 ${cur.changed_by} 于 ${this.fmtTime(cur.changed_at)} 设定。
              </p>
            `
          : html`<p class="hint">加载中…</p>`}
      </section>

      ${this.isWriter
        ? html`
            <section>
              <h2 style="margin-top:0;font-size:1.1rem;">改带（仅现场技师）</h2>
              <label>内界（合格带上限，度）</label>
              <input
                type="number"
                step="0.1"
                placeholder="例如 1.5"
                .value=${this.bandInner}
                @input=${(e: Event) =>
                  (this.bandInner = (e.target as HTMLInputElement).value)}
              />
              <label>外界（琥珀带上限，度，须大于内界）</label>
              <input
                type="number"
                step="0.1"
                placeholder="例如 1.8"
                .value=${this.bandOuter}
                @input=${(e: Event) =>
                  (this.bandOuter = (e.target as HTMLInputElement).value)}
              />
              <button ?disabled=${this.loading} @click=${this.saveBand}>
                保存新琥珀带
              </button>
              ${this.error ? html`<p class="err">${this.error}</p>` : null}
              ${this.bandMsg ? html`<p class="msg-ok">${this.bandMsg}</p>` : null}
            </section>
          `
        : html`
            <section>
              <p class="hint">观察账号只读，不可改带。</p>
            </section>
          `}

      <section>
        <h2 style="margin-top:0;font-size:1.1rem;">改带历史</h2>
        <table>
          <thead>
            <tr>
              <th>序号</th>
              <th>内界°</th>
              <th>外界°</th>
              <th>修改人</th>
              <th>修改时间</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(
              (h) => html`
                <tr style="cursor:default;">
                  <td>${h.id}</td>
                  <td>${h.inner_deg}</td>
                  <td>${h.outer_deg}</td>
                  <td>${h.changed_by}</td>
                  <td>${this.fmtTime(h.changed_at)}</td>
                </tr>
              `
            )}
          </tbody>
        </table>
      </section>
    `;
  }

  render() {
    if (!this.session) {
      return this.renderLogin();
    }
    return html`
      ${this.renderTopbar()}
      ${this.view === "logs" ? this.renderLogsView() : this.renderBandView()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yaw-align-app": YawAlignApp;
  }
}
