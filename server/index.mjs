import { createApp } from './app.mjs';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT');
const app = createApp(process.env.BDON_DB_PATH ? { dbPath: process.env.BDON_DB_PATH } : {});
app.server.listen(port, '127.0.0.1', () => console.log(`BDON Record: http://127.0.0.1:${port}`));
app.server.on('error', error => { console.error(error.message); app.db.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
