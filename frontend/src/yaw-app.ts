import { css, html, LitElement, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";

type LogRow = {
  id: number;
  turbine_code: string;
  yaw_err_deg: number;
  status: string;
  verdict: string | null;
  reason: string | null;
  near_threshold: boolean;
  band_id: number | null;
  inner_threshold_deg: number | null;
  outer_threshold_deg: number | null;
  created_by: string;
  created_at: string;
  processed_at: string | null;
};

type BandRow = {
  id: number;
  inner_deg: number;
  outer_deg: number;
  changed_by: string;
  changed_at: string;
  note: string | null;
};

type Session = {
  token: string;
  username: string;
  role: string;
};

type Tag = { text: string; cls: string };

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
      margin: 0 0 0.25rem;
      font-size: 1.75rem;
      color: #38bdf8;
    }
    h2 {
      margin-top: 0;
      font-size: 1.1rem;
    }
    .sub {
      color: #94a3b8;
      margin-bottom: 1rem;
    }
    .topbar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 1.25rem;
    }
    .tabs {
      display: flex;
      gap: 0.4rem;
    }
    .tab {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
    }
    .tab.active {
      background: #0284c7;
      border-color: #0284c7;
      color: #fff;
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
    .grid2 {
      display: flex;
      gap: 0.75rem;
    }
    .grid2 > div {
      flex: 1;
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
      vertical-align: middle;
    }
    th {
      color: #94a3b8;
      font-weight: 600;
    }
    tbody tr.clickable {
      cursor: pointer;
    }
    tbody tr.clickable:hover {
      background: #243349;
    }
    .tag {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-size: 0.8rem;
      white-space: nowrap;
    }
    /* 状态色单一来源：总览标签、详情标签、琥珀页样例色都引用这一组 class */
    .ok {
      background: #14532d;
      color: #86efac;
    }
    .near {
      background: #78350f;
      color: #fbbf24;
    }
    .bad {
      background: #7f1d1d;
      color: #fca5a5;
    }
    .pending {
      background: #334155;
      color: #cbd5e1;
    }
    .detail {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 0.75rem 0.9rem;
    }
    .detail .footnote {
      color: #94a3b8;
      font-size: 0.82rem;
      margin: 0.6rem 0 0;
      line-height: 1.5;
    }
    .swatches {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin: 0.5rem 0 0.25rem;
    }
    .swatch {
      flex: 1 1 180px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 0.75rem 0.9rem;
    }
    .swatch .range {
      color: #cbd5e1;
      font-size: 0.85rem;
      margin: 0.4rem 0;
    }
    .swatch .eg {
      color: #94a3b8;
      font-size: 0.8rem;
    }
    .current-band {
      font-size: 0.95rem;
      color: #e2e8f0;
    }
    .current-band b {
      color: #fbbf24;
    }
    .hint {
      color: #94a3b8;
      font-size: 0.82rem;
      margin: 0.4rem 0 0;
      line-height: 1.5;
    }
    .readonly-note {
      background: #0f172a;
      border: 1px dashed #475569;
      border-radius: 6px;
      padding: 0.75rem 0.9rem;
      color: #94a3b8;
      font-size: 0.85rem;
    }
    .err {
      color: #f87171;
      margin-top: 0.5rem;
    }
    .ok-msg {
      color: #86efac;
      margin-top: 0.5rem;
    }
  `;

  @state() private session: Session | null = null;
  @state() private view: "overview" | "band" = "overview";
  @state() private logs: LogRow[] = [];
  @state() private band: BandRow | null = null;
  @state() private bandHistory: BandRow[] = [];
  @state() private selectedId: number | null = null;
  @state() private loginUser = "technician";
  @state() private loginPass = "tech123456";
  @state() private turbineCode = "";
  @state() private yawErr = "";
  @state() private newInner = "";
  @state() private newOuter = "";
  @state() private bandNote = "";
  @state() private error = "";
  @state() private bandMsg = "";
  @state() private loading = false;

  private _pollTimer?: number;

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
    if (this._pollTimer) clearInterval(this._pollTimer);
  }

  private authHeaders(): HeadersInit {
    return this.session
      ? { Authorization: `Bearer ${this.session.token}` }
      : {};
  }

  private async refreshAll() {
    if (!this.session) return;
    const [logsRes, bandRes, histRes] = await Promise.all([
      fetch("/api/logs", { headers: this.authHeaders() }),
      fetch("/api/band", { headers: this.authHeaders() }),
      fetch("/api/band/history", { headers: this.authHeaders() }),
    ]);
    if (logsRes.status === 401 || bandRes.status === 401) {
      this.logout();
      return;
    }
    if (logsRes.ok) this.logs = (await logsRes.json()) as LogRow[];
    if (bandRes.ok) this.band = (await bandRes.json()) as BandRow;
    if (histRes.ok) this.bandHistory = (await histRes.json()) as BandRow[];
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
      if (this._pollTimer) clearInterval(this._pollTimer);
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
    this.bandHistory = [];
    this.selectedId = null;
    localStorage.removeItem("yaw_session");
  }

  private get isWriter() {
    return this.session?.role === "writer";
  }

  private switchView(v: "overview" | "band") {
    this.view = v;
    this.error = "";
    if (v === "band" && this.band) {
      // 进入琥珀页时用当前界预填（用户已手动改动过则保留其输入）。
      if (!this.newInner) this.newInner = String(this.band.inner_deg);
      if (!this.newOuter) this.newOuter = String(this.band.outer_deg);
    }
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
      await this.refreshAll();
    } catch {
      this.error = "提交时网络异常";
    } finally {
      this.loading = false;
    }
  }

  private async changeBand() {
    this.bandMsg = "";
    this.error = "";
    try {
      const res = await fetch("/api/band", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(),
        },
        body: JSON.stringify({
          inner_deg: Number(this.newInner),
          outer_deg: Number(this.newOuter),
          note: this.bandNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        this.bandMsg = "";
        this.error = data.detail || "改带失败";
        return;
      }
      this.error = "";
      this.bandMsg =
        `已写入琥珀带版本 #${data.id}（±${data.inner_deg}°～±${data.outer_deg}°）。` +
        "仅作用于此后新认领的单据，已领单据仍按领单时快照界。";
      this.newInner = String(data.inner_deg);
      this.newOuter = String(data.outer_deg);
      this.bandNote = "";
      await this.refreshAll();
    } catch {
      this.error = "改带时网络异常";
    }
  }

  // ---- 单一来源：状态字样 + 配色。总览、详情、样例色全部经此函数渲染 ----
  private verdictTag(row: LogRow): Tag {
    if (row.status === "pending") return { text: "待处理", cls: "pending" };
    if (row.verdict === "偏航超差") return { text: "偏航超差", cls: "bad" };
    if (row.near_threshold) return { text: "近阈", cls: "near" };
    return { text: "合格", cls: "ok" };
  }

  private renderTag(tag: Tag): TemplateResult {
    return html`<span class="tag ${tag.cls}">${tag.text}</span>`;
  }

  // ---- 单一来源：区间描述。样例色与详情注脚共用，保证同一套界 ----
  private bandRange(inner: number, outer: number): string {
    return `±${inner}°～±${outer}°`;
  }

  private snapshotFootnote(row: LogRow): string {
    if (row.status === "pending" || row.band_id == null) {
      return "尚未认领：认领瞬间将快照当时的琥珀带，此后始终按该套界着色与判定，运行中改带不影响本单。";
    }
    const inner = row.inner_threshold_deg;
    const outer = row.outer_threshold_deg;
    return (
      `本单按领单时快照的琥珀带版本 #${row.band_id} 判定：` +
      `合格带 |x| ≤ ±${inner}°；近阈琥珀带 ${this.bandRange(inner!, outer!)}（仍可入队、标「近阈」）；` +
      `超出外界 ±${outer}° 才算「偏航超差」。`
    );
  }

  private fmtTime(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  }

  private toggleRow(id: number) {
    this.selectedId = this.selectedId === id ? null : id;
  }

  // 琥珀页的内/外/超差样例：用当前带的界算代表值，并用 renderTag 着色，
  // 与总览/详情完全同色同字。
  private sampleRows(): { tag: Tag; range: string; eg: string }[] {
    const b = this.band;
    if (!b) return [];
    const inner = b.inner_deg;
    const outer = b.outer_deg;
    const nearEg = Number((inner + (outer - inner) * 0.4).toFixed(2));
    const badEg = Number((outer + Math.max(0.2, (outer - inner) * 0.6)).toFixed(2));
    const okEg = Number((inner / 2).toFixed(2));
    return [
      {
        tag: { text: "合格", cls: "ok" },
        range: `|x| ≤ ±${inner}°`,
        eg: `例如 ${okEg}°`,
      },
      {
        tag: { text: "近阈", cls: "near" },
        range: `±${inner}° < |x| ≤ ±${outer}°`,
        eg: `例如 ${nearEg}°（合格但须标近阈）`,
      },
      {
        tag: { text: "偏航超差", cls: "bad" },
        range: `|x| > ±${outer}°`,
        eg: `例如 ${badEg}°（超出外缘才算超差）`,
      },
    ];
  }

  render() {
    if (!this.session) {
      return html`
        <h1>风机偏航对中台</h1>
        <p class="sub">现场技师提交偏航误差，后台 worker 认领后给出合格 / 近阈 / 偏航超差结论。</p>
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

    return html`
      <h1>风机偏航对中台</h1>
      <div class="topbar">
        <div class="tabs">
          <button
            class="tab ${this.view === "overview" ? "active" : ""}"
            @click=${() => this.switchView("overview")}
          >
            总览
          </button>
          <button
            class="tab ${this.view === "band" ? "active" : ""}"
            @click=${() => this.switchView("band")}
          >
            近阈琥珀带
          </button>
        </div>
        <span class="sub" style="margin:0;">
          ${this.session.username}（${this.isWriter ? "可提交 / 可改带" : "只读"}）
        </span>
        <button class="secondary" @click=${this.logout}>退出</button>
      </div>

      ${this.view === "overview" ? this.renderOverview() : this.renderBand()}
    `;
  }

  private renderOverview() {
    return html`
      ${this.isWriter
        ? html`
            <section>
              <h2>提交偏航记录</h2>
              ${this.band
                ? html`<p class="hint">
                    当前琥珀带：合格 |x| ≤ ±${this.band.inner_deg}°，近阈
                    ${this.bandRange(this.band.inner_deg, this.band.outer_deg)}
                    仍可入队，超过 ±${this.band.outer_deg}° 为超差。
                  </p>`
                : null}
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
            </section>
          `
        : null}

      <section>
        <h2>对中记录</h2>
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>机组</th>
              <th>误差°</th>
              <th>结论</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            ${this.logs.map((row) => {
              const tag = this.verdictTag(row);
              const open = this.selectedId === row.id;
              return html`
                <tr
                  class="clickable"
                  @click=${() => this.toggleRow(row.id)}
                >
                  <td>${row.id}</td>
                  <td>${row.turbine_code}</td>
                  <td>${row.yaw_err_deg}</td>
                  <td>${this.renderTag(tag)}</td>
                  <td>${row.reason ?? "等待 worker 认领…"}</td>
                </tr>
                ${open
                  ? html`
                      <tr>
                        <td></td>
                        <td colspan="4">
                          <div class="detail">
                            <div>
                              <strong>#${row.id} ${row.turbine_code}</strong>
                              &nbsp; 误差 ${row.yaw_err_deg}°
                              &nbsp; 结论 ${this.renderTag(tag)}
                            </div>
                            <p class="footnote">${this.snapshotFootnote(row)}</p>
                            <p class="footnote">
                              提交人 ${row.created_by} · 提交于
                              ${this.fmtTime(row.created_at)} · 处理于
                              ${this.fmtTime(row.processed_at)}
                            </p>
                          </div>
                        </td>
                      </tr>
                    `
                  : nothing}
              `;
            })}
          </tbody>
        </table>
      </section>
    `;
  }

  private renderBand() {
    const b = this.band;
    return html`
      <section>
        <h2>当前近阈琥珀带</h2>
        ${b
          ? html`
              <p class="current-band">
                合格内界 <b>±${b.inner_deg}°</b> · 琥珀外界
                <b>±${b.outer_deg}°</b> · 版本 #${b.id}
              </p>
              <div class="swatches">
                ${this.sampleRows().map(
                  (s) => html`
                    <div class="swatch">
                      ${this.renderTag(s.tag)}
                      <div class="range">${s.range}</div>
                      <div class="eg">${s.eg}</div>
                    </div>
                  `
                )}
              </div>
              <p class="hint">
                落入琥珀带内的单据仍可入队，但结论标为同色同字的「近阈」；
                只有超出琥珀外界才算超差。
              </p>
            `
          : html`<p class="hint">读取琥珀带中…</p>`}
      </section>

      <section>
        <h2>修改琥珀带</h2>
        ${this.isWriter
          ? html`
              <div class="grid2">
                <div>
                  <label>合格内界（度）</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    .value=${this.newInner}
                    @input=${(e: Event) =>
                      (this.newInner = (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div>
                  <label>琥珀外界（度，须大于内界）</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    .value=${this.newOuter}
                    @input=${(e: Event) =>
                      (this.newOuter = (e.target as HTMLInputElement).value)}
                  />
                </div>
              </div>
              <label>改带备注（可选）</label>
              <input
                placeholder="例如 季节性放宽近阈观察"
                .value=${this.bandNote}
                @input=${(e: Event) =>
                  (this.bandNote = (e.target as HTMLInputElement).value)}
              />
              <button @click=${this.changeBand}>写入新琥珀带版本</button>
              ${this.error ? html`<p class="err">${this.error}</p>` : null}
              ${this.bandMsg ? html`<p class="ok-msg">${this.bandMsg}</p>` : null}
              <p class="hint">
                改带以 append-only 方式追加新版本，仅作用于此后新认领的单据；
                已被领走的单据仍按领单时快照的琥珀界着色与判定。
              </p>
            `
          : html`
              <div class="readonly-note">
                当前为只读观察账号，可查看琥珀带与改带历史，但不可改带。
              </div>
            `}
      </section>

      <section>
        <h2>改带历史</h2>
        <table>
          <thead>
            <tr>
              <th>版本</th>
              <th>合格内界</th>
              <th>琥珀外界</th>
              <th>改动人</th>
              <th>改动时间</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            ${this.bandHistory.map(
              (h) => html`
                <tr>
                  <td>#${h.id}</td>
                  <td>±${h.inner_deg}°</td>
                  <td>±${h.outer_deg}°</td>
                  <td>${h.changed_by}</td>
                  <td>${this.fmtTime(h.changed_at)}</td>
                  <td>${h.note ?? "—"}</td>
                </tr>
              `
            )}
          </tbody>
        </table>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yaw-align-app": YawAlignApp;
  }
}
