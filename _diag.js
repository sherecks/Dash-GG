import { db } from './server/db.js';
const tables = await db`select table_schema, table_name from information_schema.tables
  where table_name in ('cards','groups') order by table_schema, table_name`;
console.log('Tabelas encontradas:');
for (const t of tables) console.log(`  ${t.table_schema}.${t.table_name}`);

const cols = await db`select table_name, column_name, data_type from information_schema.columns
  where table_name in ('cards','groups') and table_schema='public' order by table_name, ordinal_position`;
console.log('\nColunas (public):');
for (const c of cols) console.log(`  ${c.table_name}.${c.column_name} : ${c.data_type}`);
process.exit(0);
