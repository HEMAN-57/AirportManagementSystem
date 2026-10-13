# AirportManagementSystem (AMS)

A complete, production-grade Airport Management & Flight Operations web application built from scratch with **Node.js**, **Express**, **PostgreSQL**, and **Vanilla JS**. Designed for the DBMS Course-Based Project (CBP).

---

## 1. Project Structure

```
AirportManagementSystem/
│
├── docker-compose.yml       # 1-Command full stack orchestration (PostgreSQL + App)
├── Dockerfile               # Node 20 Alpine production container definition
├── .dockerignore            # Excludes local node_modules, git, and temporary files
│
├── backend/
│   ├── server.js
│   ├── db.js
│   ├── init-db.js
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   ├── middleware/
│   │   └── auth.js
│   └── routes/
│       ├── auth.js
│       ├── flights.js
│       ├── bookings.js
│       ├── baggage.js
│       ├── airports.js
│       └── crew.js
│
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html
│   ├── flight.html
│   ├── mybookings.html
│   ├── baggage.html
│   ├── style.css
│   └── script.js
│
├── database/
│   └── schema.sql
│
└── README.md
```

---

## 2. ⚡ 1-Command Docker Deployment (Recommended)

The entire application (PostgreSQL 16 database, automated schema initialization, and Node.js web server) can be launched with a single Docker command:

### 1. Start Containers
From the `AirportManagementSystem` directory:
```bash
docker compose up --build
```
*(Or in background detached mode: `docker compose up --build -d`)*

### 2. Access the Application
Open your browser at:
👉 **`http://localhost:5001/index.html`**

- PostgreSQL starts with a persistent Docker volume (`ams_pgdata`).
- `database/schema.sql` is automatically mounted into `/docker-entrypoint-initdb.d/01-init.sql`, pre-populating all tables, views, triggers, and demo data on first boot.
- The Node.js container waits for PostgreSQL to become fully healthy before launching.

### 3. Stop Containers
```bash
docker compose down
```
To stop and clear the database data volume for a fresh reset:
```bash
docker compose down -v
```

---

## 3. Manual Local Setup (Without Docker)

1. Open PostgreSQL (e.g., pgAdmin, `psql` command line, or terminal).
2. Create the database named `airport_management_system`:
   ```sql
   CREATE DATABASE airport_management_system;
   ```
3. Connect to the database and execute the complete schema and seed data from `database/schema.sql`:
   ```bash
   psql -U postgres -d airport_management_system -f database/schema.sql
   ```
   *(Or on macOS Homebrew: `psql -U himanshu -d airport_management_system -f database/schema.sql`)*

This creates all 13 core relational tables, foreign key cascades, triggers (automatic excess baggage tariff calculation), views (`vw_live_flight_board`), and pre-populates airports, airlines, aircraft, daily flight logs, crew, passengers, tickets, and baggage tags.

---

## 4. Backend Setup Instructions

1. Navigate to the `backend` folder:
   ```bash
   cd AirportManagementSystem/backend
   ```
2. Verify or update the database credentials in `.env` (a `.env.example` is also provided):
   ```env
   DB_USER=postgres
   DB_HOST=localhost
   DB_NAME=airport_management_system
   DB_PASSWORD=YOUR_PASSWORD
   DB_PORT=5432
   JWT_SECRET=supersecret_ams_jwt_key_2026
   PORT=5001
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   node server.js
   ```
   *(The server will start on `http://localhost:5001`)*

---

## 5. How to Run the Frontend

1. Ensure the backend server is running on port `5001`.
2. The backend serves the frontend statically, so you can simply open:
   ```
   http://localhost:5001/index.html
   ```
3. Alternatively, you can open `frontend/index.html` directly in your browser or serve it using VS Code "Live Server" or `npx serve frontend`.
4. If not logged in, `index.html` automatically routes you to `login.html`.

---

## 6. Explanation: Frontend → Backend → PostgreSQL

1. **Frontend**:
   - The user interacts with the Flight Information Display System (FIDS), books a flight, checks in online, or enters a luggage tag.
   - The JavaScript (`script.js`) intercepts the action and dispatches an asynchronous HTTP request using `fetch()` to `http://localhost:5001/api`.
   - Protected endpoints send the user's JWT in the `Authorization: Bearer <token>` header.
