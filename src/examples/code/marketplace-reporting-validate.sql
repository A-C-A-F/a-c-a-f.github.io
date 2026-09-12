-- Return one data-driven record per validation check.
WITH click_source AS (
  SELECT placement_id, SUM(click_count) AS clicks
  FROM click_events
  GROUP BY placement_id
),
application_source AS (
  SELECT placement_id, SUM(application_count) AS applications
  FROM application_events
  GROUP BY placement_id
),
engagement_keys AS (
  SELECT placement_id FROM click_source
  UNION
  SELECT placement_id FROM application_source
),
source_engagement AS (
  SELECT
    k.placement_id,
    CASE
      WHEN c.placement_id IS NOT NULL AND a.placement_id IS NULL THEN 'Click only'
      WHEN c.placement_id IS NULL AND a.placement_id IS NOT NULL THEN 'Application only'
      ELSE 'Clicks and applications'
    END AS engagement_status
  FROM engagement_keys k
  LEFT JOIN click_source c ON c.placement_id = k.placement_id
  LEFT JOIN application_source a ON a.placement_id = k.placement_id
),
output_placement AS (
  SELECT
    placement_id,
    MIN(placement_clicks) AS output_clicks,
    MAX(placement_clicks) AS maximum_clicks,
    MIN(placement_applications) AS output_applications,
    MAX(placement_applications) AS maximum_applications,
    MIN(engagement_status) AS output_status,
    MAX(engagement_status) AS maximum_status
  FROM synthetic_reporting_output
  GROUP BY placement_id
),
click_reconciliation AS (
  SELECT
    COALESCE((SELECT SUM(click_count) FROM click_events), 0) AS input_total,
    COALESCE((SELECT SUM(output_clicks) FROM output_placement), 0) AS output_total,
    COALESCE((SELECT COUNT(*) FROM output_placement
      WHERE output_clicks <> maximum_clicks), 0) AS inconsistent_placements
),
application_reconciliation AS (
  SELECT
    COALESCE((SELECT SUM(application_count) FROM application_events), 0) AS input_total,
    COALESCE((SELECT SUM(output_applications) FROM output_placement), 0) AS output_total,
    COALESCE((SELECT COUNT(*) FROM output_placement
      WHERE output_applications <> maximum_applications), 0) AS inconsistent_placements
),
source_one_sided AS (
  SELECT placement_id, engagement_status
  FROM source_engagement
  WHERE engagement_status IN ('Click only', 'Application only')
),
output_one_sided AS (
  SELECT placement_id, output_status AS engagement_status
  FROM output_placement
  WHERE output_status = maximum_status
    AND output_status IN ('Click only', 'Application only')
),
one_sided_issues AS (
  SELECT s.placement_id
  FROM source_one_sided s
  LEFT JOIN output_one_sided o
    ON o.placement_id = s.placement_id
    AND o.engagement_status = s.engagement_status
  WHERE o.placement_id IS NULL
  UNION ALL
  SELECT o.placement_id
  FROM output_one_sided o
  LEFT JOIN source_one_sided s
    ON s.placement_id = o.placement_id
    AND s.engagement_status = o.engagement_status
  WHERE s.placement_id IS NULL
),
expected_sequence AS (
  SELECT
    order_id,
    customer_id,
    ROW_NUMBER() OVER (
      PARTITION BY customer_id
      ORDER BY completed_at, order_id
    ) AS expected_value
  FROM orders
  WHERE order_status = 'Completed'
),
output_order_sequence AS (
  SELECT
    order_id,
    customer_id,
    MIN(purchase_sequence) AS minimum_value,
    MAX(purchase_sequence) AS maximum_value,
    COUNT(DISTINCT purchase_sequence) AS value_count
  FROM synthetic_reporting_output
  GROUP BY order_id, customer_id
),
sequence_issues AS (
  SELECT e.order_id
  FROM expected_sequence e
  LEFT JOIN output_order_sequence o
    ON o.order_id = e.order_id AND o.customer_id = e.customer_id
  WHERE o.order_id IS NULL
    OR o.value_count <> 1
    OR o.minimum_value <> e.expected_value
    OR o.maximum_value <> e.expected_value
  UNION ALL
  SELECT o.order_id
  FROM output_order_sequence o
  LEFT JOIN expected_sequence e
    ON e.order_id = o.order_id AND e.customer_id = o.customer_id
  WHERE e.order_id IS NULL AND o.value_count > 0
  UNION ALL
  SELECT customer_id
  FROM output_order_sequence
  WHERE value_count > 0
  GROUP BY customer_id, minimum_value
  HAVING COUNT(*) > 1
),
unmatched_mappings AS (
  SELECT COUNT(DISTINCT placement_id) AS issue_count
  FROM synthetic_reporting_output
  WHERE mapping_status = 'Review unmatched mapping'
),
repeated_measures AS (
  SELECT COUNT(*) AS issue_count
  FROM (
    SELECT placement_id
    FROM synthetic_reporting_output
    WHERE placement_clicks + placement_applications > 0
    GROUP BY placement_id
    HAVING COUNT(*) > 1
  ) repeated
),
checks AS (
  SELECT 1 AS check_order, 'Mapping key uniqueness' AS check_name,
    'No duplicate placement mappings' AS expected_condition,
    CAST(COUNT(*) AS TEXT) || ' duplicates' AS synthetic_result,
    CASE WHEN COUNT(*) = 0 THEN 'Pass' ELSE 'Review' END AS state
  FROM (
    SELECT placement_id FROM placement_groups
    GROUP BY placement_id HAVING COUNT(*) > 1
  ) duplicates

  UNION ALL
  SELECT 2, 'Base-to-final rows', 'Equal row totals',
    (SELECT COUNT(*) FROM order_lines) || ' base / ' ||
      (SELECT COUNT(*) FROM synthetic_reporting_output) || ' final',
    CASE WHEN (SELECT COUNT(*) FROM order_lines) =
      (SELECT COUNT(*) FROM synthetic_reporting_output) THEN 'Pass' ELSE 'Review' END

  UNION ALL
  SELECT 3, 'Click reconciliation', 'Input equals placement output',
    input_total || ' input / ' || output_total || ' output',
    CASE WHEN input_total = output_total AND inconsistent_placements = 0
      THEN 'Pass' ELSE 'Review' END
  FROM click_reconciliation

  UNION ALL
  SELECT 4, 'Application reconciliation', 'Input equals placement output',
    input_total || ' input / ' || output_total || ' output',
    CASE WHEN input_total = output_total AND inconsistent_placements = 0
      THEN 'Pass' ELSE 'Review' END
  FROM application_reconciliation

  UNION ALL
  SELECT 5, 'One-sided activity', 'Source populations remain visible',
    (SELECT COUNT(*) FROM output_one_sided WHERE engagement_status = 'Click only') ||
      ' click-only / ' || (SELECT COUNT(*) FROM output_one_sided
      WHERE engagement_status = 'Application only') || ' application-only',
    CASE WHEN (SELECT COUNT(*) FROM one_sided_issues) = 0
      THEN 'Pass' ELSE 'Review' END

  UNION ALL
  SELECT 6, 'Unmatched mappings', 'Retained for review',
    issue_count || CASE WHEN issue_count = 1 THEN ' placement' ELSE ' placements' END,
    CASE WHEN issue_count > 0 THEN 'Review' ELSE 'Pass' END
  FROM unmatched_mappings

  UNION ALL
  SELECT 7, 'Purchase sequence',
    'Completed orders follow deterministic chronological sequence',
    (SELECT COUNT(*) FROM expected_sequence) || ' completed orders checked',
    CASE WHEN (SELECT COUNT(*) FROM sequence_issues) = 0
      THEN 'Pass' ELSE 'Review' END

  UNION ALL
  SELECT 8, 'Repeated placement measures', 'Flag non-additive line detail',
    issue_count || CASE WHEN issue_count = 1 THEN ' repeated placement'
      ELSE ' repeated placements' END,
    CASE WHEN issue_count > 0 THEN 'Review' ELSE 'Pass' END
  FROM repeated_measures
)
SELECT check_name, expected_condition, synthetic_result, state
FROM checks
ORDER BY check_order;