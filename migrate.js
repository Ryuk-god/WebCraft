const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// This async function will perform the database migration
async function runMigration() {
    console.log("🚀 Starting database migration...");

    try {
        // 1. Open a connection to your existing database file
        const db = await open({
            filename: path.join(__dirname, 'splitit.db'),
            driver: sqlite3.Database
        });

        console.log("✅ Database connected.");

        // 2. Add the 'currency_key' column to the 'groups' table
        // We use a try-catch block in case the column already exists
        try {
            await db.exec(`
                ALTER TABLE groups ADD COLUMN currency_key TEXT NOT NULL DEFAULT 'USD'
            `);
            console.log("✅ 'groups' table updated with 'currency_key'.");
        } catch (e) {
            if (e.message.includes("duplicate column name")) {
                console.log("🟡 'currency_key' column already exists. Skipping.");
            } else {
                throw e; // Re-throw other errors
            }
        }
        
        // 3. Create all the new tables required by the advanced application
        await db.exec(`CREATE TABLE IF NOT EXISTS group_members (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER, name TEXT NOT NULL, FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE, UNIQUE(group_id, name))`);
        console.log("✅ 'group_members' table created.");

        await db.exec(`CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER, description TEXT NOT NULL, total_amount REAL NOT NULL, FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE)`);
        console.log("✅ 'expenses' table created.");
        
        await db.exec(`CREATE TABLE IF NOT EXISTS expense_payers (id INTEGER PRIMARY KEY AUTOINCREMENT, expense_id INTEGER, member_name TEXT NOT NULL, amount REAL NOT NULL, FOREIGN KEY (expense_id) REFERENCES expenses (id) ON DELETE CASCADE)`);
        console.log("✅ 'expense_payers' table created.");
        
        await db.exec(`CREATE TABLE IF NOT EXISTS expense_shares (id INTEGER PRIMARY KEY AUTOINCREMENT, expense_id INTEGER, member_name TEXT NOT NULL, share_amount REAL NOT NULL, FOREIGN KEY (expense_id) REFERENCES expenses (id) ON DELETE CASCADE)`);
        console.log("✅ 'expense_shares' table created.");
        
        await db.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER, from_member TEXT NOT NULL, to_member TEXT NOT NULL, amount REAL NOT NULL, FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE)`);
        console.log("✅ 'payments' table created.");

        await db.close();
        console.log("\n🎉 Migration complete! Your database is now ready for the new application.");

    } catch (error) {
        console.error("❌ Migration failed:", error.message);
    }
}

// Run the function
runMigration();