2. **Backend**:
   - The Express server receives the request on `server.js`.
   - Requests to protected routes pass through `middleware/auth.js`, which cryptographically verifies the JSON Web Token.
   - The route handler (e.g., `routes/flights.js`, `routes/bookings.js`, `routes/baggage.js`) validates business parameters.
3. **Database (PostgreSQL)**:
   - The route executes parameterized SQL queries through `db.js` using the connection pool (`pg`).
   - Business rules and constraints are enforced at the database layer (e.g., preventing double-booking via `UQ_Flight_Seat`, and automated excess luggage surcharge calculation via PL/pgSQL trigger `trg_baggage_excess_calc`).
4. **Response**:
   - PostgreSQL returns the tabular results to Node.js.
   - Node.js formats the payload into clean JSON and returns it with standard HTTP status codes (`200`, `201`, `400`, `404`).
5. **UI Update**:
   - The frontend JavaScript dynamically renders the live FIDS table, updates operational KPI metrics, generates official digital boarding passes, or plots multi-stage baggage progress steps.

---

## 7. List of API Endpoints

### 🔐 Auth (`/api/auth`)
- `POST /api/auth/register`: Register user (Passenger or Staff) & provision profile
- `POST /api/auth/login`: Authenticate credentials & receive JWT token
- `GET /api/auth/me`: Get current authenticated user and passenger details

### 🛫 Flights (`/api/flights`)
- `GET /api/flights`: Fetch all active flights with filters (`?type=departures|arrivals`, `?query=...`)
- `GET /api/flights/:id`: Get flight details, aircraft specs, gate, seat occupancy, and crew roster
- `PATCH /api/flights/:id/status`: Update flight operational status, assigned gate, delay minutes, and reason (Staff role)

### 🎟️ Bookings & Tickets (`/api/bookings`)
- `GET /api/bookings/my`: List all tickets and flight reservations for the logged-in user
- `POST /api/bookings`: Reserve a seat on a flight (assigns seat, generates PNR & ticket number)
- `POST /api/bookings/:id/checkin`: Perform online check-in & issue electronic boarding pass
- `GET /api/bookings/:id/boarding-pass`: Retrieve formatted digital boarding pass
- `DELETE /api/bookings/:id`: Cancel ticket reservation

### 🧳 Baggage Logistics (`/api/baggage`)
- `GET /api/baggage/track/:query`: Track luggage by 10-digit Bag Tag (e.g. `BAG-90214`) or 6-char PNR (e.g. `AMS8X1`)
- `POST /api/baggage/checkin`: Register checked luggage (database trigger calculates excess surcharge)
- `PATCH /api/baggage/:id/status`: Update baggage logistics stage (Staff role)

### 🏢 Airport Operations (`/api/airports`)
- `GET /api/airports`: List all master airports (BOM, DEL, DXB, LHR, SIN)
- `GET /api/airports/stats`: Operational KPI summary (Total Flights, On-Time %, Gates, Baggage in transit)
- `GET /api/airports/:id/gates`: Get gates and occupancy status for an airport

### 👨‍✈️ Crew Management (`/api/crew`)
- `GET /api/crew`: List all crew members (Pilots, First Officers, Cabin Leads)
- `GET /api/crew/flight/:flightLogId`: Get assigned crew roster for a specific flight

---

## 8. Pre-Seeded Demo Accounts for Testing

| Role | Email | Password | Features Accessible |
|------|-------|----------|---------------------|
| **Passenger** | `passenger@ams.com` | `password123` | FIDS radar, Flight booking, Web Check-in, Boarding Passes, Baggage Drop |
| **Airport Ops Staff** | `staff@ams.com` | `password123` | Flight telemetry control, Gate assignment, Baggage ramp dispatch |
| **Administrator** | `admin@ams.com` | `password123` | Full administrative control & operational management |

*(Quick 1-Click Login buttons for both Passenger and Staff are also available right on `login.html`)*
