-- ============================================================================
-- AIRPORT MANAGEMENT SYSTEM (AMS) - PRODUCTION RELATIONAL DATABASE SCHEMA
-- Dialect: PostgreSQL 16+ Compatible (ANSI SQL Compliant)
-- Designed for DBMS Course-Based Project (CBP)
-- ============================================================================

-- Drop existing tables in reverse dependency order if re-initializing
DROP TABLE IF EXISTS flight_crew_assignments CASCADE;
DROP TABLE IF EXISTS crew_staff CASCADE;
DROP TABLE IF EXISTS baggage CASCADE;
DROP TABLE IF EXISTS boarding_passes CASCADE;
DROP TABLE IF EXISTS bookings_tickets CASCADE;
DROP TABLE IF EXISTS passengers CASCADE;
DROP TABLE IF EXISTS flight_schedules_log CASCADE;
DROP TABLE IF EXISTS flights CASCADE;
DROP TABLE IF EXISTS aircraft CASCADE;
DROP TABLE IF EXISTS airlines CASCADE;
DROP TABLE IF EXISTS terminals_gates CASCADE;
DROP TABLE IF EXISTS airports CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. USERS TABLE (Authentication & Role Management)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'passenger' CHECK (role IN ('passenger', 'staff', 'admin')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. AIRPORTS MASTER TABLE
CREATE TABLE airports (
    airport_id SERIAL PRIMARY KEY,
    iata_code CHAR(3) NOT NULL UNIQUE,
    icao_code CHAR(4) NOT NULL UNIQUE,
    airport_name VARCHAR(120) NOT NULL,
    city VARCHAR(60) NOT NULL,
    country VARCHAR(60) NOT NULL,
    timezone VARCHAR(40) NOT NULL DEFAULT 'UTC',
    terminals_count SMALLINT NOT NULL CHECK (terminals_count > 0)
);

-- 3. TERMINALS AND GATES
CREATE TABLE terminals_gates (
    gate_id SERIAL PRIMARY KEY,
    airport_id INT NOT NULL REFERENCES airports(airport_id) ON DELETE CASCADE,
    terminal_code VARCHAR(10) NOT NULL DEFAULT 'T1',
    gate_number VARCHAR(10) NOT NULL,
    gate_type VARCHAR(20) NOT NULL CHECK (gate_type IN ('DOMESTIC', 'INTL', 'SWING')),
    max_aircraft_size VARCHAR(10) NOT NULL CHECK (max_aircraft_size IN ('CODE_C', 'CODE_D', 'CODE_E', 'CODE_F')),
    gate_status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (gate_status IN ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE')),
    CONSTRAINT uq_airport_gate UNIQUE (airport_id, terminal_code, gate_number)
);

-- 4. AIRLINES REGISTRY
CREATE TABLE airlines (
    airline_id SERIAL PRIMARY KEY,
    iata_code CHAR(2) NOT NULL UNIQUE,
    icao_code CHAR(3) NOT NULL UNIQUE,
    airline_name VARCHAR(100) NOT NULL,
    country_origin VARCHAR(60) NOT NULL,
    contact_email VARCHAR(100) NOT NULL,
    support_hotline VARCHAR(25) NOT NULL
);

-- 5. AIRCRAFT FLEET
CREATE TABLE aircraft (
    aircraft_id SERIAL PRIMARY KEY,
    airline_id INT NOT NULL REFERENCES airlines(airline_id) ON DELETE CASCADE,
    tail_number VARCHAR(15) NOT NULL UNIQUE,
    model VARCHAR(50) NOT NULL,
    manufacturer VARCHAR(50) NOT NULL,
    total_seats SMALLINT NOT NULL CHECK (total_seats > 0),
    manufacture_year SMALLINT NOT NULL CHECK (manufacture_year >= 1990),
    aircraft_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (aircraft_status IN ('ACTIVE', 'MAINTENANCE', 'GROUNDED'))
);

-- 6. MASTER FLIGHT SCHEDULES
CREATE TABLE flights (
    flight_id SERIAL PRIMARY KEY,
    airline_id INT NOT NULL REFERENCES airlines(airline_id) ON DELETE CASCADE,
    flight_number VARCHAR(10) NOT NULL,
    origin_airport_id INT NOT NULL REFERENCES airports(airport_id),
    destination_airport_id INT NOT NULL REFERENCES airports(airport_id),
    scheduled_departure TIME NOT NULL,
    scheduled_arrival TIME NOT NULL,
    days_of_operation VARCHAR(20) NOT NULL DEFAULT 'DAILY',
    base_price DECIMAL(10,2) NOT NULL DEFAULT 5000.00 CHECK (base_price > 0),
    CONSTRAINT uq_airline_flightno UNIQUE (airline_id, flight_number),
    CONSTRAINT chk_diff_airports CHECK (origin_airport_id <> destination_airport_id)
);

-- 7. DAILY FLIGHT OPERATIONAL LOG (AODB - Airport Operational Database)
CREATE TABLE flight_schedules_log (
    log_id BIGSERIAL PRIMARY KEY,
    flight_id INT NOT NULL REFERENCES flights(flight_id) ON DELETE CASCADE,
    flight_date DATE NOT NULL DEFAULT CURRENT_DATE,
    aircraft_id INT NOT NULL REFERENCES aircraft(aircraft_id),
    gate_id INT REFERENCES terminals_gates(gate_id),
    runway_id VARCHAR(10) DEFAULT '27R',
    estimated_departure TIMESTAMP NOT NULL,
    actual_departure TIMESTAMP,
    estimated_arrival TIMESTAMP NOT NULL,
    actual_arrival TIMESTAMP,
    delay_minutes INT NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
    delay_reason VARCHAR(200),
    flight_status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' 
        CHECK (flight_status IN ('SCHEDULED', 'BOARDING', 'GATE_CLOSED', 'DEPARTED', 'AIRBORNE', 'LANDED', 'CANCELLED', 'DIVERTED')),
    CONSTRAINT uq_flight_date UNIQUE (flight_id, flight_date)
);

-- 8. PASSENGERS TABLE
CREATE TABLE passengers (
    passenger_id BIGSERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    passport_number VARCHAR(20) NOT NULL UNIQUE,
    nationality VARCHAR(50) NOT NULL DEFAULT 'Indian',
    date_of_birth DATE NOT NULL,
    gender CHAR(1) NOT NULL CHECK (gender IN ('M', 'F', 'O')),
    email VARCHAR(100) NOT NULL,
    phone_number VARCHAR(25) NOT NULL,
    frequent_flyer_number VARCHAR(30)
);

-- 9. BOOKINGS AND TICKETS
CREATE TABLE bookings_tickets (
    ticket_id BIGSERIAL PRIMARY KEY,
    ticket_number VARCHAR(20) NOT NULL UNIQUE,
    passenger_id BIGINT NOT NULL REFERENCES passengers(passenger_id) ON DELETE CASCADE,
    flight_log_id BIGINT NOT NULL REFERENCES flight_schedules_log(log_id) ON DELETE CASCADE,
    pnr VARCHAR(10) NOT NULL,
    booking_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fare_class VARCHAR(20) NOT NULL CHECK (fare_class IN ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST')),
    seat_number VARCHAR(5) NOT NULL,
    base_fare DECIMAL(10,2) NOT NULL CHECK (base_fare > 0),
    tax_and_surcharges DECIMAL(10,2) NOT NULL CHECK (tax_and_surcharges >= 0),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED' CHECK (payment_status IN ('CONFIRMED', 'PENDING', 'CANCELLED', 'REFUNDED')),
    CONSTRAINT uq_flight_seat UNIQUE (flight_log_id, seat_number) -- Zero double-booking invariant
);

-- 10. BOARDING PASSES (1:1 with Ticket)
CREATE TABLE boarding_passes (
    boarding_pass_id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL UNIQUE REFERENCES bookings_tickets(ticket_id) ON DELETE CASCADE,
    sequence_number INT NOT NULL,
    boarding_group VARCHAR(10) NOT NULL DEFAULT 'ZONE_3',
    issue_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    security_check_cleared BOOLEAN NOT NULL DEFAULT FALSE,
    boarding_status VARCHAR(20) NOT NULL DEFAULT 'ISSUED' CHECK (boarding_status IN ('ISSUED', 'SECURITY_CLEARED', 'BOARDED', 'NO_SHOW')),
    gate_scanned_at TIMESTAMP
);

-- 11. BAGGAGE LOGISTICS
CREATE TABLE baggage (
    baggage_id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES bookings_tickets(ticket_id) ON DELETE CASCADE,
    bag_tag_number VARCHAR(20) NOT NULL UNIQUE,
    weight_kg DECIMAL(5,2) NOT NULL CHECK (weight_kg > 0 AND weight_kg <= 50.00),
    allowed_weight_kg DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    excess_fee_paid DECIMAL(8,2) NOT NULL DEFAULT 0.00 CHECK (excess_fee_paid >= 0),
    security_scan_result VARCHAR(20) NOT NULL DEFAULT 'PASSED' CHECK (security_scan_result IN ('PENDING', 'PASSED', 'FLAGGED', 'CLEARED')),
    baggage_status VARCHAR(20) NOT NULL DEFAULT 'CHECKED_IN' 
        CHECK (baggage_status IN ('CHECKED_IN', 'SCREENED', 'SORTED', 'LOADED_ON_AIRCRAFT', 'TRANSIT', 'CLAIM_CAROUSEL', 'DELIVERED', 'LOST')),
    arrival_carousel VARCHAR(10)
);

-- 12. CREW AND STAFF
CREATE TABLE crew_staff (
    staff_id SERIAL PRIMARY KEY,
    airline_id INT REFERENCES airlines(airline_id) ON DELETE SET NULL,
    employee_code VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    staff_role VARCHAR(30) NOT NULL CHECK (staff_role IN ('CAPTAIN', 'FIRST_OFFICER', 'CABIN_LEAD', 'FLIGHT_ATTENDANT', 'GATE_AGENT', 'RAMP_AGENT', 'DUTY_MANAGER')),
    license_number VARCHAR(30) NOT NULL UNIQUE,
    duty_status VARCHAR(20) NOT NULL DEFAULT 'ON_DUTY' CHECK (duty_status IN ('ON_DUTY', 'OFF_DUTY', 'REST_PERIOD', 'LEAVE')),
    phone_number VARCHAR(25) NOT NULL
);

-- 13. FLIGHT CREW ROSTER ASSIGNMENTS
CREATE TABLE flight_crew_assignments (
    assignment_id BIGSERIAL PRIMARY KEY,
    flight_log_id BIGINT NOT NULL REFERENCES flight_schedules_log(log_id) ON DELETE CASCADE,
    staff_id INT NOT NULL REFERENCES crew_staff(staff_id) ON DELETE CASCADE,
    assigned_role VARCHAR(30) NOT NULL,
    shift_start_time TIMESTAMP NOT NULL,
    shift_end_time TIMESTAMP NOT NULL,
    CONSTRAINT uq_roster UNIQUE (flight_log_id, staff_id)
);

-- ============================================================================
-- DATABASE TRIGGERS & BUSINESS LOGIC FUNCTIONS
-- ============================================================================

-- Trigger 1: Excess Baggage Surcharge Automation (Tariff = ₹500 / $15 per kg)
CREATE OR REPLACE FUNCTION fn_calculate_baggage_excess_fee()
RETURNS TRIGGER AS $$
DECLARE
    excess_kg DECIMAL(5,2);
    tariff_rate DECIMAL(8,2) := 500.00;
BEGIN
    IF NEW.weight_kg > NEW.allowed_weight_kg THEN
        excess_kg := NEW.weight_kg - NEW.allowed_weight_kg;
        NEW.excess_fee_paid := excess_kg * tariff_rate;
    ELSE
        NEW.excess_fee_paid := 0.00;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_baggage_excess_calc
BEFORE INSERT OR UPDATE OF weight_kg, allowed_weight_kg ON baggage
FOR EACH ROW
EXECUTE FUNCTION fn_calculate_baggage_excess_fee();

-- ============================================================================
-- OPERATIONAL VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW vw_live_flight_board AS
SELECT 
    fsl.log_id,
    f.flight_id,
    f.flight_number,
    al.airline_name,
    al.iata_code AS airline_iata,
    orig.iata_code AS origin_iata,
    orig.city AS origin_city,
    dest.iata_code AS dest_iata,
    dest.city AS dest_city,
    f.scheduled_departure,
    f.scheduled_arrival,
    fsl.estimated_departure,
    fsl.estimated_arrival,
    fsl.actual_departure,
    fsl.actual_arrival,
    fsl.flight_date,
    fsl.delay_minutes,
    fsl.delay_reason,
    fsl.flight_status,
    tg.terminal_code,
    tg.gate_number,
    ac.tail_number,
    ac.model AS aircraft_model,
    f.base_price
FROM flight_schedules_log fsl
JOIN flights f ON fsl.flight_id = f.flight_id
JOIN airlines al ON f.airline_id = al.airline_id
JOIN airports orig ON f.origin_airport_id = orig.airport_id
JOIN airports dest ON f.destination_airport_id = dest.airport_id
JOIN aircraft ac ON fsl.aircraft_id = ac.aircraft_id
LEFT JOIN terminals_gates tg ON fsl.gate_id = tg.gate_id
ORDER BY fsl.estimated_departure ASC;

-- ============================================================================
-- SEED DATA (PRODUCTION-GRADE DEMO DATASET)
-- ============================================================================

-- Seed Users (Bcrypt hash for 'password123': $2b$10$v7TVaM.VyMXJcV0IHgm8/e6VyaR3yDGCGZz2mI6z9/y5kEu/P2WoW)
INSERT INTO users (id, name, email, password_hash, role) VALUES
(1, 'Rahul Sharma', 'passenger@ams.com', '$2b$10$v7TVaM.VyMXJcV0IHgm8/e6VyaR3yDGCGZz2mI6z9/y5kEu/P2WoW', 'passenger'),
(2, 'Priya Nair', 'staff@ams.com', '$2b$10$v7TVaM.VyMXJcV0IHgm8/e6VyaR3yDGCGZz2mI6z9/y5kEu/P2WoW', 'staff'),
(3, 'Vikram Malhotra', 'admin@ams.com', '$2b$10$v7TVaM.VyMXJcV0IHgm8/e6VyaR3yDGCGZz2mI6z9/y5kEu/P2WoW', 'admin');

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- Seed Airports
INSERT INTO airports (airport_id, iata_code, icao_code, airport_name, city, country, timezone, terminals_count) VALUES
(1, 'BOM', 'VABB', 'Chhatrapati Shivaji Maharaj International Airport', 'Mumbai', 'India', 'Asia/Kolkata', 2),
(2, 'DEL', 'VIDP', 'Indira Gandhi International Airport', 'New Delhi', 'India', 'Asia/Kolkata', 3),
(3, 'DXB', 'OMDB', 'Dubai International Airport', 'Dubai', 'United Arab Emirates', 'Asia/Dubai', 3),
(4, 'LHR', 'EGLL', 'Heathrow Airport', 'London', 'United Kingdom', 'Europe/London', 5),
(5, 'SIN', 'WSSS', 'Singapore Changi Airport', 'Singapore', 'Singapore', 'Asia/Singapore', 4);

SELECT setval('airports_airport_id_seq', (SELECT MAX(airport_id) FROM airports));

-- Seed Airlines
INSERT INTO airlines (airline_id, iata_code, icao_code, airline_name, country_origin, contact_email, support_hotline) VALUES
(1, 'AI', 'AIC', 'Air India', 'India', 'ops@airindia.in', '+91-22-2568-1000'),
(2, '6E', 'IGO', 'IndiGo Airlines', 'India', 'dispatch@goindigo.in', '+91-124-617-3838'),
(3, 'EK', 'UAE', 'Emirates', 'United Arab Emirates', 'flightops@emirates.com', '+971-600-555555'),
(4, 'SQ', 'SIA', 'Singapore Airlines', 'Singapore', 'ops@singaporeair.com', '+65-6223-8888');

SELECT setval('airlines_airline_id_seq', (SELECT MAX(airline_id) FROM airlines));

-- Seed Terminals & Gates for BOM (Airport 1) and DEL (Airport 2)
INSERT INTO terminals_gates (gate_id, airport_id, terminal_code, gate_number, gate_type, max_aircraft_size, gate_status) VALUES
(1, 1, 'T2', 'Gate 41', 'INTL', 'CODE_E', 'OCCUPIED'),
(2, 1, 'T2', 'Gate 42', 'INTL', 'CODE_E', 'AVAILABLE'),
(3, 1, 'T2', 'Gate 43', 'DOMESTIC', 'CODE_C', 'OCCUPIED'),
(4, 1, 'T1', 'Gate 08', 'DOMESTIC', 'CODE_C', 'AVAILABLE'),
(5, 1, 'T1', 'Gate 09', 'DOMESTIC', 'CODE_C', 'AVAILABLE'),
(6, 2, 'T3', 'Gate 15', 'INTL', 'CODE_E', 'AVAILABLE'),
(7, 2, 'T3', 'Gate 16', 'DOMESTIC', 'CODE_C', 'AVAILABLE');

SELECT setval('terminals_gates_gate_id_seq', (SELECT MAX(gate_id) FROM terminals_gates));

-- Seed Aircraft Fleet
INSERT INTO aircraft (aircraft_id, airline_id, tail_number, model, manufacturer, total_seats, manufacture_year, aircraft_status) VALUES
(1, 1, 'VT-ALO', 'Boeing 777-300ER', 'Boeing', 342, 2018, 'ACTIVE'),
(2, 1, 'VT-EXF', 'Airbus A320neo', 'Airbus', 186, 2021, 'ACTIVE'),
(3, 2, 'VT-IMD', 'Airbus A321neo', 'Airbus', 232, 2022, 'ACTIVE'),
(4, 3, 'A6-EGA', 'Boeing 777-300ER', 'Boeing', 354, 2019, 'ACTIVE'),
(5, 4, '9V-SMG', 'Airbus A350-900', 'Airbus', 253, 2020, 'ACTIVE');

SELECT setval('aircraft_aircraft_id_seq', (SELECT MAX(aircraft_id) FROM aircraft));

-- Seed Master Flights Routes
INSERT INTO flights (flight_id, airline_id, flight_number, origin_airport_id, destination_airport_id, scheduled_departure, scheduled_arrival, days_of_operation, base_price) VALUES
(1, 1, 'AI-101', 1, 4, '02:30:00', '07:45:00', 'DAILY', 48500.00), -- Mumbai -> London
(2, 1, 'AI-678', 1, 2, '06:00:00', '08:15:00', 'DAILY', 5200.00),  -- Mumbai -> Delhi
(3, 2, '6E-204', 2, 1, '10:30:00', '12:45:00', 'DAILY', 4900.00),  -- Delhi -> Mumbai
(4, 3, 'EK-501', 1, 3, '04:15:00', '06:05:00', 'DAILY', 24500.00), -- Mumbai -> Dubai
(5, 4, 'SQ-421', 1, 5, '08:45:00', '16:50:00', 'DAILY', 31000.00), -- Mumbai -> Singapore
(6, 2, '6E-852', 1, 2, '14:20:00', '16:35:00', 'DAILY', 5400.00);  -- Mumbai -> Delhi

SELECT setval('flights_flight_id_seq', (SELECT MAX(flight_id) FROM flights));

-- Seed Daily Flight Operational Logs for Today
INSERT INTO flight_schedules_log (log_id, flight_id, flight_date, aircraft_id, gate_id, runway_id, estimated_departure, actual_departure, estimated_arrival, actual_arrival, delay_minutes, delay_reason, flight_status) VALUES
(1, 1, CURRENT_DATE, 1, 1, '27R', CURRENT_DATE + TIME '02:30:00', CURRENT_DATE + TIME '02:35:00', CURRENT_DATE + TIME '07:45:00', NULL, 5, 'ATC clearance sequencing', 'AIRBORNE'),
(2, 2, CURRENT_DATE, 2, 3, '27L', CURRENT_DATE + TIME '06:00:00', NULL, CURRENT_DATE + TIME '08:15:00', NULL, 0, NULL, 'BOARDING'),
(3, 3, CURRENT_DATE, 3, 4, '28',  CURRENT_DATE + TIME '10:30:00', NULL, CURRENT_DATE + TIME '12:45:00', NULL, 0, NULL, 'SCHEDULED'),
(4, 4, CURRENT_DATE, 4, 2, '27R', CURRENT_DATE + TIME '04:15:00', CURRENT_DATE + TIME '04:15:00', CURRENT_DATE + TIME '06:05:00', CURRENT_DATE + TIME '06:02:00', 0, NULL, 'LANDED'),
(5, 5, CURRENT_DATE, 5, 2, '27R', CURRENT_DATE + TIME '08:45:00', NULL, CURRENT_DATE + TIME '16:50:00', NULL, 15, 'Late inbound aircraft arrival', 'SCHEDULED'),
(6, 6, CURRENT_DATE, 3, 5, '27L', CURRENT_DATE + TIME '14:20:00', NULL, CURRENT_DATE + TIME '16:35:00', NULL, 0, NULL, 'SCHEDULED');

SELECT setval('flight_schedules_log_log_id_seq', (SELECT MAX(log_id) FROM flight_schedules_log));

-- Seed Passengers
INSERT INTO passengers (passenger_id, user_id, first_name, last_name, passport_number, nationality, date_of_birth, gender, email, phone_number, frequent_flyer_number) VALUES
(1, 1, 'Rahul', 'Sharma', 'M4829104', 'Indian', '1992-05-14', 'M', 'passenger@ams.com', '+91-98200-11223', 'AI-GOLD-9921'),
(2, NULL, 'Ananya', 'Sen', 'P9920145', 'Indian', '1995-11-20', 'F', 'ananya.sen@gmail.com', '+91-98110-44556', NULL),
(3, NULL, 'David', 'Miller', 'US7781023', 'American', '1988-03-09', 'M', 'david.m@outlook.com', '+1-415-555-0199', 'EK-SKY-4412');

SELECT setval('passengers_passenger_id_seq', (SELECT MAX(passenger_id) FROM passengers));

-- Seed Bookings & Tickets
INSERT INTO bookings_tickets (ticket_id, ticket_number, passenger_id, flight_log_id, pnr, booking_date, fare_class, seat_number, base_fare, tax_and_surcharges, payment_status) VALUES
(1, '098-1234567890', 1, 2, 'AMS8X1', CURRENT_TIMESTAMP - INTERVAL '2 days', 'ECONOMY', '12A', 5200.00, 780.00, 'CONFIRMED'),
(2, '098-1234567891', 2, 2, 'AMS8X2', CURRENT_TIMESTAMP - INTERVAL '1 day', 'ECONOMY', '12B', 5200.00, 780.00, 'CONFIRMED'),
(3, '176-5544332211', 1, 1, 'AMS9Y4', CURRENT_TIMESTAMP - INTERVAL '5 days', 'BUSINESS', '04F', 48500.00, 6200.00, 'CONFIRMED');

SELECT setval('bookings_tickets_ticket_id_seq', (SELECT MAX(ticket_id) FROM bookings_tickets));

-- Seed Boarding Passes
INSERT INTO boarding_passes (boarding_pass_id, ticket_id, sequence_number, boarding_group, issue_timestamp, security_check_cleared, boarding_status, gate_scanned_at) VALUES
(1, 1, 24, 'ZONE_2', CURRENT_TIMESTAMP - INTERVAL '1 hour', TRUE, 'ISSUED', NULL),
(2, 3, 5, 'ZONE_1', CURRENT_TIMESTAMP - INTERVAL '3 hours', TRUE, 'BOARDED', CURRENT_TIMESTAMP - INTERVAL '2 hours');

SELECT setval('boarding_passes_boarding_pass_id_seq', (SELECT MAX(boarding_pass_id) FROM boarding_passes));

-- Seed Baggage
INSERT INTO baggage (baggage_id, ticket_id, bag_tag_number, weight_kg, allowed_weight_kg, excess_fee_paid, security_scan_result, baggage_status, arrival_carousel) VALUES
(1, 1, 'BAG-90214', 18.50, 15.00, 1750.00, 'PASSED', 'SORTED', 'Carousel 2'),
(2, 3, 'BAG-77312', 22.00, 30.00, 0.00, 'PASSED', 'LOADED_ON_AIRCRAFT', 'Carousel 5');

SELECT setval('baggage_baggage_id_seq', (SELECT MAX(baggage_id) FROM baggage));

-- Seed Crew & Staff
INSERT INTO crew_staff (staff_id, airline_id, employee_code, first_name, last_name, staff_role, license_number, duty_status, phone_number) VALUES
(1, 1, 'EMP-AI-101', 'Captain Rajesh', 'Verma', 'CAPTAIN', 'ATPL-IND-8821', 'ON_DUTY', '+91-98210-99881'),
(2, 1, 'EMP-AI-102', 'Sameer', 'Deshmukh', 'FIRST_OFFICER', 'CPL-IND-9410', 'ON_DUTY', '+91-98210-99882'),
(3, 1, 'EMP-AI-201', 'Sunita', 'Krishnan', 'CABIN_LEAD', 'CAB-IND-3321', 'ON_DUTY', '+91-98210-99883'),
(4, 2, 'EMP-6E-401', 'Neha', 'Kapoor', 'GATE_AGENT', 'STAFF-BOM-004', 'ON_DUTY', '+91-98210-99884');

SELECT setval('crew_staff_staff_id_seq', (SELECT MAX(staff_id) FROM crew_staff));

-- Seed Flight Crew Assignments
INSERT INTO flight_crew_assignments (assignment_id, flight_log_id, staff_id, assigned_role, shift_start_time, shift_end_time) VALUES
(1, 2, 1, 'Commander', CURRENT_DATE + TIME '05:00:00', CURRENT_DATE + TIME '10:00:00'),
(2, 2, 2, 'Co-Pilot', CURRENT_DATE + TIME '05:00:00', CURRENT_DATE + TIME '10:00:00'),
(3, 2, 3, 'Cabin Purser', CURRENT_DATE + TIME '05:15:00', CURRENT_DATE + TIME '09:30:00');

SELECT setval('flight_crew_assignments_assignment_id_seq', (SELECT MAX(assignment_id) FROM flight_crew_assignments));
