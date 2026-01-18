import cron from 'node-cron';
import { loadSalesAgents } from './loadAgents.js';
import { loadSalesReports } from './LoadReports.js';

// 1️⃣ Обновление SalesAgent раз в сутки в 8:00
// cron.schedule('0 8 * * *', () => {
//   console.log('Запуск обновления SalesAgent.json');
//   loadSalesAgents();
// });

setInterval(() => {
  console.log('Запуск обновления SalesAgent.json');
  loadSalesAgents();
}, 2 * 60 * 60 * 1000)


// 2️⃣ Проверка SalesReport.json каждые 30 секунд
setInterval(() => {
  console.log('Проверка SalesReport.json');
  loadSalesReports();
}, 30 * 1000);
