import { loadConfig } from './config.js';
import { openDatabase, seed } from './db.js';
import { createApp } from './app.js';

const config = loadConfig();
const db = openDatabase(config.dbPath);
seed(db, config);

createApp({ db, config }).listen(config.port, () => {
  console.log(`API no ar:  http://localhost:${config.port}`);
  console.log(`Swagger:    http://localhost:${config.port}/docs`);
});
