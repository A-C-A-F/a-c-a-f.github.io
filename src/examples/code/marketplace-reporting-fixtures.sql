-- Clean-room fixtures for the public synthetic demonstration only.
CREATE TABLE orders (
  order_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  completed_at TEXT,
  order_status TEXT NOT NULL
);

CREATE TABLE order_lines (
  line_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  placement_id TEXT NOT NULL
);

CREATE TABLE placements (
  placement_id TEXT PRIMARY KEY,
  placement_label TEXT NOT NULL
);

CREATE TABLE customer_context (
  customer_id TEXT PRIMARY KEY,
  customer_label TEXT NOT NULL
);

CREATE TABLE placement_groups (
  placement_id TEXT NOT NULL,
  group_name TEXT NOT NULL
);

CREATE TABLE click_events (
  placement_id TEXT NOT NULL,
  click_count INTEGER NOT NULL
);

CREATE TABLE application_events (
  placement_id TEXT NOT NULL,
  application_count INTEGER NOT NULL
);

INSERT INTO orders VALUES
  ('Order A', 'Customer North', '2026-01-05 09:00', 'Completed'),
  ('Order B', 'Customer North', '2026-01-05 09:00', 'Completed'),
  ('Order C', 'Customer South', '2026-01-08 08:00', 'Completed'),
  ('Order D', 'Customer South', NULL, 'Pending'),
  ('Order E', 'Customer North', '2026-01-09 08:00', 'Completed');

INSERT INTO order_lines VALUES
  ('Line A1', 'Order A', 'Placement Pine'),
  ('Line B1', 'Order B', 'Placement Elm'),
  ('Line C1', 'Order C', 'Placement Reed'),
  ('Line D1', 'Order D', 'Placement Birch'),
  ('Line E1', 'Order E', 'Placement Pine');

INSERT INTO placements VALUES
  ('Placement Pine', 'Placement Pine'),
  ('Placement Elm', 'Placement Elm'),
  ('Placement Reed', 'Placement Reed'),
  ('Placement Birch', 'Placement Birch');

INSERT INTO customer_context VALUES
  ('Customer North', 'Customer North'),
  ('Customer South', 'Customer South');

INSERT INTO placement_groups VALUES
  ('Placement Pine', 'Group One'),
  ('Placement Elm', 'Group Two'),
  ('Placement Birch', 'Group Three');

INSERT INTO click_events VALUES
  ('Placement Pine', 4),
  ('Placement Elm', 3);

INSERT INTO application_events VALUES
  ('Placement Pine', 2),
  ('Placement Reed', 2);
