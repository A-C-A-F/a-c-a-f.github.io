-- Preserve activity without a label.
SELECT
  COALESCE(m.group_name, 'Unmapped')
    AS group_name,
  SUM(a.events) AS events
FROM activity_log a
LEFT JOIN label_lookup m
  ON a.placement = m.placement
GROUP BY
  COALESCE(m.group_name, 'Unmapped');
