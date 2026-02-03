import cron from 'node-cron';
import { loadSalesAgents } from './loadAgents.js';
import { loadSalesReports } from './LoadReports.js';
import { loadProducts } from './loadProducts.js';
import { loadTradePoints } from './loadTradePoints.js';
import { retryFailedNotifications } from './notify.retry.service.js';

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


// каждые 2 часа 2 * 60 * 60 * 1000
setInterval(() => {
  console.log('Проверка Product.json');
  loadProducts();
}, 60 * 1000);

// каждые 2 часа (можно со сдвигом)
setInterval(() => {
  console.log('Проверка TradePoint.json');
  loadTradePoints();
}, 60 * 1000);

cron.schedule('*/5 * * * *', async () => {
  console.log('Запуск повторных попыток уведомлений');
  retryFailedNotifications();
});