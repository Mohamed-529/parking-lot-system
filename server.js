const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const dbPath = path.join(__dirname, 'parking.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Database error:', err);
  else console.log('Connected to SQLite database');
});

// Initialize database tables
db.serialize(() => {
  // Parking slots table
  db.run(`
    CREATE TABLE IF NOT EXISTS parking_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      is_occupied BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Parking records table
  db.run(`
    CREATE TABLE IF NOT EXISTS parking_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT UNIQUE NOT NULL,
      vehicle_number TEXT NOT NULL,
      vehicle_type TEXT NOT NULL,
      slot_id INTEGER NOT NULL,
      entry_time DATETIME NOT NULL,
      exit_time DATETIME,
      charge REAL,
      status TEXT DEFAULT 'parked',
      FOREIGN KEY(slot_id) REFERENCES parking_slots(id)
    )
  `);

  // Initialize slots if empty
  db.get("SELECT COUNT(*) as count FROM parking_slots", (err, row) => {
    if (row.count === 0) {
      const slots = [
        ...Array(5).fill('bike'),
        ...Array(5).fill('car'),
        ...Array(2).fill('truck')
      ];
      
      const stmt = db.prepare("INSERT INTO parking_slots (type) VALUES (?)");
      slots.forEach(type => stmt.run(type));
      stmt.finalize();
      console.log('Parking slots initialized');
    }
  });
});

// Pricing function
const calculateCharge = (entryTime, exitTime) => {
  const hoursStayed = (new Date(exitTime) - new Date(entryTime)) / (1000 * 60 * 60);
  
  if (hoursStayed <= 3) return 30;
  if (hoursStayed <= 6) return 85;
  return 120;
};

// Generate unique ticket ID
const generateTicketId = () => {
  return 'TKT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
};

// Routes

// Get available slots
app.get('/api/slots', (req, res) => {
  db.all(
    `SELECT type, COUNT(*) as total, SUM(CASE WHEN is_occupied = 0 THEN 1 ELSE 0 END) as available
     FROM parking_slots
     GROUP BY type`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const slotStatus = {};
      rows.forEach(row => {
        slotStatus[row.type] = {
          total: row.total,
          available: row.available,
          occupied: row.total - row.available
        };
      });
      
      res.json(slotStatus);
    }
  );
});

// Park a vehicle
app.post('/api/park', (req, res) => {
  const { vehicleNumber, vehicleType } = req.body;

  if (!vehicleNumber || !vehicleType) {
    return res.status(400).json({ error: 'Vehicle number and type required' });
  }

  if (!['bike', 'car', 'truck'].includes(vehicleType.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid vehicle type' });
  }

  // Find available slot
  db.get(
    `SELECT id FROM parking_slots WHERE type = ? AND is_occupied = 0 LIMIT 1`,
    [vehicleType.toLowerCase()],
    (err, slot) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (!slot) {
        return res.status(400).json({ 
          success: false,
          message: `Parking Full - No ${vehicleType} slots available` 
        });
      }

      const ticketId = generateTicketId();
      const entryTime = new Date().toISOString();
      console.log("ENTRY TIME:", entryTime);

      // Insert parking record
      db.run(
        `INSERT INTO parking_records (ticket_id, vehicle_number, vehicle_type, slot_id, entry_time, status)
         VALUES (?, ?, ?, ?, ?, 'parked')`,
        [ticketId, vehicleNumber, vehicleType.toLowerCase(), slot.id,entryTime],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });

          // Mark slot as occupied
          db.run(
            `UPDATE parking_slots SET is_occupied = 1 WHERE id = ?`,
            [slot.id],
            (err) => {
              if (err) return res.status(500).json({ error: err.message });
              
              res.json({
                success: true,
                ticketId,
                vehicleNumber,
                vehicleType: vehicleType.toLowerCase(),
                entryTime,
                message: 'Vehicle parked successfully'
              });
            }
          );
        }
      );
    }
  );
});

// Exit a vehicle
app.post('/api/exit', (req, res) => {
  const { ticketId } = req.body;

  if (!ticketId) {
    return res.status(400).json({ error: 'Ticket ID required' });
  }

  // Find parking record
  db.get(
    `SELECT * FROM parking_records WHERE ticket_id = ? AND status = 'parked'`,
    [ticketId],
    (err, record) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (!record) {
        return res.status(404).json({ error: 'Invalid ticket or vehicle already exited' });
      }

      const exitTime = new Date().toISOString();
      const charge = calculateCharge(record.entry_time, exitTime);
      const hoursStayed = ((new Date(exitTime) - new Date(record.entry_time)) / (1000 * 60 * 60)).toFixed(2);

      // Update parking record
      db.run(
        `UPDATE parking_records SET exit_time = ?, charge = ?, status = 'exited' WHERE ticket_id = ?`,
        [exitTime, charge, ticketId],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });

          // Free up the slot
          db.run(
            `UPDATE parking_slots SET is_occupied = 0 WHERE id = ?`,
            [record.slot_id],
            (err) => {
              if (err) return res.status(500).json({ error: err.message });
              
              res.json({
                success: true,
                ticketId,
                vehicleNumber: record.vehicle_number,
                vehicleType: record.vehicle_type,
                entryTime: record.entry_time,
                exitTime,
                hoursStayed,
                charge,
                message: `Vehicle exited successfully. Charge: ₹${charge}`
              });
            }
          );
        }
      );
    }
  );
});

// Get all parking records
app.get('/api/records', (req, res) => {
  db.all(
    `SELECT * FROM parking_records ORDER BY entry_time DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Get parked vehicles
app.get('/api/parked', (req, res) => {
  db.all(
    `SELECT ticket_id, vehicle_number, vehicle_type, entry_time,
            ROUND((julianday('now') - julianday(entry_time)) * 24, 2) as hours_parked
     FROM parking_records 
     WHERE status = 'parked'
     ORDER BY entry_time DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Parking Lot System is running' });
});

app.listen(PORT, () => {
  console.log(`🚗 Parking Lot Backend running on http://localhost:${PORT}`);
});
