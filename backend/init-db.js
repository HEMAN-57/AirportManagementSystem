const fs = require('fs');
const path = require('path');
const db = require('./db');

async function initializeDatabase() {
  console.log('🔄 Initializing Airport Management System Database...');
  
  const schemaPath = path.join(__dirname, '../database/schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ schema.sql not found at ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  try {
    await db.query(sql);
    console.log('✅ PostgreSQL Schema and Seed Data executed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error executing database schema:', err);
    process.exit(1);
  }
}

initializeDatabase();
