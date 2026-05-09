import React, { useEffect, useMemo, useState } from "react";
import cn from "classnames";
import style from "./ReportRomashka.module.scss";
import { fetchStaticReport } from "../../services/reports.api";

export const ReportRomashka = ({ isOpen, setLastUpdateTime }) => {
  const [romashkaReports, setRomashkaReports] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    fetchStaticReport("report-romashka").then((data) =>
      setRomashkaReports(data || []),
    );
  }, []);

  useEffect(() => {
    if (romashkaReports.length > 0) {
      setLastUpdateTime(romashkaReports[0].updated);
    }
  }, [setLastUpdateTime, romashkaReports]);

  function userPersentCell(a, b, per = true) {
    if (b === 0 || a === 0) return "";

    if (!per) return (a / b).toFixed(2);
    const persent = (a / b) * 100;
    return persent.toFixed(2) + "%";
  }

  const grouped = useMemo(() => {
    const result = {};
    for (const r of romashkaReports) {
      const key = r.supervisor || "Без супервайзера";
      if (!result[key]) {
        result[key] = {
          agents: [],
          total: {
            accounting: 0,
            tt: 0,
            ttshvk: 0,
            ttromashka: 0,
            weightromashka: 0,
          },
        };
      }
      result[key].agents.push(r);
      result[key].total.accounting += r.accounting || 0;
      result[key].total.tt += r.tt || 0;
      result[key].total.ttshvk += r.ttshvk || 0;
      result[key].total.ttromashka += r.ttromashka || 0;
      result[key].total.weightromashka += r.weightromashka || 0;
    }
    return result;
  }, [romashkaReports]);

  // переключение полноэкранного режима
  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  return (
    <div>
      {/* Кнопка для мобильных устройств */}

      <h2 className={style.title}>Продажі Ромашка</h2>

      <div
        className={cn(style.wrapperTable, { [style.fullscreen]: isFullscreen })}
      >
        <button className={style.fullscreenToggle} onClick={toggleFullscreen}>
          <i
            className={
              isFullscreen ? "fa-solid fa-compress" : "fa-solid fa-expand"
            }
          ></i>
        </button>
        <div className={style.scrollContainer}>
          <table className={style.table}>
            <thead className={style.tableHeader}>
              <tr>
                <th>Супервайзер / Торговий агент</th>
                <th>Учет с НДС</th>
                <th>ТТ</th>
                <th>ТТ ШВК, Сахаристые</th>
                <th>ТТ Ромашка</th>
                <th>Вес Ромашка</th>
                <th>Д Ромашка</th>
                <th>Ромашка на 1 ТТ</th>
              </tr>
            </thead>

            <tbody className={style.tableBody}>
              {Object.entries(grouped).map(
                ([supervisor, { agents, total }]) => (
                  <React.Fragment key={supervisor}>
                    {/* строка супервайзера с итогами */}
                    <tr
                      className={style.groupRow}
                      style={{ ontWeight: "bold" }}
                    >
                      <td>{supervisor}</td>
                      <td>{total.accounting}</td>
                      <td>{total.tt}</td>
                      <td>{total.ttshvk || ""}</td>
                      <td>{total.ttromashka || ""}</td>
                      <td>{total.weightromashka || ""}</td>
                      <td>
                        {userPersentCell(total.ttromashka, total.ttshvk, true)}
                      </td>
                      <td>
                        {userPersentCell(
                          total.weightromashka,
                          total.ttshvk,
                          false
                        )}
                      </td>
                    </tr>

                    {/* строки агентов */}
                    {agents.map((report) => (
                      <tr key={report.id}>
                        <td style={{ paddingLeft: "20px" }}>
                          {report.salesagent}
                        </td>
                        <td>{report.accounting}</td>
                        <td>{report.tt}</td>
                        <td>{report.ttshvk === 0 ? "" : report.ttshvk}</td>
                        <td>
                          {report.ttromashka === 0 ? "" : report.ttromashka}
                        </td>
                        <td>
                          {report.weightromashka === 0
                            ? ""
                            : report.weightromashka}
                        </td>
                        <td>
                          {userPersentCell(
                            report.ttromashka,
                            report.ttshvk,
                            true
                          )}
                        </td>
                        <td>
                          {userPersentCell(
                            report.weightromashka,
                            report.ttshvk,
                            false
                          )}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
