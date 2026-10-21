// Entry point: connect to the database, then serve. Shuts down cleanly on SIGTERM (Docker, k8s).
const db = require('./db');
const config = require('./config');
const { createApp } = require('./app');

async function main() {
  await db.connect();
  const server = createApp().listen(config.port, () => {
    console.log(`${config.cafe.name} is open at ${config.publicUrl} (database: ${db.kind})`);
  });
  const shutdown = signal => {
    console.log(`${signal} received, closing.`);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(error => {
  console.error('Failed to start:', error);
  process.exit(1);
});
