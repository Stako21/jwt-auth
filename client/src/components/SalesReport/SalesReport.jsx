import { useContext, useEffect, useState } from "react";
import style from "./SalesReport.module.scss";
import { AuthContext } from "../../context/AuthContext";
import cn from "classnames";
import ScrollToTopButton from "../ScrollToTopButton/ScrollToTopButton";

export const SalesReport = ({ isOpen, setLastUpdateTime }) => {
  const { userInfo } = useContext(AuthContext);

  const [salesAgents, setSalesAgents] = useState([]);
  const [salesReports, setSalesReports] = useState([]);

  useEffect(() => {
    fetch("/Sorce/SalesAgent.json")
      .then((res) => res.json())
      .then((data) => setSalesAgents(data));
    fetch("/Sorce/SalesReport.json")
      .then((res) => res.json())
      .then((data) => setSalesReports(data));
  }, []);

  const actualAgent = salesAgents.find(
    (agent) => agent.login === userInfo.userName
  );

  const filteredReports = salesReports.filter(
    (report) => actualAgent && report.salesAgent === actualAgent.currentAgent
  );

  function formatedCurrency(amount) {
    return new Intl.NumberFormat("uk-UA", {
      style: "currency",
      currency: "UAH",
    }).format(amount);
  }

  function formatNumber(num) {
  const prefix = num.slice(0, 2);
  const digits = num.slice(2).replace(/^0+/, "");
  
    return `${prefix}...${digits}`;
}

  useEffect(() => {
    if (filteredReports.length > 0) {
      setLastUpdateTime(filteredReports[0].currentDate);
    }
  }, [setLastUpdateTime, filteredReports]);

  if (!actualAgent) return null;

  return (
    <div className={cn("salesReportWrapper", { ["open"]: isOpen })}>
      <h2 className={style.agentName}>{actualAgent.currentAgent}</h2>
      <div className={style.wrapperTable}>
        <div className={style.scrollContainer}>
          <table className={`table ${style.salesTable}`}>
            <thead className={style.tableHeader}>
              <tr>
                <th>№</th>
                <th>Номер</th>
                <th>Торгівельна точка</th>
                <th>Коментар</th>
                <th>Ф 2</th>
                <th>Сума</th>
              </tr>
            </thead>
            <tbody className={style.tableBody}>
              {filteredReports.map((report, index) => (
                <tr key={report.id}>
                  <td>{index + 1}</td>
                  <td>{formatNumber(report.number)}</td>
                  <td>{report.pointOfSale}</td>
                  <td>{report.comment}</td>
                  <td>
                    <i
                      className={cn(
                        style.checkIcon,
                        report.form2 ? "fa-regular fa-check-circle" : ""
                      )}
                    ></i>
                    {report.form2}
                  </td>
                  <td>{formatedCurrency(report.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className={style.tableFooter}>
              <tr>
                <td colSpan="5">Всього:</td>
                <td>
                  {formatedCurrency(
                    filteredReports.reduce(
                      (sum, report) => sum + report.amount,
                      0
                    )
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <ScrollToTopButton />
    </div>
  );
};
