-- 202608200000_trip_flights — M1 / A1.3
--
-- The route a trip is built on. The frame (start_date, end_date,
-- destination_cities, destination_country) is derived from these rows, so a
-- trip that came in through "I already booked the flight" never has dates that
-- disagree with its tickets.
--
-- dep_date/dep_time are two columns and not one datetime on purpose: a group
-- knows "4 Dec, lands 08:05" long before it knows what time it leaves, and both
-- times are wall clock at their own airport.

CREATE TABLE IF NOT EXISTS trip_flights (
    id          CHAR(36)    NOT NULL,
    trip_id     CHAR(36)    NOT NULL,
    seq         INT         NOT NULL DEFAULT 0,
    direction   VARCHAR(10) NOT NULL DEFAULT 'out',   -- out | inter | back
    mode        VARCHAR(10) NOT NULL DEFAULT 'flight',-- flight | ground
    airline     VARCHAR(60)          DEFAULT NULL,
    flight_no   VARCHAR(20)          DEFAULT NULL,
    dep_airport VARCHAR(4)  NOT NULL,
    arr_airport VARCHAR(4)  NOT NULL,
    dep_date    DATE                 DEFAULT NULL,
    dep_time    VARCHAR(5)           DEFAULT NULL,
    arr_date    DATE                 DEFAULT NULL,
    arr_time    VARCHAR(5)           DEFAULT NULL,
    raw_text    TEXT                 DEFAULT NULL,
    note        VARCHAR(255)         DEFAULT NULL,
    created_at  DATETIME(3)          DEFAULT NULL,
    updated_at  DATETIME(3)          DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_trip_flights_trip_id (trip_id)
);
