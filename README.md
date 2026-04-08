# 🅿️ Parking Lot Management System

This is a simple full-stack project I built to understand how real-world systems like parking management work.  
It allows users to park vehicles, generate tickets, track availability, and calculate charges based on time.

---

## 🚀 What this project does

- Park vehicles (Bike, Car, Truck)
- Generate a unique ticket for each vehicle
- Track available and occupied slots
- Calculate parking charges based on time spent
- Exit vehicles and free slots
- View currently parked vehicles

---

## 💡 How it works

When a vehicle enters:
- System checks if a slot is available
- Assigns a slot
- Generates a ticket ID
- Stores entry time

When exiting:
- Calculates total time parked
- Applies pricing
- Frees the slot

---

## 💰 Pricing Logic

- Up to 3 hours → ₹30  
- 3 to 6 hours → ₹85  
- More than 6 hours → ₹120  

---

## 🛠️ Tech Stack

- **Frontend**: React  
- **Backend**: Node.js + Express  
- **Database**: SQLite  

---

## 📡 API Endpoints

- `GET /api/slots` → Get available slots  
- `POST /api/park` → Park a vehicle  
- `POST /api/exit` → Exit vehicle  
- `GET /api/parked` → Currently parked vehicles  
- `GET /api/records` → All records  

---


---

## ▶️ How to run locally

### Backend

```bash
cd backend
npm install
node server.js


### Frontend 

```bash
cd frontend
npm install
npm start