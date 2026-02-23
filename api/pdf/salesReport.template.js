function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(v) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
  }).format(Number(v || 0));
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("uk-UA");
}

function groupSales(rows) {
  const map = new Map();

  for (const row of rows) {
    const supervisorId = row.supervisor_id || "NO_SV";
    const supervisorName = row.supervisor_name || "Без керівника";

    if (!map.has(supervisorId)) {
      map.set(supervisorId, {
        id: supervisorId,
        name: supervisorName,
        total: 0,
        agents: new Map(),
      });
    }

    const supervisor = map.get(supervisorId);
    const agentId = row.agent_id || `AGENT_${row.id}`;

    if (!supervisor.agents.has(agentId)) {
      supervisor.agents.set(agentId, {
        id: agentId,
        name: row.agent_name || row.agent_login || "Unknown",
        total: 0,
        rows: [],
      });
    }

    const agent = supervisor.agents.get(agentId);
    agent.rows.push(row);

    if (row.status === "ACTIVE") {
      const amount = Number(row.amount || 0);
      agent.total += amount;
      supervisor.total += amount;
    }
  }

  return Array.from(map.values()).map((supervisor) => ({
    ...supervisor,
    agents: Array.from(supervisor.agents.values()),
  }));
}

export function renderSalesReportHtml({ date, generatedAt, rows }) {
  const groups = groupSales(rows || []);
  const grandTotal = groups.reduce((sum, group) => sum + group.total, 0);

  const body = groups
    .map((supervisor, supervisorIndex) => {
      const agentTables = supervisor.agents
        .map((agent, agentIndex) => {
          const shouldBreakPage = agentIndex > 0;
          const rowsHtml = agent.rows
            .map(
              (row, idx) => `
                <tr ${row.status !== "ACTIVE" ? 'style="text-decoration: line-through;"' : ""}>
                  <td>${idx + 1}</td>
                  <td>${escapeHtml(row.document_number)}</td>
                  <td>${escapeHtml(row.point_of_sale)}</td>
                  <td>${escapeHtml(row.comment)}</td>
                  <td>${row.form2 ? "✔" : ""}</td>
                  <td>${money(row.amount)}</td>
                </tr>
                ${row.status !== "ACTIVE" ? '<tr><td></td><td colspan="5" style="background: #fff3cd; color: #856404;">' + escapeHtml(row.change_comment) + "</td></tr>" : ""}
              `,
            )
            .join("");

          return `
            <div class="agent ${shouldBreakPage ? "page-break-before" : ""}">
              <div class="agent-title">${escapeHtml(agent.name)} - ${money(agent.total)}</div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Документ</th>
                    <th>ТТ</th>
                    <th>Коментар</th>
                    <th>Ф2</th>
                    <th>Сума</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
          `;
        })
        .join("");

      return `
        <section class="supervisor ${supervisorIndex > 0 ? "page-break-before" : ""}">
          <h2>${escapeHtml(supervisor.name)} - ${money(supervisor.total)}</h2>
          ${agentTables}
        </section>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html lang="uk">
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: Arial, sans-serif; color: #111; font-size: 12px; }
          h1 { margin: 0 0 4px 0; font-size: 18px; }
          .meta { margin-bottom: 12px; color: #444; }
          .total { margin: 8px 0 16px 0; font-size: 14px; font-weight: bold; }
          .supervisor { margin-bottom: 14px; }
          .supervisor h2 { margin: 0 0 8px 0; background: #eceff3; padding: 6px 8px; font-size: 14px; }
          .agent { margin-bottom: 10px; }
          .page-break-before { page-break-before: always; break-before: page; }
          .agent-title { margin: 0 0 6px 0; padding: 4px 8px; background: #f5f7fb; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
          th, td { border: 1px solid #d4d8e1; padding: 4px 6px; text-align: left; }
          th { background: #394156; color: #fff; }
          tbody tr:nth-child(even) td { background: #f8f9fc; }
        </style>
      </head>
      <body>
        <h1>Звіт з продажів</h1>
        <div class="meta">Дата звіту: ${escapeHtml(date)}</div>
        <div class="meta">Сформовано: ${escapeHtml(formatDateTime(generatedAt))}</div>
        <div class="total">Загальна сума: ${money(grandTotal)}</div>
        ${body || "<p>Дані відсутні.</p>"}
      </body>
    </html>
  `;
}
