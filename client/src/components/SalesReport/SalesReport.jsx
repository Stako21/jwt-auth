import { useContext, useEffect, useState } from "react";
import "./SalesReport.scss";
import { AuthContext } from "../../context/AuthContext";
import cn from "classnames";

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

  useEffect(() => {
    if (filteredReports.length > 0) {
      setLastUpdateTime(filteredReports[0].currentDate);
    }
  }, [setLastUpdateTime, filteredReports]);

  if (!actualAgent) return null;

  return (
    <div className={cn("salesReportWrapper", { ["open"]: isOpen })}>
      <h2>{actualAgent.currentAgent}</h2>
      <div className="wrapperTable">
        <div className="scrollContainer">
          <table className="table">
            <thead className="tableHeader">
              <tr>
                <th>№</th>
                <th>Номер</th>
                <th>Торгівельна точка</th>
                <th>Коментар</th>
                <th>Ф 2</th>
                <th>Сума</th>
              </tr>
            </thead>
            <tbody className="tableBody">
              {filteredReports.map((report, index) => (
                <tr key={report.id}>
                  <td>{index + 1}</td>
                  <td>{report.number}</td>
                  <td>{report.pointOfSale}</td>
                  <td>{report.comment}</td>
                  <td>
                    <i
                      className={cn(
                        "checkIcon",
                        report.form2 ? "fa-regular fa-check-circle" : ""
                      )}
                    ></i>
                    {report.form2}
                  </td>
                  <td>{formatedCurrency(report.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tableFooter">
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
    </div>
  );
};