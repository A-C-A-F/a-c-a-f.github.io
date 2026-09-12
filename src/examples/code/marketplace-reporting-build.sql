-- Synthetic output grain: one row per fictional order line.
-- Engagement is summarized at placement level and remains non-additive on line rows.
CREATE TEMP VIEW synthetic_reporting_output AS
WITH completed_purchase_sequence AS (
  SELECT
    order_id,
    ROW_NUMBER() OVER (
      PARTITION BY customer_id
      ORDER BY completed_at, order_id
    ) AS purchase_sequence
  FROM orders
  WHERE order_status = 'Completed'
),
mapping_profile AS (
  SELECT
    placement_id,
    MIN(group_name) AS candidate_group,
    COUNT(*) AS mapping_rows
  FROM placement_groups
  GROUP BY placement_id
),
validated_groups AS (
  SELECT placement_id, candidate_group AS group_name
  FROM mapping_profile
  WHERE mapping_rows = 1
),
clicks_by_placement AS (
  SELECT placement_id, SUM(click_count) AS clicks
  FROM click_events
  GROUP BY placement_id
),
applications_by_placement AS (
  SELECT placement_id, SUM(application_count) AS applications
  FROM application_events
  GROUP BY placement_id
),
engagement_keys AS (
  SELECT placement_id FROM clicks_by_placement
  UNION
  SELECT placement_id FROM applications_by_placement
),
engagement_by_placement AS (
  SELECT
    k.placement_id,
    COALESCE(c.clicks, 0) AS clicks,
    COALESCE(a.applications, 0) AS applications,
    CASE
      WHEN c.placement_id IS NOT NULL AND a.placement_id IS NULL THEN 'Click only'
      WHEN c.placement_id IS NULL AND a.placement_id IS NOT NULL THEN 'Application only'
      ELSE 'Clicks and applications'
    END AS engagement_status
  FROM engagement_keys k
  LEFT JOIN clicks_by_placement c ON c.placement_id = k.placement_id
  LEFT JOIN applications_by_placement a ON a.placement_id = k.placement_id
),
reporting_base AS (
  SELECT
    l.line_id,
    o.order_id,
    o.customer_id,
    x.customer_label,
    l.placement_id,
    p.placement_label,
    s.purchase_sequence
  FROM order_lines l
  JOIN orders o ON o.order_id = l.order_id
  LEFT JOIN customer_context x ON x.customer_id = o.customer_id
  LEFT JOIN placements p ON p.placement_id = l.placement_id
  LEFT JOIN completed_purchase_sequence s ON s.order_id = o.order_id
)
SELECT
  b.*,
  g.group_name,
  COALESCE(e.clicks, 0) AS placement_clicks,
  COALESCE(e.applications, 0) AS placement_applications,
  COALESCE(e.engagement_status, 'No engagement') AS engagement_status,
  CASE
    WHEN m.placement_id IS NULL THEN 'Review unmatched mapping'
    WHEN m.mapping_rows > 1 THEN 'Review duplicate mapping'
    ELSE 'Mapped'
  END AS mapping_status,
  'Placement measure - do not sum across line rows' AS measure_note
FROM reporting_base b
LEFT JOIN mapping_profile m ON m.placement_id = b.placement_id
LEFT JOIN validated_groups g ON g.placement_id = b.placement_id
LEFT JOIN engagement_by_placement e ON e.placement_id = b.placement_id;
