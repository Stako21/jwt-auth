import axios from "axios";
import { useContext, useEffect, useState } from "react";
import "./SalesReport.scss";
import config from "../../config";
import { AuthContext } from "../../context/AuthContext";
import SalesAgent from "../../../public/Sorce/SalesAgent.json";
import SalesReports from "../../../public/Sorce/SalesReport.json";
import cn from "classnames";

export const SalesReport = ({ isOpen, setLastUpdateTime }) => {
  const { userInfo } = useContext(AuthContext);

  const actualAgent = SalesAgent.find(
    (agent) => agent.login === userInfo.userName
  );

  const filteredReports = [...SalesReports].filter(
    (report) => report.salesAgent === actualAgent.currentAgent
  );

  function formatedCurrency(amount) {
    return new Intl.NumberFormat("uk-UA", {
      style: "currency",
      currency: "UAH",
    }).format(amount);
  }

  useEffect(() => {
    setLastUpdateTime(filteredReports[0].currentDate);
  }), [setLastUpdateTime, filteredReports];

  return (
    <div className={cn("salesReportWrapper", { ["open"]: isOpen })}>
      <h2>{actualAgent.currentAgent}</h2>
      {/* <p>Оновлено: {filteredReports[0].currentDate}</p> */}
      <div className="wrapperTable">
        <div className="scrollContainer">
          <table className="table">
            <thead className="tableHeader">
              <tr>
                <th>№</th>
                {/* <th>Дата</th> */}
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
                  {/* <td>{new Date(report.date).toLocaleString()}</td> */}
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
