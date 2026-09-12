# Independent clean-room example created for this portfolio.
# All records, fields, rules, thresholds, owner labels, and outputs are fictional.

previous_cycle <- data.frame(
  record_id = c("Record 101", "Record 102", "Record 103", "Record 104", "Record 105"),
  owner_group = c("Service team", "Service team", "Support team", "Support team", "Service team"),
  category = c("Group A", "", "Group B", "Group C", "Group D"),
  status = c("Active", "Active", "Paused", "Active", "Active"),
  quality_score = c(84, 72, 108, 65, 91),
  review_date = c("2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"),
  stringsAsFactors = FALSE
)

current_cycle <- data.frame(
  record_id = c("Record 101", "Record 102", "Record 103", "Record 104", "Record 105"),
  owner_group = c("Service team", "Service team", "Support team", "Support team", "Service team"),
  category = c("Group A", "Group B", "Group B", "Group C", "Group D"),
  status = c("Active", "Active", "Paused", "Pending", "Active"),
  quality_score = c(84, 72, 108, 65, 91),
  review_date = c("2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "not-a-date"),
  stringsAsFactors = FALSE
)

rules <- list(
  list(
    id = "record_id_unique",
    label = "Record identifier is unique",
    owner_route = "Data stewardship",
    failure_message = "Record identifier is duplicated",
    evaluate = function(data) {
      !duplicated(data$record_id) & !duplicated(data$record_id, fromLast = TRUE)
    }
  ),
  list(
    id = "category_present",
    label = "Category is present",
    owner_route = "Operations review",
    failure_message = "Category is missing",
    evaluate = function(data) nzchar(trimws(data$category))
  ),
  list(
    id = "status_allowed",
    label = "Status uses the configured set",
    owner_route = "Process owner",
    failure_message = "Status is outside the configured set",
    evaluate = function(data) data$status %in% c("Active", "Paused")
  ),
  list(
    id = "quality_score_range",
    label = "Quality score is within 0–100",
    owner_route = "Data stewardship",
    failure_message = "Quality score is outside the configured range",
    evaluate = function(data) data$quality_score >= 0 & data$quality_score <= 100
  ),
  list(
    id = "review_date_valid",
    label = "Review date is valid",
    owner_route = "Data stewardship",
    failure_message = "Review date is not a valid date",
    evaluate = function(data) {
      !is.na(suppressWarnings(as.Date(data$review_date, format = "%Y-%m-%d")))
    }
  )
)

evaluate_rule <- function(data, rule) {
  passed <- as.logical(rule$evaluate(data))
  if (length(passed) != nrow(data)) stop("Each rule must return one result per record.")
  passed[is.na(passed)] <- FALSE

  list(
    summary = data.frame(
      rule_id = rule$id,
      rule = rule$label,
      state = if (all(passed)) "PASS" else "FAIL",
      failed_records = sum(!passed),
      pass_rate = sprintf("%.0f%%", mean(passed) * 100),
      stringsAsFactors = FALSE
    ),
    exceptions = data.frame(
      record_id = data$record_id[!passed],
      rule_id = rep(rule$id, sum(!passed)),
      rule = rep(rule$label, sum(!passed)),
      finding = rep(rule$failure_message, sum(!passed)),
      owner_route = rep(rule$owner_route, sum(!passed)),
      stringsAsFactors = FALSE
    )
  )
}

run_audit <- function(data, rules) {
  evaluated <- lapply(rules, function(rule) evaluate_rule(data, rule))
  summaries <- do.call(rbind, lapply(evaluated, `[[`, "summary"))
  exception_sets <- lapply(evaluated, `[[`, "exceptions")
  exceptions <- do.call(rbind, exception_sets)

  if (is.null(exceptions)) {
    exceptions <- data.frame(
      record_id = character(),
      rule_id = character(),
      rule = character(),
      finding = character(),
      owner_route = character()
    )
  }

  list(summary = summaries, exceptions = exceptions)
}

# ---- Compare audit cycles ----

compare_cycles <- function(previous_exceptions, current_exceptions) {
  make_key <- function(data) paste(data$record_id, data$rule_id, sep = "::")
  previous_keys <- make_key(previous_exceptions)
  current_keys <- make_key(current_exceptions)
  all_keys <- sort(unique(c(previous_keys, current_keys)))
  reference <- rbind(previous_exceptions, current_exceptions)
  reference_keys <- make_key(reference)
  positions <- match(all_keys, reference_keys)

  data.frame(
    record_id = reference$record_id[positions],
    finding = reference$finding[positions],
    previous_cycle = ifelse(all_keys %in% previous_keys, "Present", "Absent"),
    current_cycle = ifelse(all_keys %in% current_keys, "Present", "Absent"),
    classification = ifelse(
      all_keys %in% previous_keys & all_keys %in% current_keys,
      "Unresolved",
      ifelse(all_keys %in% previous_keys, "Corrected", "Newly detected")
    ),
    owner_route = reference$owner_route[positions],
    stringsAsFactors = FALSE
  )
}

previous_audit <- run_audit(previous_cycle, rules)
current_audit <- run_audit(current_cycle, rules)
cycle_comparison <- compare_cycles(
  previous_audit$exceptions,
  current_audit$exceptions
)

# Presentation views retain human-readable labels and the website's column order.
# Internal rule identifiers remain available for audit keys and cycle comparison.
rule_summary_view <- data.frame(
  "Configured rule" = current_audit$summary$rule,
  "State" = current_audit$summary$state,
  "Failed records" = paste(current_audit$summary$failed_records, "of", nrow(current_cycle)),
  "Pass rate" = current_audit$summary$pass_rate,
  check.names = FALSE,
  stringsAsFactors = FALSE
)

ordered_exceptions <- current_audit$exceptions[
  order(current_audit$exceptions$record_id, current_audit$exceptions$rule_id),
  ,
  drop = FALSE
]
current_exceptions_view <- data.frame(
  "Record" = ordered_exceptions$record_id,
  "Rule" = ordered_exceptions$rule,
  "Finding" = ordered_exceptions$finding,
  "Fictional owner route" = ordered_exceptions$owner_route,
  check.names = FALSE,
  stringsAsFactors = FALSE
)

cycle_comparison_view <- data.frame(
  "Record" = cycle_comparison$record_id,
  "Finding" = cycle_comparison$finding,
  "Prior cycle" = cycle_comparison$previous_cycle,
  "Current cycle" = cycle_comparison$current_cycle,
  "Classification" = cycle_comparison$classification,
  check.names = FALSE,
  stringsAsFactors = FALSE
)

# Exact expected fictional views: assertions fail if labels, order, or results drift.
expected_rule_summary <- data.frame(
  "Configured rule" = c(
    "Record identifier is unique", "Category is present",
    "Status uses the configured set", "Quality score is within 0–100",
    "Review date is valid"
  ),
  "State" = c("PASS", "PASS", "FAIL", "FAIL", "FAIL"),
  "Failed records" = c("0 of 5", "0 of 5", "1 of 5", "1 of 5", "1 of 5"),
  "Pass rate" = c("100%", "100%", "80%", "80%", "80%"),
  check.names = FALSE,
  stringsAsFactors = FALSE
)

expected_current_exceptions <- data.frame(
  "Record" = c("Record 103", "Record 104", "Record 105"),
  "Rule" = c(
    "Quality score is within 0–100", "Status uses the configured set",
    "Review date is valid"
  ),
  "Finding" = c(
    "Quality score is outside the configured range",
    "Status is outside the configured set",
    "Review date is not a valid date"
  ),
  "Fictional owner route" = c("Data stewardship", "Process owner", "Data stewardship"),
  check.names = FALSE,
  stringsAsFactors = FALSE
)

expected_cycle_comparison <- data.frame(
  "Record" = c("Record 102", "Record 103", "Record 104", "Record 105"),
  "Finding" = c(
    "Category is missing", "Quality score is outside the configured range",
    "Status is outside the configured set", "Review date is not a valid date"
  ),
  "Prior cycle" = c("Present", "Present", "Absent", "Absent"),
  "Current cycle" = c("Absent", "Present", "Present", "Present"),
  "Classification" = c("Corrected", "Unresolved", "Newly detected", "Newly detected"),
  check.names = FALSE,
  stringsAsFactors = FALSE
)

stopifnot(
  "Rule summary differs from the approved fictional table" =
    identical(rule_summary_view, expected_rule_summary),
  "Current exceptions differ from the approved fictional table" =
    identical(current_exceptions_view, expected_current_exceptions),
  "Cycle comparison differs from the approved fictional table" =
    identical(cycle_comparison_view, expected_cycle_comparison)
)

print(rule_summary_view, row.names = FALSE)
print(current_exceptions_view, row.names = FALSE)
print(cycle_comparison_view, row.names = FALSE)

# This audit reports configured findings. It does not modify either source dataset.
